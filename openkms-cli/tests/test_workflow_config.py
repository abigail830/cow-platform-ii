"""Tests for workflow YAML loader and defaults."""

from __future__ import annotations

import pytest

from openkms_cli.core.workflow_config import (
    WorkflowConfigError,
    collect_model_names,
    load_packaged_default,
    metadata_extract_enabled,
    parse_workflow_yaml,
    resolve_job_workflow_config,
)


def test_load_packaged_baidu_default():
    cfg = load_packaged_default("baidu-doc-parse")
    assert metadata_extract_enabled(cfg)
    assert "deepSeek-V4-Flash" in collect_model_names(cfg)
    meta = cfg["metadata_extract"]
    assert "system_prompt" in meta
    assert "output_schema" in meta


def test_job_snapshot_overrides_default():
    override = """
metadata_extract:
  enabled: true
  model_name: "gpt-5.4"
  system_prompt: custom
  user_prompt_template: "{markdown}"
  output_schema:
    type: object
"""
    cfg = resolve_job_workflow_config(
        pipeline_name="baidu-doc-parse",
        job_config_yaml=override,
    )
    assert collect_model_names(cfg) == ["gpt-5.4"]
    assert cfg["metadata_extract"]["system_prompt"] == "custom"


def test_empty_job_yaml_uses_default():
    cfg = resolve_job_workflow_config(
        pipeline_name="kb-faq-extract",
        job_config_yaml=None,
    )
    assert cfg["model_name"] == "deepSeek-V4-Flash"


def test_rejects_api_key_in_yaml():
    with pytest.raises(WorkflowConfigError, match="Forbidden key"):
        parse_workflow_yaml(
            'model_name: x\napi_key: secret\n',
            source="test",
        )


def test_rejects_model_id_uuid_key():
    with pytest.raises(WorkflowConfigError, match="Forbidden key"):
        parse_workflow_yaml(
            'metadata_extract:\n  model_id: "00000000-0000-0000-0000-000000000000"\n',
            source="test",
        )


def test_faq_index_default_loads():
    cfg = load_packaged_default("kb-faq-index")
    assert collect_model_names(cfg) == ["qwen3-Embedding-8B"]
    assert cfg.get("dimensions") == 4096


def test_rag_index_default_loads():
    cfg = load_packaged_default("kb-rag-index")
    assert collect_model_names(cfg) == ["qwen3-Embedding-8B"]
    assert cfg.get("dimensions") == 4096
    assert cfg.get("chunk", {}).get("strategy") == "markdown_header"


def test_faq_default_collects_model_name():
    cfg = load_packaged_default("kb-faq-extract")
    assert collect_model_names(cfg) == ["deepSeek-V4-Flash"]


def test_baidu_default_page_index_and_async_from_yaml():
    cfg = load_packaged_default("baidu-doc-parse")
    assert cfg["page_index"]["strategy"] == "baidu-layouts"
    assert cfg["async"]["poll_interval_seconds"] == 8
    assert cfg["async"]["max_wait_seconds"] == 600


def test_resolve_page_index_strategy_cli_override_wins():
    from openkms_cli.core.workflow_config import resolve_page_index_strategy

    cfg = load_packaged_default("baidu-doc-parse")
    assert (
        resolve_page_index_strategy(cfg, provider="baidu", cli_override="markdown-headings")
        == "markdown-headings"
    )


def test_resolve_page_index_strategy_from_yaml():
    from openkms_cli.core.workflow_config import resolve_page_index_strategy

    cfg = load_packaged_default("aliyun-docmind-parse")
    assert resolve_page_index_strategy(cfg, provider="aliyun", cli_override=None) == "aliyun-layouts"


def test_resolve_async_poll_settings_yaml_then_settings():
    from openkms_cli.core.workflow_config import resolve_async_poll_settings

    cfg = load_packaged_default("baidu-doc-parse")
    interval, wait = resolve_async_poll_settings(
        cfg,
        cli_poll_interval=None,
        cli_max_wait=None,
        settings_poll_default=5,
        settings_max_wait_default=120,
    )
    assert interval == 8
    assert wait == 600

    interval2, wait2 = resolve_async_poll_settings(
        cfg,
        cli_poll_interval=3,
        cli_max_wait=90,
        settings_poll_default=5,
        settings_max_wait_default=120,
    )
    assert interval2 == 3
    assert wait2 == 90


def test_metadata_extract_pipeline_default():
    cfg = load_packaged_default("metadata-extract")
    assert metadata_extract_enabled(cfg)
    assert "deepSeek-V4-Flash" in collect_model_names(cfg)


def test_audio_transcribe_default_collects_model_name():
    cfg = load_packaged_default("aliyun-qwen-audio-transcribe")
    assert collect_model_names(cfg) == ["qwen-audio-3.0-asr-flash-filetrans"]
    assert cfg["asr"]["enable_diarization"] is True
