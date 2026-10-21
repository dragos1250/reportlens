"""'Not in the report' guard, applied in code before any LLM call.

If even the closest chunk is a weak match, the question is refused without calling
the LLM (no cost, no chance to guess). The LLM's own "not_found" status remains a
second layer for questions that pass the guard.

The score is the cosine similarity of the closest chunk (multilingual-e5). Its model
card says these scores "distribute around 0.7 to 1.0", so the default sits near the
bottom of that range: it only refuses clearly unrelated questions. It is not tuned
on the evaluation questions; tuning waits for a dev/test split (stage 10).
"""

DEFAULT_MIN_SCORE = 0.75

_REFUSALS = {
    "en": "The report does not appear to contain information about this question.",
    "ro": "Raportul nu pare să conțină informații despre această întrebare.",
}


def is_relevant(best_score: float, min_score: float) -> bool:
    return best_score >= min_score


def refusal_message(lang: str) -> str:
    return _REFUSALS.get(lang, _REFUSALS["en"])
