from types import SimpleNamespace

import pytest

from generation.llm import LLMConfig, OpenAIClient, client_from_config, config_from_env, mask_secret

SECRET = "sk-test-0123456789abcdef"
ENV = {"LLM_PROVIDER": "openai", "LLM_MODEL": "gpt-6-luna", "LLM_API_KEY": SECRET}


def test_config_from_env_reads_the_three_variables():
    config = config_from_env(ENV)
    assert (config.provider, config.model, config.api_key) == ("openai", "gpt-6-luna", SECRET)


def test_api_key_is_not_shown_in_repr_or_masked_form():
    config = config_from_env(ENV)
    assert SECRET not in repr(config)
    assert SECRET not in config.masked_key
    assert config.masked_key == "sk-…****"


def test_mask_secret_hides_short_values_completely():
    assert mask_secret("abc") == "****"


def test_missing_variables_are_named_without_values():
    with pytest.raises(ValueError) as error:
        config_from_env({"LLM_PROVIDER": "openai", "LLM_API_KEY": SECRET})
    assert "LLM_MODEL" in str(error.value)
    assert SECRET not in str(error.value)


def test_unknown_provider_is_rejected():
    with pytest.raises(ValueError, match="unknown LLM_PROVIDER 'other'"):
        client_from_config(LLMConfig("other", "m", SECRET))


class FakeResponses:
    """Stands in for the SDK's client.responses; returns a canned Responses API object."""

    def __init__(self, status="completed", reason=None):
        self.status = status
        self.reason = reason
        self.kwargs = None

    def create(self, **kwargs):
        self.kwargs = kwargs
        usage = SimpleNamespace(
            input_tokens=1500, output_tokens=300,
            input_tokens_details=SimpleNamespace(cached_tokens=100, cache_write_tokens=0),
            output_tokens_details=SimpleNamespace(reasoning_tokens=120),
        )
        details = SimpleNamespace(reason=self.reason) if self.reason else None
        return SimpleNamespace(output_text='{"status": "answered"}', status=self.status,
                               incomplete_details=details, usage=usage, model="gpt-6-luna-2026")


def openai_client(responses):
    return OpenAIClient("gpt-6-luna", SECRET, client=SimpleNamespace(responses=responses))


def test_openai_client_sends_instructions_limits_and_schema():
    responses = FakeResponses()
    openai_client(responses).generate("system text", "user text", max_output_tokens=1200,
                                      json_schema={"type": "object"})
    sent = responses.kwargs
    assert sent["instructions"] == "system text" and sent["input"] == "user text"
    assert sent["max_output_tokens"] == 1200
    assert sent["reasoning"] == {"effort": "low"}
    assert sent["store"] is False
    assert sent["text"]["format"]["type"] == "json_schema"
    assert sent["text"]["format"]["strict"] is True


def test_openai_client_maps_usage_and_keeps_requested_model_name():
    result = openai_client(FakeResponses()).generate("s", "u", max_output_tokens=100)
    assert (result.input_tokens, result.output_tokens, result.reasoning_tokens) == (1500, 300, 120)
    assert result.cached_input_tokens == 100
    assert result.model == "gpt-6-luna"
    assert result.incomplete_reason is None


def test_openai_client_reports_incomplete_answers():
    result = openai_client(FakeResponses("incomplete", "max_output_tokens")).generate(
        "s", "u", max_output_tokens=100)
    assert result.incomplete_reason == "max_output_tokens"


def test_no_schema_means_no_text_format():
    responses = FakeResponses()
    openai_client(responses).generate("s", "u", max_output_tokens=100)
    assert "text" not in responses.kwargs
