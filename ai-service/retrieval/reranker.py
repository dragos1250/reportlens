"""Re-order candidate chunks with a cross-encoder.

A cross-encoder reads the question and the chunk together, so it judges relevance
better than comparing two separate vectors, but it is much slower: it runs once
per (question, chunk) pair. So it only re-orders a short list of candidates.
"""

DEFAULT_RERANKER = "cross-encoder/mmarco-mMiniLMv2-L12-H384-v1"
MAX_LENGTH = 512  # tokens per (question, chunk) pair; our chunks have at most 391


class Reranker:
    def __init__(self, model_name: str = DEFAULT_RERANKER, model=None):
        """model can be injected (tests); otherwise the model is loaded from the HF cache."""
        if model is None:
            # Imported here: loading torch is slow and the tests do not need it.
            from sentence_transformers import CrossEncoder
            model = CrossEncoder(model_name, device="cpu", max_length=MAX_LENGTH)
        self.model_name = model_name
        self._model = model

    def rerank(self, query: str, texts: list[str]) -> list[tuple[int, float]]:
        """(position in texts, relevance score), most relevant first."""
        if not texts:
            return []
        scores = self._model.predict([(query, text) for text in texts], batch_size=32)
        order = sorted(range(len(texts)), key=lambda i: -float(scores[i]))  # stable on ties
        return [(i, float(scores[i])) for i in order]
