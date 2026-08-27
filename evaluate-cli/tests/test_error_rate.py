from evaluate_cli.judge.error_rate import compute_character_error_rate, compute_word_error_rate
from evaluate_cli.judge.metrics import score_error_rate_dimension


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


def test_compute_word_error_rate() -> None:
    result = compute_word_error_rate("hello world", "hello brave world")
    assert result.reference_length == 2
    assert result.insertions == 1
    assert result.error_rate == 0.5


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
