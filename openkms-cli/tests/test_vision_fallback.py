from openkms_cli.core.workflow_config import (
    resolve_vision_fallback_options,
    vision_fallback_enabled,
)
from openkms_cli.providers.aliyun.vision_fallback import (
    _vision_quality_gate_reasons,
    is_image_file_type,
    needs_vision_fallback,
)


def test_is_image_file_type():
    assert is_image_file_type("JPG")
    assert is_image_file_type("png")
    assert not is_image_file_type("PDF")


def test_needs_vision_fallback_short_text():
    assert needs_vision_fallback("")
    assert needs_vision_fallback("short text")
    assert not needs_vision_fallback("x" * 40)


def test_needs_vision_fallback_replacement_char():
    assert needs_vision_fallback("ok text here but bad " + "x" * 40 + "\ufffd")


def test_needs_vision_fallback_suspicious_ratio():
    good = "审核报告2024年共120项通过检查，文档内容完整可读。" + ("正常内容段落。" * 8)
    assert not needs_vision_fallback(good)
    bad = "abc@@@@@@defghij" + ("x" * 30)
    assert needs_vision_fallback(bad)


def test_needs_vision_fallback_docmind_hallucination_patterns():
    """Long OCR garbage with valid-looking length/ratio (DocMind image failure mode)."""
    garbage = (
        "picoe unfebrele ASRILATIANS CLIENT CONTACT STRAEN "
        + "1, " * 40
        + "0" * 50
        + " \\(x_{1}=20.0724\\) \\frac{1}{2} "
        + "1987年，中国开始实施了新的教育政策。"
    )
    reasons = _vision_quality_gate_reasons(garbage)
    assert "repeated_comma_one_pattern" in reasons or "long_repeated_digit_run" in reasons


def test_needs_vision_fallback_gibberish_latin():
    text = " ".join(["QWRTPSDFG", "KLMNPQRST", "BCDFGHJKLM", "STRNGTHS", "XYZWQRTZ"] * 4)
    assert needs_vision_fallback(text)


def test_needs_vision_fallback_latex_angle_loop():
    block = r"\angle A \cdot \angle B \cdot \angle C \cdot \angle D \cdot "
    text = block * 15 + "1987年报告"
    reasons = _vision_quality_gate_reasons(text)
    assert (
        "latex_angle_spam" in reasons
        or "repeated_text_blocks" in reasons
        or "high_suspicious_char_ratio" in reasons
    )


def test_vision_fallback_enabled():
    assert vision_fallback_enabled({"vision_fallback": {"enabled": True, "model_name": "qwen3.7-plus"}})
    assert not vision_fallback_enabled({"vision_fallback": {"enabled": False, "model_name": "qwen3.7-plus"}})
    assert not vision_fallback_enabled({})


def test_resolve_vision_fallback_options_defaults():
    opts = resolve_vision_fallback_options({})
    assert opts["model_name"] == "qwen3.7-plus"
    assert opts["min_text_length"] == 40
    assert opts["suspicious_ratio"] == 0.08
