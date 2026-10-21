"""Keyword search with BM25 (Okapi), implemented by hand.

score(D, Q) = sum over query terms q of
    IDF(q) * tf(q, D) * (k1 + 1) / (tf(q, D) + k1 * (1 - b + b * |D| / avgdl))

IDF(q) = ln((N - n(q) + 0.5) / (n(q) + 0.5) + 1)   (always positive, as in Lucene)

tf: how often q occurs in D; |D|: document length in tokens; avgdl: average length;
N: number of documents; n(q): documents containing q.
"""

import math
import re
from collections import Counter, defaultdict

import numpy as np

# Standard values from the literature; not tuned on our questions.
DEFAULT_K1 = 1.5  # how fast repeated terms stop adding score
DEFAULT_B = 0.75  # how much long documents are penalised

# Numbers keep their separators ("40.5", "10,414"); words keep digits ("d2d").
_TOKEN = re.compile(r"\d+(?:[.,]\d+)*|\w+")


def tokenize(text: str) -> list[str]:
    return _TOKEN.findall(text.lower())


class BM25:
    def __init__(self, documents: list[list[str]], k1: float = DEFAULT_K1, b: float = DEFAULT_B):
        self.k1 = k1
        self.b = b
        self.doc_count = len(documents)
        self.doc_lengths = np.array([len(doc) for doc in documents], dtype=np.float64)
        self.avg_length = float(self.doc_lengths.mean()) if documents else 0.0

        # Postings: term -> [(document row, term frequency)], so scoring only
        # visits documents that contain the term.
        self.postings: dict[str, list[tuple[int, int]]] = defaultdict(list)
        for row, doc in enumerate(documents):
            for term, tf in Counter(doc).items():
                self.postings[term].append((row, tf))

        self.idf = {
            term: math.log((self.doc_count - len(posts) + 0.5) / (len(posts) + 0.5) + 1)
            for term, posts in self.postings.items()
        }

    def scores(self, query: list[str]) -> np.ndarray:
        """BM25 score of every document for the query tokens."""
        scores = np.zeros(self.doc_count)
        for term in query:
            for row, tf in self.postings.get(term, []):
                length_norm = 1 - self.b + self.b * self.doc_lengths[row] / self.avg_length
                scores[row] += self.idf[term] * tf * (self.k1 + 1) / (tf + self.k1 * length_norm)
        return scores

    def top(self, query: list[str], k: int) -> list[tuple[int, float]]:
        """(row, score) of the k best documents, best first; documents with no match are left out."""
        scores = self.scores(query)
        order = np.argsort(-scores, kind="stable")[:k]  # stable: ties keep document order
        return [(int(row), float(scores[row])) for row in order if scores[row] > 0]
