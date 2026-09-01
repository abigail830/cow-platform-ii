import json

import pytest

from openkms_cli.pipeline.capture_structure import _parse_json_object


def test_parse_json_object_accepts_fenced_payload():
    parsed = _parse_json_object('```json\n{"topics": []}\n```')
    assert parsed == {"topics": []}


def test_parse_json_object_repairs_trailing_commas():
    raw = '{"topics":[{"title":"A","summary":"B",},],}'
    parsed = _parse_json_object(raw)
    assert parsed["topics"][0]["title"] == "A"


def test_parse_json_object_extracts_embedded_object():
    raw = 'Here is the result:\n{"recording_mode":"general","confidence":0.8}\nThanks.'
    parsed = _parse_json_object(raw)
    assert parsed["recording_mode"] == "general"


def test_parse_json_object_raises_on_invalid_json():
    with pytest.raises(json.JSONDecodeError):
        _parse_json_object("{not json")
