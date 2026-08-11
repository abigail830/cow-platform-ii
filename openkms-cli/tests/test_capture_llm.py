from openkms_cli.pipeline.capture_llm import workflow_llm_model_name


def test_workflow_llm_model_name_prefers_top_level():
    assert workflow_llm_model_name({"model_name": "deepSeek-V4-Flash"}) == "deepSeek-V4-Flash"


def test_workflow_llm_model_name_reads_post_process_nested():
    assert (
        workflow_llm_model_name({"post_process": {"model_name": "gpt-5.4"}}) == "gpt-5.4"
    )
