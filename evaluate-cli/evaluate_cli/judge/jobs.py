"""Eval judge async worker — GET context, run DeepEval, PATCH result."""

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

import requests

from evaluate_cli.judge.metrics import score_pairwise_dimension, score_variant_dimension

DEFAULT_API_URL = "http://127.0.0.1:8787"


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
    response = requests.request(method, url, auth=_auth(), timeout=120, **kwargs)
    response.raise_for_status()
    return response


def run_async_judge_job(job_id: str, api_url: str | None = None) -> None:
    _request("PATCH", f"/internal-api/eval-judge/jobs/{job_id}", api_url, json={"status": "running"})

    try:
        context = _request("GET", f"/internal-api/eval-judge/jobs/{job_id}", api_url).json()
        result, summary = evaluate_judge_context(context)
        _request(
            "PATCH",
            f"/internal-api/eval-judge/jobs/{job_id}",
            api_url,
            json={"status": "done", "result": result, "summary_metrics": summary},
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


def evaluate_judge_context(context: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    transcripts = context.get("transcripts") or []
    if len(transcripts) < 2:
        raise RuntimeError("At least two transcripts are required")

    dimensions = context.get("dimensions") or []
    variant_results = []
    for entry in transcripts:
        per_dimension: dict[str, Any] = {}
        for dimension in dimensions:
            if dimension.get("scope") != "variant":
                continue
            scored = score_variant_dimension(entry["transcript"], dimension, context)
            per_dimension[dimension["id"]] = {
                "label": dimension.get("label"),
                "score": scored.score,
                "reason": scored.reason,
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
