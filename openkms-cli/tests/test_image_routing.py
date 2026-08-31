from openkms_cli.providers.aliyun.image_routing import (
    _parse_classification_payload,
    should_route_image_to_docmind,
)


def test_parse_classification_payload():
    data = _parse_classification_payload('{"label":"handwritten","confidence":0.91}')
    assert data["label"] == "handwritten"
    assert data["confidence"] == 0.91


def test_should_route_image_to_docmind():
    opts = {"min_printed_confidence": 0.65}
    assert should_route_image_to_docmind({"label": "printed", "confidence": 0.9}, options=opts)
    assert not should_route_image_to_docmind({"label": "printed", "confidence": 0.5}, options=opts)
    assert not should_route_image_to_docmind({"label": "handwritten", "confidence": 0.99}, options=opts)
    assert not should_route_image_to_docmind({"label": "mixed", "confidence": 0.99}, options=opts)
    assert not should_route_image_to_docmind({"label": "uncertain", "confidence": 0.99}, options=opts)
