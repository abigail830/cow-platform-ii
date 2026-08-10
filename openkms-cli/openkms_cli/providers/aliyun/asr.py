"""Aliyun DashScope Qwen-Audio file transcription."""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

import requests

DASHSCOPE_TRANSCRIPTION_PATH = "/services/audio/asr/transcription"
DEFAULT_MODEL = "qwen-audio-3.0-asr-flash-filetrans"


class AliyunAsrError(RuntimeError):
    """Raised when DashScope ASR API fails."""


def _headers(api_key: str, *, async_mode: bool = False) -> dict[str, str]:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    if async_mode:
        headers["X-DashScope-Async"] = "enable"
    return headers


def submit_file_transcription(
    *,
    file_url: str,
    api_key: str,
    base_url: str,
    model: str = DEFAULT_MODEL,
    enable_diarization: bool = False,
    context_prompt: str | None = None,
    timeout: int = 120,
) -> str:
    if not api_key.strip():
        raise AliyunAsrError("DASHSCOPE_API_KEY is required for Qwen-Audio transcription")

    parameters: dict[str, Any] = {}
    if enable_diarization:
        parameters["enable_diarization"] = True
    if context_prompt and context_prompt.strip():
        parameters["prompt"] = context_prompt.strip()

    payload: dict[str, Any] = {
        "model": model,
        "input": {"file_urls": [file_url]},
    }
    if parameters:
        payload["parameters"] = parameters

    url = f"{base_url.rstrip('/')}{DASHSCOPE_TRANSCRIPTION_PATH}"
    try:
        response = requests.post(url, headers=_headers(api_key, async_mode=True), json=payload, timeout=timeout)
    except requests.RequestException as e:
        raise AliyunAsrError(f"ASR submit request failed: {e}") from e

    data = _parse_json_response(response, "ASR submit")
    output = data.get("output") if isinstance(data, dict) else None
    task_id = None
    if isinstance(output, dict):
        task_id = output.get("task_id") or output.get("taskId")
    if not task_id:
        raise AliyunAsrError(f"ASR submit returned no task_id: {json.dumps(data)[:500]}")
    return str(task_id)


def query_transcription_task(
    *,
    task_id: str,
    api_key: str,
    base_url: str,
    timeout: int = 60,
) -> dict[str, Any]:
    url = f"{base_url.rstrip('/')}/tasks/{task_id}"
    try:
        response = requests.get(url, headers=_headers(api_key), timeout=timeout)
    except requests.RequestException as e:
        raise AliyunAsrError(f"ASR task query failed: {e}") from e
    return _parse_json_response(response, "ASR task query")


def wait_for_transcription(
    *,
    task_id: str,
    api_key: str,
    base_url: str,
    poll_interval_seconds: int = 8,
    max_wait_seconds: int = 7200,
) -> dict[str, Any]:
    deadline = time.time() + max_wait_seconds
    while time.time() < deadline:
        data = query_transcription_task(task_id=task_id, api_key=api_key, base_url=base_url)
        output = data.get("output") if isinstance(data, dict) else None
        status = ""
        if isinstance(output, dict):
            status = str(output.get("task_status") or output.get("status") or "").upper()
        if status in {"SUCCEEDED", "SUCCESS", "COMPLETED"}:
            return data
        if status in {"FAILED", "CANCELED", "CANCELLED"}:
            message = ""
            if isinstance(output, dict):
                message = str(output.get("message") or output.get("code") or "")
            raise AliyunAsrError(f"ASR task failed ({status}): {message or json.dumps(data)[:500]}")
        time.sleep(poll_interval_seconds)
    raise AliyunAsrError(f"ASR task timed out after {max_wait_seconds}s (task_id={task_id})")


def resolve_asr_transcription_payload(task_response: dict[str, Any]) -> dict[str, Any]:
    """Return transcript payload with `transcripts[]`, downloading URL-backed results when needed."""
    if not isinstance(task_response, dict):
        return {}

    if isinstance(task_response.get("transcripts"), list):
        return task_response

    output = task_response.get("output")
    if isinstance(output, dict) and isinstance(output.get("transcripts"), list):
        return output

    urls = _collect_transcription_urls(task_response)
    if not urls:
        return task_response

    payloads = [_download_transcription_json(url) for url in urls]
    if len(payloads) == 1:
        return payloads[0]

    merged: list[dict[str, Any]] = []
    for payload in payloads:
        tracks = payload.get("transcripts")
        if isinstance(tracks, list):
            merged.extend(item for item in tracks if isinstance(item, dict))
    if merged:
        return {"transcripts": merged}
    return payloads[0] if payloads else task_response


def _collect_transcription_urls(task_response: dict[str, Any]) -> list[str]:
    urls: list[str] = []
    output = task_response.get("output")
    if not isinstance(output, dict):
        return urls

    result = output.get("result")
    if isinstance(result, dict):
        url = result.get("transcription_url")
        if isinstance(url, str) and url.strip():
            urls.append(url.strip())

    results = output.get("results")
    if isinstance(results, list):
        for item in results:
            if not isinstance(item, dict):
                continue
            url = item.get("transcription_url")
            if isinstance(url, str) and url.strip():
                urls.append(url.strip())
    return urls


def _download_transcription_json(url: str) -> dict[str, Any]:
    try:
        response = requests.get(url, timeout=120)
    except requests.RequestException as e:
        raise AliyunAsrError(f"ASR transcription download failed: {e}") from e
    return _parse_json_response(response, "ASR transcription download")


def _parse_json_response(response: requests.Response, label: str) -> dict[str, Any]:
    try:
        data = response.json()
    except ValueError as e:
        raise AliyunAsrError(f"{label} returned non-JSON ({response.status_code}): {response.text[:500]}") from e
    if response.status_code >= 400:
        raise AliyunAsrError(f"{label} failed ({response.status_code}): {json.dumps(data)[:500]}")
    if not isinstance(data, dict):
        raise AliyunAsrError(f"{label} returned unexpected payload: {data!r}")
    return data


def _format_timestamp_ms(ms: int | float | None) -> str:
    if ms is None:
        return "00:00:00"
    total_sec = max(int(ms) // 1000, 0)
    hours, rem = divmod(total_sec, 3600)
    minutes, seconds = divmod(rem, 60)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}"


def _speaker_label(raw: Any) -> str:
    if raw is None:
        return "Speaker"
    text = str(raw).strip()
    if not text:
        return "Speaker"
    if text.isdigit():
        return f"Speaker {int(text) + 1}"
    return text


def format_transcript_markdown(
    *,
    filename: str,
    asr_result: dict[str, Any],
    model: str,
) -> str:
    output = asr_result.get("output") if isinstance(asr_result, dict) else None
    if not isinstance(output, dict):
        output = asr_result

    sentences = _extract_sentences(output)
    language = _extract_language(output)
    speaker_ids = {
        s.get("speaker") if s.get("speaker") is not None else s.get("speaker_id")
        for s in sentences
        if s.get("speaker") is not None or s.get("speaker_id") is not None
    }
    speaker_count = len(speaker_ids)

    lines = [
        f"# {filename}",
        "",
        f"- ASR: {model}",
    ]
    if language:
        lines.append(f"- Language: {language}")
    if speaker_count > 0:
        lines.append(f"- Speakers: {speaker_count}")
    lines.append("")

    if not sentences:
        plain = _extract_plain_text(output)
        if plain:
            lines.append(plain)
        else:
            lines.append("_No transcript text returned by ASR provider._")
        return "\n".join(lines).strip() + "\n"

    for item in sentences:
        ts = _format_timestamp_ms(item.get("begin_time") or item.get("start_time") or item.get("start"))
        speaker = _speaker_label(item.get("speaker") if item.get("speaker") is not None else item.get("speaker_id"))
        text = str(item.get("text") or item.get("content") or "").strip()
        if not text:
            continue
        lines.append(f"## [{ts}] {speaker}")
        lines.append(text)
        lines.append("")

    return "\n".join(lines).strip() + "\n"


def _extract_sentences(output: dict[str, Any]) -> list[dict[str, Any]]:
    transcripts = output.get("transcripts")
    if isinstance(transcripts, list):
        merged: list[dict[str, Any]] = []
        for track in transcripts:
            if not isinstance(track, dict):
                continue
            sentences = track.get("sentences")
            if isinstance(sentences, list):
                merged.extend(item for item in sentences if isinstance(item, dict))
        if merged:
            return merged

    for key in ("sentences", "segments", "utterances", "results"):
        value = output.get(key)
        if isinstance(value, list) and value:
            normalized: list[dict[str, Any]] = []
            for item in value:
                if isinstance(item, dict):
                    normalized.append(item)
            if normalized:
                return normalized

    result = output.get("result")
    if isinstance(result, dict):
        for key in ("sentences", "segments", "utterances"):
            value = result.get(key)
            if isinstance(value, list) and value:
                return [item for item in value if isinstance(item, dict)]

    transcription = output.get("transcription")
    if isinstance(transcription, dict):
        for key in ("sentences", "segments", "utterances"):
            value = transcription.get(key)
            if isinstance(value, list) and value:
                return [item for item in value if isinstance(item, dict)]

    return []


def _extract_plain_text(output: dict[str, Any]) -> str:
    transcripts = output.get("transcripts")
    if isinstance(transcripts, list):
        parts: list[str] = []
        for track in transcripts:
            if not isinstance(track, dict):
                continue
            text = track.get("text")
            if isinstance(text, str) and text.strip():
                parts.append(text.strip())
        if parts:
            return "\n\n".join(parts)

    for key in ("text", "transcript"):
        value = output.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    result = output.get("result")
    if isinstance(result, dict):
        for key in ("text", "transcript"):
            value = result.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    return ""


def _extract_language(output: dict[str, Any]) -> str | None:
    for key in ("language", "lang"):
        value = output.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()

    transcripts = output.get("transcripts")
    if isinstance(transcripts, list):
        for track in transcripts:
            if not isinstance(track, dict):
                continue
            sentences = track.get("sentences")
            if not isinstance(sentences, list):
                continue
            for sentence in sentences:
                if not isinstance(sentence, dict):
                    continue
                lang = sentence.get("language")
                if isinstance(lang, str) and lang.strip():
                    return lang.strip()
    return None


def upload_transcript_artifacts(
    *,
    s3_client,
    bucket: str,
    s3_prefix: str,
    transcript_md: str,
    asr_result: dict[str, Any],
) -> None:
    prefix = s3_prefix if s3_prefix.endswith("/") else f"{s3_prefix}/"
    transcript_key = f"{prefix}transcript.md"
    result_key = f"{prefix}asr_result.json"

    s3_client.put_object(
        Bucket=bucket,
        Key=transcript_key,
        Body=transcript_md.encode("utf-8"),
        ContentType="text/markdown; charset=utf-8",
    )
    s3_client.put_object(
        Bucket=bucket,
        Key=result_key,
        Body=json.dumps(asr_result, ensure_ascii=False, indent=2).encode("utf-8"),
        ContentType="application/json",
    )
