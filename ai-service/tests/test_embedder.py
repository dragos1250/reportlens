import numpy as np

from retrieval.embedder import Embedder, prefixes_for, with_prefix


class FakeModel:
    """Records what it was asked to encode; returns fixed-size vectors."""

    def __init__(self):
        self.inputs = []

    def encode(self, texts, **kwargs):
        self.inputs.append((list(texts), kwargs))
        return np.ones((len(texts), 4))


def test_e5_models_use_query_and_passage_prefixes():
    assert prefixes_for("intfloat/multilingual-e5-small") == ("query: ", "passage: ")
    assert prefixes_for("intfloat/multilingual-e5-base") == ("query: ", "passage: ")


def test_other_models_get_no_prefix():
    assert prefixes_for("BAAI/bge-m3") == ("", "")


def test_with_prefix():
    assert with_prefix(["a", "b"], "passage: ") == ["passage: a", "passage: b"]


def test_embedder_adds_passage_prefix_to_chunks_and_query_prefix_to_questions():
    model = FakeModel()
    embedder = Embedder("intfloat/multilingual-e5-small", model=model)

    embedder.embed_passages(["Revenue grew."])
    embedder.embed_query("Care a fost venitul?")

    assert model.inputs[0][0] == ["passage: Revenue grew."]
    assert model.inputs[1][0] == ["query: Care a fost venitul?"]


def test_embedder_asks_for_normalised_float32_vectors():
    model = FakeModel()
    vectors = Embedder("intfloat/multilingual-e5-small", model=model).embed_passages(["x", "y"])
    assert model.inputs[0][1]["normalize_embeddings"] is True
    assert vectors.dtype == np.float32 and vectors.shape == (2, 4)


def test_embed_query_returns_a_single_vector():
    vector = Embedder("intfloat/multilingual-e5-small", model=FakeModel()).embed_query("q")
    assert vector.shape == (4,)
