"""DeepEval GEval wrappers — criteria come from judge dimension config only."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from deepeval.metrics import GEval, FaithfulnessMetric, ContextualRecallMetric, ContextualPrecisionMetric
from deepeval.test_case import LLMTestCase, LLMTestCaseParams

from evaluate_cli.judge.error_rate import compute_character_error_rate, compute_word_error_rate
from evaluate_cli.judge.hotword_metrics import compute_hotword_metrics

GEVAL_PASS_THRESHOLD = 0.5
DEEPEVAL_RAG_PASS_THRESHOLD = 0.5

DEEPEVAL_RAG_KINDS = frozenset({
    "faithfulness_score",
    "contextual_recall_score",
    "contextual_precision_score",
})


@dataclass
class JudgeScore:
    score: float | None
    score_max: float | None
    winner: str | None
    reason: str
    lower_is_better: bool = False


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


def _coerce_evaluation_steps(raw: Any) -> list[str] | None:
    if not isinstance(raw, list):
        return None
    steps = [str(step).strip() for step in raw if str(step).strip()]
    return steps or None


def _build_geval(
    name: str,
    criteria: str,
    params: list[LLMTestCaseParams],
    context: dict[str, Any],
    evaluation_steps: Any = None,
) -> GEval:
    criteria_text = str(criteria or "").strip()
    if not criteria_text:
        raise RuntimeError(f"Eval judge dimension {name!r} is missing criteria")
    kwargs: dict[str, Any] = {
        "name": name,
        "criteria": criteria_text,
        "evaluation_params": params,
        "threshold": GEVAL_PASS_THRESHOLD,
        "model": _judge_model(context),
    }
    steps = _coerce_evaluation_steps(evaluation_steps)
    if steps:
        kwargs["evaluation_steps"] = steps
    return GEval(**kwargs)


def _raw_geval_score(metric: GEval) -> tuple[float | None, float | None]:
    """Map DeepEval metric.score back to the rubric scale (default 0–10)."""
    if metric.score is None:
        return None, None
    lo, hi = metric.score_range
    span = hi - lo
    if span <= 0:
        return float(metric.score), hi
    return float(metric.score) * span + lo, hi


def _score_from_metric(metric: GEval, *, winner: bool) -> JudgeScore:
    if winner:
        reason = metric.reason or ""
        return JudgeScore(score=None, score_max=None, winner=_parse_winner(reason), reason=reason)
    score, score_max = _raw_geval_score(metric)
    return JudgeScore(score=score, score_max=score_max, winner=None, reason=metric.reason or "")


def score_deepeval_rag_dimension(
    reference: str,
    transcript: str,
    dimension: dict[str, Any],
    context: dict[str, Any],
) -> JudgeScore:
    kind = str(dimension.get("kind", "")).strip()
    label = str(dimension.get("label") or kind)
    model = _judge_model(context)

    if kind == "faithfulness_score":
        metric: Any = FaithfulnessMetric(
            threshold=DEEPEVAL_RAG_PASS_THRESHOLD,
            model=model,
            include_reason=True,
        )
        test_case = LLMTestCase(
            input="",
            actual_output=transcript,
            retrieval_context=[reference],
        )
    elif kind == "contextual_recall_score":
        metric = ContextualRecallMetric(
            threshold=DEEPEVAL_RAG_PASS_THRESHOLD,
            model=model,
            include_reason=True,
        )
        # RAG recall: each GT sentence should be attributable to the parse output.
        test_case = LLMTestCase(
            input="",
            expected_output=reference,
            actual_output=transcript,
            retrieval_context=[transcript],
        )
    elif kind == "contextual_precision_score":
        metric = ContextualPrecisionMetric(
            threshold=DEEPEVAL_RAG_PASS_THRESHOLD,
            model=model,
            include_reason=True,
        )
        # RAG precision: parse output nodes should be relevant to the GT answer.
        test_case = LLMTestCase(
            input="Document parse evaluation",
            expected_output=reference,
            actual_output=transcript,
            retrieval_context=[transcript],
        )
    else:
        raise RuntimeError(f"Unsupported DeepEval RAG kind: {kind!r}")

    metric.measure(test_case)
    score = float(metric.score) if metric.score is not None else None
    reason = metric.reason or f"{label} score unavailable."
    return JudgeScore(score=score, score_max=1.0, winner=None, reason=reason, lower_is_better=False)


def score_variant_dimension(transcript: str, dimension: dict[str, Any], context: dict[str, Any]) -> JudgeScore:
    metric = _build_geval(
        dimension["label"],
        dimension["criteria"],
        [LLMTestCaseParams.ACTUAL_OUTPUT],
        context,
        dimension.get("evaluation_steps"),
    )
    test_case = LLMTestCase(input="", actual_output=transcript)
    metric.measure(test_case)
    return _score_from_metric(metric, winner=False)


def score_variant_vs_gt_dimension(
    reference: str,
    transcript: str,
    dimension: dict[str, Any],
    context: dict[str, Any],
) -> JudgeScore:
    metric = _build_geval(
        dimension["label"],
        dimension["criteria"],
        [LLMTestCaseParams.EXPECTED_OUTPUT, LLMTestCaseParams.ACTUAL_OUTPUT],
        context,
        dimension.get("evaluation_steps"),
    )
    test_case = LLMTestCase(input="", expected_output=reference, actual_output=transcript)
    metric.measure(test_case)
    return _score_from_metric(metric, winner=False)


def score_hotword_dimension(
    reference: str,
    transcript: str,
    dimension: dict[str, Any],
    terms: list[str],
) -> JudgeScore:
    kind = dimension.get("kind", "hotword_recall_score")
    result = compute_hotword_metrics(reference, transcript, terms)

    if kind == "hotword_precision_score":
        score = result.precision
        label = "Hotword Precision"
    elif kind == "hotword_f1_score":
        score = result.f1
        label = "Hotword F1"
    else:
        score = result.recall
        label = "Hotword Recall"

    if score is None:
        reason = (
            f"{label}: no hotword occurrences in reference. "
            f"Terms: {', '.join(result.terms) or 'none'}."
        )
    else:
        reason = (
            f"{label} {score:.2%}. "
            f"Matched {result.correct} of {result.actual} reference occurrences "
            f"({result.predicted} in transcript). "
            f"Terms: {', '.join(result.terms)}."
        )

    return JudgeScore(
        score=score,
        score_max=1.0,
        winner=None,
        reason=reason,
        lower_is_better=False,
    )


def score_error_rate_dimension(
    reference: str,
    transcript: str,
    dimension: dict[str, Any],
) -> JudgeScore:
    kind = dimension.get("kind", "cer_score")
    if kind == "wer_score":
        result = compute_word_error_rate(reference, transcript)
        label = "Word Error Rate (WER)"
        tokenization = (
            "English/digit words and one CJK character per token "
            "(mixed Chinese/English supported)"
        )
    else:
        result = compute_character_error_rate(reference, transcript)
        label = "Character Error Rate (CER)"
        tokenization = "Lowercase alphanumeric and CJK characters only"

    reason = (
        f"{label} {result.error_rate:.2%}. "
        f"Tokenization: {tokenization}. "
        f"Substitutions: {result.substitutions}, Deletions: {result.deletions}, "
        f"Insertions: {result.insertions}, Reference length: {result.reference_length}."
    )
    return JudgeScore(
        score=result.error_rate,
        score_max=1.0,
        winner=None,
        reason=reason,
        lower_is_better=True,
    )


def score_pairwise_dimension(
    transcript_a: str,
    transcript_b: str,
    dimension: dict[str, Any],
    context: dict[str, Any],
) -> JudgeScore:
    metric = _build_geval(
        dimension["label"],
        dimension["criteria"],
        [LLMTestCaseParams.INPUT, LLMTestCaseParams.ACTUAL_OUTPUT],
        context,
        dimension.get("evaluation_steps"),
    )
    test_case = LLMTestCase(input=transcript_a, actual_output=transcript_b)
    metric.measure(test_case)
    kind = dimension.get("kind", "geval_score")
    return _score_from_metric(metric, winner=kind == "geval_winner")


def _parse_winner(reason: str) -> str | None:
    text = reason.strip().upper()
    if not text:
        return None
    if re.search(r"\bTIE\b", text):
        return "tie"
    if re.search(
        r"\bVARIANT A\b|\bTRANSCRIPT A\b|\bINPUT\b|\bA WINS\b|\bWINNER: A\b|\bCHOICE: A\b|\bSELECT A\b",
        text,
    ):
        return "a"
    if re.search(
        r"\bVARIANT B\b|\bTRANSCRIPT B\b|\bACTUAL OUTPUT\b|\bACTUAL\b|\bB WINS\b|\bWINNER: B\b|\bCHOICE: B\b|\bSELECT B\b",
        text,
    ):
        return "b"
    if re.match(r"^A[.\s:)/\-—]", text) or re.match(r"^WINNER:\s*A\b", text):
        return "a"
    if re.match(r"^B[.\s:)/\-—]", text) or re.match(r"^WINNER:\s*B\b", text):
        return "b"
    return None
