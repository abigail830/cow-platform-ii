from evaluate_cli.judge.metrics import _build_geval, _coerce_evaluation_steps


def test_coerce_evaluation_steps_filters_blank_lines() -> None:
    assert _coerce_evaluation_steps([" Step one ", "", "Step two"]) == ["Step one", "Step two"]
    assert _coerce_evaluation_steps([]) is None
    assert _coerce_evaluation_steps(None) is None
    assert _coerce_evaluation_steps("not-a-list") is None


def test_build_geval_omits_evaluation_steps_when_unset(monkeypatch) -> None:
    captured: dict = {}

    class FakeGEval:
        def __init__(self, **kwargs) -> None:
            captured.update(kwargs)

    monkeypatch.setattr("evaluate_cli.judge.metrics.GEval", FakeGEval)
    monkeypatch.setattr(
        "evaluate_cli.judge.metrics._judge_model",
        lambda _ctx: object(),
    )

    _build_geval("Readability", "Score readability 0-10.", [], {}, None)
    assert "evaluation_steps" not in captured

    _build_geval(
        "Readability",
        "Score readability 0-10.",
        [],
        {},
        ["Read the transcript.", "Score 0-10."],
    )
    assert captured["evaluation_steps"] == ["Read the transcript.", "Score 0-10."]
