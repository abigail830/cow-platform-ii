"""DeepEval GEval wrappers for reference-free ASR judge dimensions."""

from __future__ import annotations

import os
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


def _model_name(context: dict[str, Any]) -> str | None:
    llm = context.get("llm") or {}
    model = llm.get("model")
    if isinstance(model, str) and model.strip():
        return model.strip()
    env_model = os.getenv("EVAL_JUDGE_MODEL") or os.getenv("OPENAI_MODEL")
    return env_model.strip() if env_model else None


def _build_geval(name: str, criteria: str, params: list[LLMTestCaseParams], model: str | None) -> GEval:
    kwargs: dict[str, Any] = {
        "name": name,
        "criteria": criteria,
        "evaluation_params": params,
        "threshold": 0.5,
    }
    if model:
        kwargs["model"] = model
    return GEval(**kwargs)


def score_variant_dimension(transcript: str, dimension: dict[str, Any], context: dict[str, Any]) -> JudgeScore:
    metric = _build_geval(
        dimension["label"],
        dimension["criteria"],
        [LLMTestCaseParams.ACTUAL_OUTPUT],
        _model_name(context),
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
        _model_name(context),
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
