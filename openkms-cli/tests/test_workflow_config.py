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
