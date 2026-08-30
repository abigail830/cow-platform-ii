from evaluate_cli.judge.metrics import _build_geval, _coerce_evaluation_steps


def test_coerce_evaluation_steps_filters_blank_lines() -> None:
    assert _coerce_evaluation_steps([" Step one ", "", "Step two"]) == ["Step one", "Step two"]
    assert _coerce_evaluation_steps([]) is None
    assert _coerce_evaluation_steps(None) is None
    assert _coerce_evaluation_steps("not-a-list") is None


def test_build_geval_gt_uses_expected_and_actual_params(monkeypatch) -> None:
    captured: dict = {}

    class FakeGEval:
        def __init__(self, **kwargs) -> None:
            captured.update(kwargs)

        def measure(self, test_case) -> None:
            captured["test_case"] = test_case

    monkeypatch.setattr("evaluate_cli.judge.metrics.GEval", FakeGEval)
    monkeypatch.setattr(
        "evaluate_cli.judge.metrics._judge_model",
        lambda _ctx: object(),
    )
    monkeypatch.setattr(
        "evaluate_cli.judge.metrics._score_from_metric",
        lambda *_args, **_kwargs: object(),
    )

    from deepeval.test_case import LLMTestCaseParams

    from evaluate_cli.judge.metrics import score_variant_vs_gt_dimension

    score_variant_vs_gt_dimension(
        "reference text",
        "transcript text",
        {"label": "Semantic fidelity", "criteria": "Score fidelity 0-10."},
        {},
    )

    assert captured["evaluation_params"] == [
        LLMTestCaseParams.EXPECTED_OUTPUT,
        LLMTestCaseParams.ACTUAL_OUTPUT,
    ]
    test_case = captured["test_case"]
    assert test_case.expected_output == "reference text"
    assert test_case.actual_output == "transcript text"


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


def test_score_deepeval_rag_faithfulness_builds_test_case(monkeypatch) -> None:
    captured: dict = {}

    class FakeFaithfulnessMetric:
        score = 0.82
        reason = "Most claims are supported."

        def __init__(self, **kwargs) -> None:
            captured.update(kwargs)

        def measure(self, test_case) -> None:
            captured["test_case"] = test_case

    monkeypatch.setattr("evaluate_cli.judge.metrics.FaithfulnessMetric", FakeFaithfulnessMetric)
    monkeypatch.setattr(
        "evaluate_cli.judge.metrics._judge_model",
        lambda _ctx: object(),
    )

    from evaluate_cli.judge.metrics import score_deepeval_rag_dimension

    result = score_deepeval_rag_dimension(
        "gold markdown",
        "parsed markdown",
        {"label": "Faithfulness", "kind": "faithfulness_score"},
        {},
    )

    test_case = captured["test_case"]
    assert test_case.actual_output == "parsed markdown"
    assert test_case.retrieval_context == ["gold markdown"]
    assert result.score == 0.82
    assert result.score_max == 1.0


def test_score_deepeval_rag_recall_uses_parse_as_retrieval_context(monkeypatch) -> None:
    captured: dict = {}

    class FakeContextualRecallMetric:
        score = 0.75
        reason = "Most GT sentences found."

        def __init__(self, **kwargs) -> None:
            captured.update(kwargs)

        def measure(self, test_case) -> None:
            captured["test_case"] = test_case

    monkeypatch.setattr(
        "evaluate_cli.judge.metrics.ContextualRecallMetric",
        FakeContextualRecallMetric,
    )
    monkeypatch.setattr(
        "evaluate_cli.judge.metrics._judge_model",
        lambda _ctx: object(),
    )

    from evaluate_cli.judge.metrics import score_deepeval_rag_dimension

    score_deepeval_rag_dimension(
        "gold markdown",
        "parsed markdown",
        {"label": "Contextual recall", "kind": "contextual_recall_score"},
        {},
    )

    test_case = captured["test_case"]
    assert test_case.expected_output == "gold markdown"
    assert test_case.retrieval_context == ["parsed markdown"]

