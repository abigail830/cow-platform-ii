from openkms_cli.kb.rag_index import _build_job_error_message


def test_build_job_error_message_all_failed():
    msg = _build_job_error_message(
        ["doc-1: boto3 missing", "doc-2: empty markdown"],
        failed=2,
        completed=0,
    )
    assert msg is not None
    assert "All documents failed" in msg
    assert "doc-1: boto3 missing" in msg


def test_build_job_error_message_partial_failure():
    msg = _build_job_error_message(
        ["doc-2: embedding 400"],
        failed=1,
        completed=1,
    )
    assert msg == "1 of 2 document(s) failed: doc-2: embedding 400"


def test_build_job_error_message_no_failures():
    assert _build_job_error_message([], failed=0, completed=2) is None
