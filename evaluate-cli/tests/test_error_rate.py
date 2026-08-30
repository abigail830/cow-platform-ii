from evaluate_cli.judge.error_rate import (
    compute_character_error_rate,
    compute_word_error_rate,
    normalize_cer_text,
    tokenize_wer_tokens,
)
from evaluate_cli.judge.metrics import score_error_rate_dimension
from evaluate_cli.judge.transcript_text import extract_transcript_plain_text


def test_tokenize_wer_tokens_mixed_chinese_english() -> None:
    assert tokenize_wer_tokens("Hello 你好 world") == ["hello", "你", "好", "world"]


def test_normalize_cer_text_lowercases_english() -> None:
    assert normalize_cer_text("Hello 你好!") == "hello你好"


def test_compute_character_error_rate_ignores_spaces() -> None:
    result = compute_character_error_rate("我都唔明點解", "我都唔明白點解")
    assert result.reference_length == 6
    assert result.insertions == 1
    assert result.error_rate == 1 / 6


def test_compute_character_error_rate_substitution() -> None:
    result = compute_character_error_rate("你好", "你号")
    assert result.substitutions == 1
    assert result.error_rate == 0.5


def test_compute_character_error_rate_empty_reference() -> None:
    result = compute_character_error_rate("", "abc")
    assert result.reference_length == 0
    assert result.error_rate == 1.0


def test_compute_character_error_rate_ignores_case() -> None:
    result = compute_character_error_rate("Hello", "hello")
    assert result.error_rate == 0.0


def test_compute_word_error_rate_english() -> None:
    result = compute_word_error_rate("hello world", "hello brave world")
    assert result.reference_length == 2
    assert result.insertions == 1
    assert result.error_rate == 0.5


def test_compute_word_error_rate_ignores_punctuation() -> None:
    result = compute_word_error_rate("hello, world!", "hello world")
    assert result.reference_length == 2
    assert result.error_rate == 0.0


def test_compute_word_error_rate_chinese_per_character() -> None:
    result = compute_word_error_rate("我希望個疫症快啲完。", "我希望個疫症快啲完")
    assert result.reference_length == 9
    assert result.error_rate == 0.0


def test_compute_word_error_rate_chinese_substitution() -> None:
    result = compute_word_error_rate("我希望個疫症快啲完", "我希望個疫情快啲完")
    assert result.reference_length == 9
    assert result.substitutions == 1
    assert result.error_rate == 1 / 9


def test_compute_word_error_rate_mixed() -> None:
    result = compute_word_error_rate("hello 你好 world", "hello 你号 world")
    assert result.reference_length == 4
    assert result.substitutions == 1
    assert result.error_rate == 0.25


def test_extract_transcript_plain_text_from_markdown() -> None:
    raw = """# common_voice_yue_40508644.mp3

- ASR: fun-asr
- Speakers: 1

## [00:00:01] Speaker 1
我希望個疫情快啲完。
"""
    assert extract_transcript_plain_text(raw) == "我希望個疫情快啲完。"


def test_compute_character_error_rate_ignores_punctuation() -> None:
    result = compute_character_error_rate("我希望個疫症快啲完", "我希望個疫情快啲完。")
    assert result.reference_length == 9
    assert result.substitutions == 1
    assert result.error_rate == 1 / 9


def test_compute_character_error_rate_on_plain_transcript_body() -> None:
    reference = "我希望個疫症快啲完"
    hypothesis = """# file.mp3
- ASR: fun-asr
## [00:00:01] Speaker 1
我希望個疫情快啲完。
"""
    result = compute_character_error_rate(
        reference,
        extract_transcript_plain_text(hypothesis),
    )
    assert result.reference_length == 9
    assert result.substitutions == 1
    assert result.error_rate == 1 / 9


def test_score_error_rate_dimension_returns_lower_is_better() -> None:
    scored = score_error_rate_dimension(
        "我都唔明點解",
        "我都唔明白點解",
        {"kind": "cer_score", "label": "CER"},
    )
    assert scored.lower_is_better is True
    assert scored.score_max == 1.0
    assert scored.score is not None
    assert "Character Error Rate" in scored.reason


def test_score_wer_dimension_mixed() -> None:
    scored = score_error_rate_dimension(
        "hello 你好 world",
        "hello 你号 world",
        {"kind": "wer_score", "label": "WER"},
    )
    assert scored.score == 0.25
    assert "Word Error Rate" in scored.reason
