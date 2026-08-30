"""Deterministic hotword recall / precision / F1 (reference/scripts/calculate_techvoice_metrics.py)."""

from __future__ import annotations

import re
from dataclasses import dataclass

# Keep ASCII alnum + CJK (reference/scripts/generate_combined_report.py clean()).
_HOTWORD_CLEAN_RE = re.compile(r"[^a-z0-9\u4e00-\u9fff]+")


def clean_hotword_text(text: str) -> str:
    """Case-insensitive match; strip punctuation, spaces, hyphens; keep CJK."""
    return _HOTWORD_CLEAN_RE.sub("", text.lower())


@dataclass(frozen=True)
class HotwordMetricsResult:
    recall: float | None
    precision: float | None
    f1: float | None
    actual: int
    predicted: int
    correct: int
    terms: list[str]


def compute_hotword_metrics(
    reference: str,
    hypothesis: str,
    terms: list[str],
) -> HotwordMetricsResult:
    normalized_terms = [term.strip() for term in terms if isinstance(term, str) and term.strip()]
    if not normalized_terms:
        return HotwordMetricsResult(None, None, None, 0, 0, 0, [])

    nref = clean_hotword_text(reference)
    nhyp = clean_hotword_text(hypothesis)
    actual = predicted = correct = 0

    for term in normalized_terms:
        token = clean_hotword_text(term)
        if not token:
            continue
        ar = nref.count(token)
        ah = nhyp.count(token)
        actual += ar
        predicted += ah
        correct += min(ar, ah)

    if actual == 0:
        return HotwordMetricsResult(None, None, None, actual, predicted, correct, normalized_terms)

    recall = correct / actual
    precision = correct / predicted if predicted else 0.0
    f1 = (
        2 * precision * recall / (precision + recall)
        if precision + recall
        else 0.0
    )
    return HotwordMetricsResult(recall, precision, f1, actual, predicted, correct, normalized_terms)
