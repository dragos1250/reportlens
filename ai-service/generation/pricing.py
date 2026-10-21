"""Estimated cost of an LLM call from the token counts the API reports.

Prices change: they are copied by hand from the source below, with the date.
"""

from dataclasses import dataclass

from .llm import LLMResponse

PRICES_SOURCE = "https://developers.openai.com/api/docs/pricing"
PRICES_CHECKED = "2026-10-21"


@dataclass(frozen=True)
class Price:
    """USD per 1M tokens, standard tier, short context (<= 272K input tokens)."""

    input: float
    cached_input: float
    cache_write: float
    output: float  # reasoning tokens are billed as output


PRICES = {
    "gpt-6-luna": Price(input=0.10, cached_input=0.01, cache_write=0.125, output=0.50),
    "gpt-6.1-sol": Price(input=2.00, cached_input=0.10, cache_write=2.50, output=10.00),
}


def cost_usd(response: LLMResponse) -> float | None:
    """Estimated cost in USD, or None if the model is not in the price table.

    Cached and cache-write tokens are counted as part of input_tokens and
    priced at their own rates; the rest of the input is priced normally.
    """
    price = PRICES.get(response.model)
    if price is None:
        return None
    plain_input = max(response.input_tokens - response.cached_input_tokens - response.cache_write_tokens, 0)
    return (
        plain_input * price.input
        + response.cached_input_tokens * price.cached_input
        + response.cache_write_tokens * price.cache_write
        + response.output_tokens * price.output
    ) / 1_000_000
