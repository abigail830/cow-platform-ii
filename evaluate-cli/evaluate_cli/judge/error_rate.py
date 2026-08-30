"""Character / word error rate metrics for ASR ground-truth evaluation.

Tokenization aligns with reference/scripts/generate_combined_report.py (combined dataset):
- WER: English/digit words + one token per CJK character (mixed Chinese/English).
- CER: alphanumeric + CJK characters after lowercasing and dropping punctuation.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# English/digit word OR single CJK character (mandarin/cantonese/mixed).
_WER_TOKEN_RE = re.compile(r"[a-z0-9]+|[\u4e00-\u9fff]")
_CER_CHAR_RE = re.compile(r"[^a-z0-9\u4e00-\u9fff]")


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


def tokenize_wer_tokens(text: str) -> list[str]:
    """WER tokens: [a-z0-9]+ words and one token per CJK character."""
    return _WER_TOKEN_RE.findall(text.lower())


def normalize_cer_text(text: str) -> str:
    """CER stream: lowercase alnum + CJK only (no spaces/punctuation)."""
    return _CER_CHAR_RE.sub("", text.lower())


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
    ref_tokens = list(normalize_cer_text(reference))
    hyp_tokens = list(normalize_cer_text(hypothesis))
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
    ref_tokens = tokenize_wer_tokens(reference)
    hyp_tokens = tokenize_wer_tokens(hypothesis)
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
