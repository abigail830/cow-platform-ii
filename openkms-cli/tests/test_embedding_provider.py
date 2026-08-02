from openkms_cli.kb.embedding_provider import embedding_supports_dimensions


def test_dashscope_v4_supports_dimensions():
    assert embedding_supports_dimensions({
        "model_name": "text-embedding-v4",
        "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
    })


def test_siliconflow_bge_m3_does_not():
    assert not embedding_supports_dimensions({
        "model_name": "BAAI/bge-m3",
        "base_url": "https://api.siliconflow.cn/v1",
    })


def test_explicit_override():
    assert embedding_supports_dimensions({
        "model_name": "custom",
        "base_url": "https://api.example.com/v1",
        "supports_dimensions": True,
    })
