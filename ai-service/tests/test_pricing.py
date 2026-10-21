import pytest

from generation.llm import LLMResponse
from generation.pricing import cost_usd


def response(model="gpt-6-luna", **tokens):
    return LLMResponse(text="", model=model, **tokens)


def test_cost_of_plain_input_and_output():
    # 1500 * 0.10 + 800 * 0.50 = 150 + 400 = 550 per 1M -> 0.00055 USD
    assert cost_usd(response(input_tokens=1500, output_tokens=800)) == pytest.approx(0.00055)


def test_cached_input_is_priced_at_cached_rate():
    # 1000 plain * 0.10 + 500 cached * 0.01 + 0 output = 100 + 5 = 105 per 1M
    cost = cost_usd(response(input_tokens=1500, output_tokens=0, cached_input_tokens=500))
    assert cost == pytest.approx(0.000105)


def test_more_capable_model_costs_more():
    tokens = {"input_tokens": 1500, "output_tokens": 800}
    # 1500 * 2 + 800 * 10 = 3000 + 8000 = 11000 per 1M
    assert cost_usd(response("gpt-6.1-sol", **tokens)) == pytest.approx(0.011)


def test_unknown_model_has_unknown_cost():
    assert cost_usd(response("some-local-model", input_tokens=10, output_tokens=10)) is None
