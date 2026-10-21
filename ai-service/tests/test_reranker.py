from retrieval.reranker import Reranker


class FakeCrossEncoder:
    """Scores a pair by how many query words occur in the text."""

    def __init__(self):
        self.pairs = []

    def predict(self, pairs, **kwargs):
        self.pairs.extend(pairs)
        return [sum(word in text for word in query.split()) for query, text in pairs]


def test_rerank_orders_by_model_score():
    reranker = Reranker("fake", model=FakeCrossEncoder())
    texts = ["nothing here", "satellite partner AST", "satellite only"]
    assert reranker.rerank("satellite partner", texts) == [(1, 2.0), (2, 1.0), (0, 0.0)]


def test_rerank_sends_question_and_text_together():
    model = FakeCrossEncoder()
    Reranker("fake", model=model).rerank("q", ["a", "b"])
    assert model.pairs == [("q", "a"), ("q", "b")]


def test_rerank_keeps_original_order_on_ties():
    reranker = Reranker("fake", model=FakeCrossEncoder())
    assert [i for i, _ in reranker.rerank("x", ["a", "b", "c"])] == [0, 1, 2]


def test_rerank_with_no_candidates():
    assert Reranker("fake", model=FakeCrossEncoder()).rerank("q", []) == []
