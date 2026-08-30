"""Eval judge async worker — GET context, run DeepEval, PATCH result."""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any

import requests
from openkms_cli.core.settings import get_cli_settings
from openkms_cli.pipeline.storage import get_s3_client

from evaluate_cli.judge.metrics import (
    score_error_rate_dimension,
    score_pairwise_dimension,
    score_variant_dimension,
    score_variant_vs_gt_dimension,
)
from evaluate_cli.judge.transcript_text import extract_transcript_plain_text

DEFAULT_API_URL = "http://127.0.0.1:8787"
# Judge LLM calls can be slow; internal API GET/PATCH should stay fast (presigned transcript URLs).
API_TIMEOUT_SECONDS = 120
TRANSCRIPT_FETCH_TIMEOUT_SECONDS = 300


def _api_url(explicit: str | None) -> str:
    return (explicit or os.getenv("OPENKMS_API_URL") or DEFAULT_API_URL).rstrip("/")


def _auth() -> tuple[str, str]:
    user = os.getenv("OPENKMS_CLI_BASIC_USER", "")
    password = os.getenv("OPENKMS_CLI_BASIC_PASSWORD", "")
    if not user or not password:
        raise RuntimeError("OPENKMS_CLI_BASIC_USER and OPENKMS_CLI_BASIC_PASSWORD are required")
    return user, password


def _request(method: str, path: str, api_url: str | None, **kwargs: Any) -> requests.Response:
    url = f"{_api_url(api_url)}{path}"
    response = requests.request(
        method,
        url,
        auth=_auth(),
        timeout=kwargs.pop("timeout", API_TIMEOUT_SECONDS),
        **kwargs,
    )
    if not response.ok:
        detail = response.text.strip()
        try:
            payload = response.json()
            if isinstance(payload, dict):
                error = payload.get("error")
                if isinstance(error, str) and error.strip():
                    detail = error.strip()
        except Exception:
            pass
        raise RuntimeError(
            f"{method} {path} failed ({response.status_code}): {detail[:2000] or response.reason}"
        )
    return response


def _load_transcript_text(entry: dict[str, Any]) -> str:
    transcript_url = entry.get("transcript_url")
    if isinstance(transcript_url, str) and transcript_url.strip():
        response = requests.get(transcript_url.strip(), timeout=TRANSCRIPT_FETCH_TIMEOUT_SECONDS)
        response.raise_for_status()
        return response.text

    # Legacy inline payload (local dev only — avoid on Vercel).
    transcript = entry.get("transcript")
    if isinstance(transcript, str) and transcript.strip():
        return transcript

    variant_id = entry.get("variant_id")
    raise RuntimeError(f"Missing transcript_url for variant {variant_id or 'unknown'}")


def _upload_judge_result(context: dict[str, Any], result: dict[str, Any]) -> None:
    bucket = context.get("bucket")
    artifact_keys = context.get("artifact_keys") or {}
    result_key = artifact_keys.get("result")
    if not isinstance(bucket, str) or not bucket.strip():
        raise RuntimeError("Missing bucket in judge job context")
    if not isinstance(result_key, str) or not result_key.strip():
        raise RuntimeError("Missing artifact_keys.result in judge job context")

    cfg = get_cli_settings()
    if not cfg.aws_access_key_id or not cfg.aws_secret_access_key:
        raise RuntimeError(
            "AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required to upload judge results"
        )

    client = get_s3_client(
        cfg.aws_endpoint_url or None,
        cfg.aws_access_key_id,
        cfg.aws_secret_access_key,
        cfg.aws_region,
    )
    client.put_object(
        Bucket=bucket.strip(),
        Key=result_key.strip(),
        Body=json.dumps(result, ensure_ascii=False, indent=2).encode("utf-8"),
        ContentType="application/json",
    )


def run_async_judge_job(job_id: str, api_url: str | None = None) -> None:
    _request("PATCH", f"/internal-api/eval-judge/jobs/{job_id}", api_url, json={"status": "running"})

    try:
        context = _request("GET", f"/internal-api/eval-judge/jobs/{job_id}", api_url).json()
        result, summary = evaluate_judge_context(context)
        _upload_judge_result(context, result)
        _request(
            "PATCH",
            f"/internal-api/eval-judge/jobs/{job_id}",
            api_url,
            json={"status": "done", "summary_metrics": summary},
        )
    except Exception as exc:  # noqa: BLE001 — worker terminal PATCH
        message = str(exc) or exc.__class__.__name__
        _request(
            "PATCH",
            f"/internal-api/eval-judge/jobs/{job_id}",
            api_url,
            json={"status": "failed", "error_message": message[:2000]},
        )
        raise


def _load_reference_text(context: dict[str, Any]) -> str:
    reference = context.get("reference")
    if isinstance(reference, str) and reference.strip():
        return reference

    reference_url = context.get("reference_url")
    if isinstance(reference_url, str) and reference_url.strip():
        response = requests.get(reference_url.strip(), timeout=TRANSCRIPT_FETCH_TIMEOUT_SECONDS)
        response.raise_for_status()
        return response.text

    raise RuntimeError("Missing reference or reference_url in judge job context")


def evaluate_judge_context(context: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    raw_transcripts = context.get("transcripts") or []
    transcripts = []
    for entry in raw_transcripts:
        if not isinstance(entry, dict):
            continue
        raw_text = _load_transcript_text(entry)
        transcripts.append({**entry, "transcript": extract_transcript_plain_text(raw_text)})

    min_variants = int(context.get("min_variants") or 2)
    if len(transcripts) < min_variants:
        raise RuntimeError(f"At least {min_variants} transcripts are required")

    requires_gt = bool(context.get("requires_ground_truth"))
    reference_text = _load_reference_text(context) if requires_gt else None

    dimensions = context.get("dimensions") or []
    variant_results = []
    for entry in transcripts:
        per_dimension: dict[str, Any] = {}
        for dimension in dimensions:
            scope = dimension.get("scope")
            if scope == "variant_vs_gt":
                if reference_text is None:
                    raise RuntimeError("Ground-truth reference is required for variant_vs_gt dimensions")
                kind = dimension.get("kind", "geval_score")
                if kind in {"cer_score", "wer_score"}:
                    scored = score_error_rate_dimension(reference_text, entry["transcript"], dimension)
                else:
                    scored = score_variant_vs_gt_dimension(
                        reference_text, entry["transcript"], dimension, context
                    )
            elif scope == "variant":
                scored = score_variant_dimension(entry["transcript"], dimension, context)
            else:
                continue
            per_dimension[dimension["id"]] = {
                "label": dimension.get("label"),
                "kind": dimension.get("kind"),
                "score": scored.score,
                "score_max": scored.score_max,
                "lower_is_better": scored.lower_is_better,
                "reason": scored.reason,
                "pass_threshold": dimension.get("pass_threshold"),
            }
        variant_results.append(
            {
                "variant_id": entry["variant_id"],
                "display_name": entry["display_name"],
                "pipeline_name": entry["pipeline_name"],
                "per_dimension": per_dimension,
            }
        )

    pairwise: dict[str, Any] = {}
    if not requires_gt and len(transcripts) >= 2:
        left = transcripts[0]
        right = transcripts[1]
        for dimension in dimensions:
            if dimension.get("scope") != "pairwise":
                continue
            scored = score_pairwise_dimension(left["transcript"], right["transcript"], dimension, context)
            payload: dict[str, Any] = {
                "label": dimension.get("label"),
                "reason": scored.reason,
            }
            if dimension.get("kind") == "geval_winner":
                winner_key = scored.winner
                winner_variant_id = None
                if winner_key == "a":
                    winner_variant_id = left["variant_id"]
                elif winner_key == "b":
                    winner_variant_id = right["variant_id"]
                payload["winner"] = winner_key
                payload["winner_variant_id"] = winner_variant_id
            else:
                payload["score"] = scored.score
                payload["score_max"] = scored.score_max
            pairwise[dimension["id"]] = payload

    result = {
        "scenario_id": context.get("scenario_id"),
        "dataset_item_id": context.get("dataset_item_id"),
        "dataset_item_name": context.get("dataset_item_name"),
        "judged_at": datetime.now(timezone.utc).isoformat(),
        "variants": variant_results,
        "pairwise": pairwise,
    }

    summary = {
        "dataset_item_id": context.get("dataset_item_id"),
        "pairwise": pairwise,
        "variant_scores": {
            row["variant_id"]: row["per_dimension"] for row in variant_results
        },
    }
    return result, summary
