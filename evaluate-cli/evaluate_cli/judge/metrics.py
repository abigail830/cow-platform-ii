"""DeepEval GEval wrappers for reference-free ASR judge dimensions."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from deepeval.metrics import GEval
from deepeval.test_case import LLMTestCase, LLMTestCaseParams


@dataclass
class JudgeScore:
    score: float | None
    winner: str | None
    reason: str


def _judge_model(context: dict[str, Any]):
    llm = context.get("llm") or {}
    model_name = llm.get("model_name")
    base_url = llm.get("base_url")
    api_key = llm.get("api_key")
    if not isinstance(model_name, str) or not model_name.strip():
        raise RuntimeError("Eval judge context missing llm.model_name (resolve via config_yaml model_name)")
    if not isinstance(base_url, str) or not base_url.strip():
        raise RuntimeError("Eval judge context missing llm.base_url")
    if not isinstance(api_key, str) or not api_key.strip():
        raise RuntimeError("Eval judge context missing llm.api_key")

    from deepeval.models import GPTModel

    return GPTModel(
        model=model_name.strip(),
        base_url=base_url.strip(),
        api_key=api_key.strip(),
    )


def _build_geval(name: str, criteria: str, params: list[LLMTestCaseParams], context: dict[str, Any]) -> GEval:
    return GEval(
        name=name,
        criteria=criteria,
        evaluation_params=params,
        threshold=0.5,
        model=_judge_model(context),
    )


def score_variant_dimension(transcript: str, dimension: dict[str, Any], context: dict[str, Any]) -> JudgeScore:
    metric = _build_geval(
        dimension["label"],
        dimension["criteria"],
        [LLMTestCaseParams.ACTUAL_OUTPUT],
        context,
    )
    test_case = LLMTestCase(input="", actual_output=transcript)
    metric.measure(test_case)
    score = float(metric.score) if metric.score is not None else None
    reason = metric.reason or ""
    return JudgeScore(score=score, winner=None, reason=reason)


def score_pairwise_dimension(
    transcript_a: str,
    transcript_b: str,
    dimension: dict[str, Any],
    context: dict[str, Any],
) -> JudgeScore:
    kind = dimension.get("kind", "geval_score")
    metric = _build_geval(
        dimension["label"],
        dimension["criteria"],
        [LLMTestCaseParams.INPUT, LLMTestCaseParams.ACTUAL_OUTPUT],
        context,
    )
    test_case = LLMTestCase(input=transcript_a, actual_output=transcript_b)
    metric.measure(test_case)
    reason = metric.reason or ""

    if kind == "geval_winner":
        winner = _parse_winner(reason)
        return JudgeScore(score=None, winner=winner, reason=reason)

    score = float(metric.score) if metric.score is not None else None
    return JudgeScore(score=score, winner=None, reason=reason)


def _parse_winner(reason: str) -> str | None:
    text = reason.strip().upper()
    if re.search(r"\bTIE\b", text):
        return "tie"
    if re.search(r"\bVARIANT A\b|\bTRANSCRIPT A\b|\bINPUT\b|\bA WINS\b|\bWINNER: A\b", text):
        return "a"
    if re.search(r"\bVARIANT B\b|\bTRANSCRIPT B\b|\bACTUAL\b|\bB WINS\b|\bWINNER: B\b", text):
        return "b"
    if text.startswith("A"):
        return "a"
    if text.startswith("B"):
        return "b"
    return None
