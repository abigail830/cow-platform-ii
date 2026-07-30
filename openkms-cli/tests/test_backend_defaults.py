"""Tests for VLM default resolution and merge logic (no HTTP in merge unit tests)."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from openkms_cli.core.backend_defaults import (
    VlmRuntimeConfig,
    _merge_document_parse_defaults_payload,
    resolve_vlm_config,
    resolve_vlm_for_cli,
)
from openkms_cli.core.settings import CliSettings


@pytest.mark.parametrize(
    "need_url,need_model,need_key,model_name_param,data,expect_url,expect_model,expect_key",
    [
        (
            True,
            True,
            True,
            None,
            {"base_url": "https://vlm/", "model_name": "M", "api_key": "secret"},
            "https://vlm/",
            "M",
            "secret",
        ),
        (
            True,
            False,
            False,
            "from-env",
            {"base_url": "https://x/", "model_name": "Resolved", "api_key": "k"},
            "https://x/",
            "Resolved",
            None,
        ),
        (
            False,
            False,
            True,
            None,
            {"base_url": "https://ignored/", "model_name": "N", "api_key": "k2"},
            "http://keep/",
            "keep-model",
            "k2",
        ),
    ],
)
def test_merge_document_parse_defaults_payload(
    need_url: bool,
    need_model: bool,
    need_key: bool,
    model_name_param: str | None,
    data: dict,
    expect_url: str,
    expect_model: str,
    expect_key: str | None,
) -> None:
    url, model, key = _merge_document_parse_defaults_payload(
        "http://keep/",
        "keep-model",
        None,
        need_url=need_url,
        need_model=need_model,
        need_key=need_key,
        model_name_param=model_name_param,
        data=data,
    )
    assert url == expect_url
    assert model == expect_model
    assert key == expect_key


def test_merge_empty_strings_do_not_replace() -> None:
    url, model, key = _merge_document_parse_defaults_payload(
        "http://a/",
        "m1",
        "existing",
        need_url=True,
        need_model=True,
        need_key=True,
        model_name_param=None,
        data={"base_url": "", "model_name": "", "api_key": ""},
    )
    assert url == "http://a/"
    assert model == "m1"
    assert key == "existing"


def test_resolve_skips_fetch_when_nothing_needed(monkeypatch: pytest.MonkeyPatch) -> None:
    """When OPENKMS_VLM_* are all set in the environment, no backend fetch runs."""
    monkeypatch.setenv("OPENKMS_VLM_URL", "http://env-vlm/")
    monkeypatch.setenv("OPENKMS_VLM_MODEL", "EnvModel")
    monkeypatch.setenv("OPENKMS_VLM_API_KEY", "envkey")
    monkeypatch.delenv("OPENKMS_VLM_CONFIG_NAME", raising=False)
    cfg = CliSettings.model_construct(
        openkms_api_url="http://api.example",
        vlm_url="http://cfg-vlm/",
        vlm_model="CfgModel",
        vlm_api_key="cfgkey",
    )
    with patch("openkms_cli.core.backend_defaults._fetch_document_parse_defaults") as fetch:
        u, m, k = resolve_vlm_for_cli(cfg)
        fetch.assert_not_called()
    # Values come from settings (env flags only suppress fetch; pydantic would normally fill cfg from env).
    assert u == "http://cfg-vlm/"
    assert m == "CfgModel"
    assert k == "cfgkey"


def test_resolve_merges_when_config_name_set(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("OPENKMS_VLM_URL", raising=False)
    monkeypatch.delenv("OPENKMS_VLM_MODEL", raising=False)
    monkeypatch.delenv("OPENKMS_VLM_API_KEY", raising=False)
    monkeypatch.setenv("OPENKMS_VLM_CONFIG_NAME", "prod-vlm")
    cfg = CliSettings.model_construct(
        openkms_api_url="http://api.example",
        vlm_url="",
        vlm_model="",
        vlm_api_key="",
        vlm_config_name="prod-vlm",
    )
    fake = {"base_url": "https://merged/", "model_name": "MM", "api_key": "kk"}
    with patch("openkms_cli.core.backend_defaults._fetch_document_parse_defaults", return_value=fake):
        resolved = resolve_vlm_config(cfg)
    assert resolved.base_url == "https://merged/"
    assert resolved.model_name == "MM"
    assert resolved.api_key == "kk"


def test_resolve_standalone_cli_skips_backend_fetch() -> None:
    cfg = CliSettings.model_construct(
        openkms_api_url="http://api.example",
        vlm_url="http://ignored/",
        vlm_model="ignored",
        vlm_config_name="should-not-fetch",
    )
    with patch("openkms_cli.core.backend_defaults._fetch_document_parse_defaults") as fetch:
        resolved = resolve_vlm_config(
            cfg,
            cli_vlm_url="http://direct/",
            cli_model="Direct/Model",
            cli_vlm_api_key="key1",
            cli_max_concurrency=5,
        )
        fetch.assert_not_called()
    assert resolved == VlmRuntimeConfig(
        base_url="http://direct/",
        model_name="Direct/Model",
        api_key="key1",
        max_concurrency=5,
    )


def test_fetch_passes_model_name_when_env_model_set(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENKMS_VLM_MODEL", "  my-model  ")
    monkeypatch.setenv("OPENKMS_VLM_URL", "http://u/")
    monkeypatch.delenv("OPENKMS_VLM_API_KEY", raising=False)
    monkeypatch.delenv("OPENKMS_VLM_CONFIG_NAME", raising=False)
    cfg = CliSettings.model_construct(
        openkms_api_url="http://api.example",
        vlm_url="http://u/",
        vlm_model="ignored-from-settings",
        vlm_api_key="",
    )
    captured: dict = {}

    def fake_fetch(c: CliSettings, model_name_query: str | None) -> dict:
        captured["model_name_query"] = model_name_query
        return {"base_url": "", "model_name": "ResolvedName", "api_key": "k"}

    with patch("openkms_cli.core.backend_defaults._fetch_document_parse_defaults", side_effect=fake_fetch):
        resolved = resolve_vlm_config(cfg)
    assert captured["model_name_query"] == "my-model"
    assert resolved.base_url == "http://u/"
    assert resolved.model_name == "ResolvedName"
    assert resolved.api_key == "k"
