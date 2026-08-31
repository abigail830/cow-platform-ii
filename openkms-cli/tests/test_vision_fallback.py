from openkms_cli.core.workflow_config import (
    resolve_vision_fallback_options,
    vision_fallback_enabled,
)
from openkms_cli.providers.aliyun.vision_fallback import (
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
    good = "审核报告2024年共120项通过检查" + ("正常" * 10)
    assert not needs_vision_fallback(good)
    bad = "abc@@@defghij" + ("x" * 30)
    assert needs_vision_fallback(bad)


def test_vision_fallback_enabled():
    assert vision_fallback_enabled({"vision_fallback": {"enabled": True, "model_name": "qwen3.7-plus"}})
    assert not vision_fallback_enabled({"vision_fallback": {"enabled": False, "model_name": "qwen3.7-plus"}})
    assert not vision_fallback_enabled({})


def test_resolve_vision_fallback_options_defaults():
    opts = resolve_vision_fallback_options({})
    assert opts["model_name"] == "qwen3.7-plus"
    assert opts["min_text_length"] == 40
    assert opts["suspicious_ratio"] == 0.08
