from evaluate_cli.judge.hotword_metrics import clean_hotword_text, compute_hotword_metrics


def test_clean_hotword_text_strips_punctuation_and_case() -> None:
    assert clean_hotword_text("COVID-19") == "covid19"
    assert clean_hotword_text("Hello, World!") == "helloworld"


def test_compute_hotword_metrics_counts_substrings() -> None:
    result = compute_hotword_metrics(
        "The COVID-19 vaccine uses mRNA technology.",
        "The covid19 vaccine uses mRNA tech.",
        ["COVID-19", "mRNA"],
    )
    assert result.actual == 2
    assert result.predicted == 2
    assert result.correct == 2
    assert result.recall == 1.0
    assert result.precision == 1.0
    assert result.f1 == 1.0


def test_compute_hotword_metrics_partial_match() -> None:
    result = compute_hotword_metrics(
        "alpha beta alpha",
        "alpha gamma",
        ["alpha"],
    )
    assert result.actual == 2
    assert result.predicted == 1
    assert result.correct == 1
    assert result.recall == 0.5
    assert result.precision == 1.0
    assert result.f1 == 2 / 3


def test_compute_hotword_metrics_no_reference_occurrences() -> None:
    result = compute_hotword_metrics("hello world", "hello covid19", ["covid19"])
    assert result.actual == 0
    assert result.recall is None
    assert result.precision is None
    assert result.f1 is None
