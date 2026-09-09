from openkms_cli.pipeline.capture_merge import merge_segment_turns, parse_transcript_markdown
from openkms_cli.pipeline.capture_structure import build_topics, classify_capture
from openkms_cli.pipeline.capture_materialize import build_combined_markdown, resolve_index_content
from openkms_cli.pipeline.capture_post_process import PROGRESS_STAGES, _progress_index, _should_skip_step


SAMPLE_MD = """# meeting.m4a

- ASR: qwen-audio

## [00:00:05] Speaker 1
Hello team, let's review the architecture.

## [00:01:10] Speaker 2
We should finalize the API contract this week.
"""


def test_parse_transcript_markdown_extracts_turns():
    turns = parse_transcript_markdown(SAMPLE_MD)
    assert len(turns) == 2
    assert turns[0].speaker == "Speaker 1"
    assert "architecture" in turns[0].text
    assert turns[0].begin_ms == 5000


def test_merge_segment_turns_assigns_global_ids():
    segments = [
        {
            "id": "a1",
            "segment_index": 0,
            "name": "part1.m4a",
            "transcript_s3_key": "audio/hash1/transcript.md",
        },
        {
            "id": "a2",
            "segment_index": 1,
            "name": "part2.m4a",
            "transcript_s3_key": "audio/hash2/transcript.md",
        },
    ]

    def loader(key: str) -> str:
        if key.endswith("hash1/transcript.md"):
            return SAMPLE_MD
        return """# part2

## [00:00:02] Speaker 3
Follow-up on action items.
"""

    merged = merge_segment_turns(segments, transcript_loader=loader)
    assert len(merged) == 3
    assert merged[0]["turn_id"] == "s0_t001"
    assert merged[2]["turn_id"] == "s1_t003"
    assert merged[2]["segment_index"] == 1


def test_classify_capture_uses_hint_and_facets():
    turns = [
        {"turn_id": "s0_t001", "speaker": "A", "text": "方案设计讨论"},
        {"turn_id": "s0_t002", "speaker": "B", "text": "进度同步"},
    ]
    topics = build_topics(turns)
    result = classify_capture(
        recording_mode_hint="structured_interview",
        audience="internal_team",
        turns=turns,
        topics=topics,
    )
    assert result["recording_mode"] == "structured_interview"
    assert result["needs_review"] is False
    assert result["content_facets_by_topic"]


def test_progress_index_and_skip_step():
    assert _progress_index("submitted") == 0
    assert _progress_index("extracting") == PROGRESS_STAGES.index("extracting")
    assert _should_skip_step("structuring", "extracting", "captures/x/structured.json", object(), "bucket") is False

    class FakeClient:
        def head_object(self, **kwargs):
            return {"ok": True}

    assert _should_skip_step(
        "structuring",
        "extracting",
        "captures/x/structured.json",
        FakeClient(),
        "bucket",
    )


def test_build_combined_markdown_includes_summary_and_extraction():
    md = build_combined_markdown(
        capture={"title": "Weekly sync", "brief": "Team update"},
        summary_md="## Highlights\nDone.",
        extraction={"knowledge_points": [{"text": "Ship API v2"}]},
        structured={"topics": [{"label": "API", "preview": "Contract review"}]},
    )
    assert "# Weekly sync" in md
    assert "## Summary" in md
    assert "Ship API v2" in md
    assert "### API" in md


def test_resolve_index_content_defaults_to_combined():
    assert resolve_index_content({}) == {"audio": "combined"}
    assert resolve_index_content({"index_content": {"audio": "summary"}})["audio"] == "summary"
