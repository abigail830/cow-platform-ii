from openkms_cli.providers.aliyun.asr import format_transcript_markdown, resolve_asr_transcription_payload


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


def test_format_transcript_markdown_from_transcripts_array():
    asr_result = {
        "file_url": "https://example.com/audio.m4a",
        "transcripts": [
            {
                "channel_id": 0,
                "text": "大家好，欢迎参加会议。",
                "sentences": [
                    {"sentence_id": 0, "begin_time": 1200, "end_time": 4500, "language": "zh", "text": "大家好，"},
                    {"sentence_id": 1, "begin_time": 4500, "end_time": 9200, "language": "zh", "text": "欢迎参加会议。"},
                ],
            }
        ],
    }
    md = format_transcript_markdown(
        filename="meeting.m4a",
        asr_result=asr_result,
        model="qwen-audio-3.0-asr-flash-filetrans",
    )
    assert "Language: zh" in md
    assert "## [00:00:01]" in md
    assert "大家好，" in md
    assert "欢迎参加会议。" in md


def test_resolve_asr_transcription_payload_downloads_transcription_url(monkeypatch):
    task_response = {
        "output": {
            "task_status": "SUCCEEDED",
            "result": {"transcription_url": "https://example.com/result.json"},
        }
    }
    downloaded = {
        "transcripts": [
            {
                "channel_id": 0,
                "text": "下载后的完整文本",
                "sentences": [{"begin_time": 0, "end_time": 1000, "text": "下载后的完整文本"}],
            }
        ]
    }

    class FakeResponse:
        status_code = 200

        def json(self):
            return downloaded

    monkeypatch.setattr(
        "openkms_cli.providers.aliyun.asr.requests.get",
        lambda url, timeout=120: FakeResponse(),
    )

    resolved = resolve_asr_transcription_payload(task_response)
    assert resolved["transcripts"][0]["text"] == "下载后的完整文本"

    md = format_transcript_markdown(
        filename="伊利.m4a",
        asr_result=resolved,
        model="qwen-audio-3.0-asr-flash-filetrans",
    )
    assert "下载后的完整文本" in md
