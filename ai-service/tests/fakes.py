"""Test doubles for the language model: no network, no API key."""

from generation.llm import LLMResponse


class FakeLLMClient:
    """Returns a fixed text (or the next of several) and records every request it receives."""

    def __init__(self, text: str | list[str], model: str = "gpt-6-luna", input_tokens: int = 1000,
                 output_tokens: int = 200, incomplete_reason: str | None = None):
        self.model = model
        self.texts = list(text) if isinstance(text, list) else None  # one per call, in order
        self.text = text
        self.input_tokens = input_tokens
        self.output_tokens = output_tokens
        self.incomplete_reason = incomplete_reason
        self.requests: list[dict] = []

    def generate(self, system, user, *, max_output_tokens, json_schema=None) -> LLMResponse:
        self.requests.append({"system": system, "user": user,
                              "max_output_tokens": max_output_tokens, "json_schema": json_schema})
        text = self.texts.pop(0) if self.texts is not None else self.text
        return LLMResponse(text=text, model=self.model, input_tokens=self.input_tokens,
                           output_tokens=self.output_tokens, incomplete_reason=self.incomplete_reason)
