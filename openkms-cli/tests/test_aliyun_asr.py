from openkms_cli.providers.aliyun.asr import format_transcript_markdown


def test_format_transcript_markdown_with_speakers():
    asr_result = {
        "output": {
            "language": "zh",
            "sentences": [
                {"begin_time": 12000, "speaker_id": 0, "text": "大家好"},
                {"begin_time": 330000, "speaker_id": 1, "text": "关于预算我有几点"},
            ],
        }
    }
    md = format_transcript_markdown(
        filename="meeting.m4a",
        asr_result=asr_result,
        model="qwen-audio-3.0-asr-flash-filetrans",
    )
    assert "# meeting.m4a" in md
    assert "Language: zh" in md
    assert "Speakers: 2" in md
    assert "## [00:00:12] Speaker 1" in md
    assert "大家好" in md
    assert "## [00:05:30] Speaker 2" in md
    assert "关于预算我有几点" in md


def test_format_transcript_markdown_plain_text_fallback():
    asr_result = {"output": {"text": "Hello world"}}
    md = format_transcript_markdown(
        filename="clip.mp3",
        asr_result=asr_result,
        model="qwen-audio-3.0-asr-flash-filetrans",
    )
    assert "Hello world" in md
