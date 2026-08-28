"""Character / word error rate metrics for ASR ground-truth evaluation."""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass


@dataclass(frozen=True)
class ErrorRateResult:
    error_rate: float
    substitutions: int
    deletions: int
    insertions: int
    reference_length: int

    @property
    def accuracy(self) -> float:
        if self.reference_length <= 0:
            return 1.0 if self.substitutions + self.deletions + self.insertions == 0 else 0.0
        return max(0.0, 1.0 - self.error_rate)


def normalize_asr_text(text: str) -> str:
    """Collapse whitespace and drop punctuation — standard ASR CER/WER prep."""
    collapsed = re.sub(r"\s+", "", text.strip())
    return "".join(ch for ch in collapsed if not unicodedata.category(ch).startswith("P"))


def tokenize_words(text: str) -> list[str]:
    """Split on whitespace after dropping punctuation — aligned with CER prep."""
    without_punct = "".join(
        ch if not unicodedata.category(ch).startswith("P") else " "
        for ch in text.strip()
    )
    return [token for token in re.split(r"\s+", without_punct.strip()) if token]


def _levenshtein_counts(ref: list[str], hyp: list[str]) -> tuple[int, int, int, int]:
    rows = len(ref) + 1
    cols = len(hyp) + 1
    if rows == 1:
        return 0, 0, len(hyp), 0

    dp = [[0] * cols for _ in range(rows)]
    for i in range(1, rows):
        dp[i][0] = i
    for j in range(1, cols):
        dp[0][j] = j

    for i in range(1, rows):
        for j in range(1, cols):
            cost = 0 if ref[i - 1] == hyp[j - 1] else 1
            dp[i][j] = min(
                dp[i - 1][j] + 1,
                dp[i][j - 1] + 1,
                dp[i - 1][j - 1] + cost,
            )

    substitutions = deletions = insertions = 0
    i, j = len(ref), len(hyp)
    while i > 0 or j > 0:
        if i > 0 and j > 0 and ref[i - 1] == hyp[j - 1]:
            i -= 1
            j -= 1
            continue
        if i > 0 and j > 0 and dp[i][j] == dp[i - 1][j - 1] + 1:
            substitutions += 1
            i -= 1
            j -= 1
            continue
        if i > 0 and dp[i][j] == dp[i - 1][j] + 1:
            deletions += 1
            i -= 1
            continue
        insertions += 1
        j -= 1

    return substitutions, deletions, insertions, len(ref)


def compute_character_error_rate(reference: str, hypothesis: str) -> ErrorRateResult:
    ref_tokens = list(normalize_asr_text(reference))
    hyp_tokens = list(normalize_asr_text(hypothesis))
    substitutions, deletions, insertions, ref_len = _levenshtein_counts(ref_tokens, hyp_tokens)
    errors = substitutions + deletions + insertions
    error_rate = errors / ref_len if ref_len > 0 else (0.0 if errors == 0 else 1.0)
    return ErrorRateResult(
        error_rate=error_rate,
        substitutions=substitutions,
        deletions=deletions,
        insertions=insertions,
        reference_length=ref_len,
    )


def compute_word_error_rate(reference: str, hypothesis: str) -> ErrorRateResult:
    ref_tokens = tokenize_words(reference)
    hyp_tokens = tokenize_words(hypothesis)
    substitutions, deletions, insertions, ref_len = _levenshtein_counts(ref_tokens, hyp_tokens)
    errors = substitutions + deletions + insertions
    error_rate = errors / ref_len if ref_len > 0 else (0.0 if errors == 0 else 1.0)
    return ErrorRateResult(
        error_rate=error_rate,
        substitutions=substitutions,
        deletions=deletions,
        insertions=insertions,
        reference_length=ref_len,
    )
