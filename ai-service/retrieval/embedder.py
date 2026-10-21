"""Turn text into normalised embedding vectors."""

import numpy as np

DEFAULT_MODEL = "intfloat/multilingual-e5-small"

# E5 models were trained with these prefixes; without them retrieval quality drops.
# Other models get no prefix.
_E5_PREFIXES = ("query: ", "passage: ")
_PREFIXES = {
    "intfloat/multilingual-e5-small": _E5_PREFIXES,
    "intfloat/multilingual-e5-base": _E5_PREFIXES,
}


def prefixes_for(model_name: str) -> tuple[str, str]:
    """(query prefix, passage prefix) expected by the model."""
    return _PREFIXES.get(model_name, ("", ""))


def with_prefix(texts: list[str], prefix: str) -> list[str]:
    return [prefix + text for text in texts]


class Embedder:
    def __init__(self, model_name: str = DEFAULT_MODEL, model=None):
        """model can be injected (tests); otherwise the model is loaded from the HF cache."""
        if model is None:
            # Imported here: loading torch is slow and the tests do not need it.
            from sentence_transformers import SentenceTransformer
            model = SentenceTransformer(model_name, device="cpu")
        self.model_name = model_name
        self._model = model
        self._query_prefix, self._passage_prefix = prefixes_for(model_name)

    def _encode(self, texts: list[str], show_progress: bool) -> np.ndarray:
        vectors = self._model.encode(
            texts,
            batch_size=32,
            normalize_embeddings=True,  # unit length, so cosine similarity = dot product
            convert_to_numpy=True,
            show_progress_bar=show_progress,
        )
        return np.asarray(vectors, dtype=np.float32)

    def embed_passages(self, texts: list[str], show_progress: bool = False) -> np.ndarray:
        return self._encode(with_prefix(texts, self._passage_prefix), show_progress)

    def embed_query(self, text: str) -> np.ndarray:
        return self._encode(with_prefix([text], self._query_prefix), show_progress=False)[0]
