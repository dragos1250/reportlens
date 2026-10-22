"""The evaluation question sets: schema, loading and checks (see eval/README.md).

eval/dev.jsonl is for tuning; eval/test.jsonl is measured once, at the end, and its
sha256 is written in eval/README.md before that run. Reading the test set needs
final=True and a matching hash, so no tuning script can look at it by accident.
"""

import hashlib
import json
from pathlib import Path

EVAL_DIR = Path(__file__).resolve().parents[2] / "eval"
DEV_FILE = EVAL_DIR / "dev.jsonl"
TEST_FILE = EVAL_DIR / "test.jsonl"

CATEGORIES = {"single_page", "multi_page", "romanian", "compare", "negative", "trap"}
UNANSWERABLE = {"negative", "trap"}  # a trap looks answerable; the right behaviour is to refuse or flag it


class QuestionError(ValueError):
    pass


def validate(question: dict, where: str) -> None:
    def fail(message: str):
        raise QuestionError(f"{where}: {message}")

    for name in ("id", "category", "lang", "question", "answerable", "confirmed"):
        if name not in question:
            fail(f"missing {name}")
    category = question["category"]
    if category not in CATEGORIES:
        fail(f"unknown category {category!r}")
    if question["answerable"] == (category in UNANSWERABLE):
        fail(f"answerable={question['answerable']} does not fit category {category!r}")

    # Two reports (doc_ids) for a comparison, or for a question about both that has no
    # answer (e.g. a negative asked of both reports); it then goes through /compare.
    if category == "compare" or "doc_ids" in question:
        doc_ids = question.get("doc_ids")
        if not isinstance(doc_ids, list) or len(doc_ids) != 2 or doc_ids[0] == doc_ids[1]:
            fail("a question about two reports needs doc_ids with two different documents")
        pages = question.get("expected_pages")
        if question["answerable"] and (not isinstance(pages, dict) or set(pages) != set(doc_ids)
                                       or not all(pages.values())):
            fail("compare needs expected_pages for each of its two documents")
        return

    if "doc_id" not in question:
        fail("missing doc_id")
    if category == "multi_page":
        parts = question.get("expected_parts")
        if not isinstance(parts, list) or len(parts) < 2 or not all(parts):
            fail("multi_page needs expected_parts: two or more non-empty page lists")
    elif question["answerable"] and not question.get("expected_pages"):
        fail("an answerable question needs expected_pages")


def load(path: Path) -> list[dict]:
    questions = []
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if line.strip():
            question = json.loads(line)
            validate(question, f"{path.name}:{number}")
            questions.append(question)
    ids = [q["id"] for q in questions]
    duplicates = sorted({i for i in ids if ids.count(i) > 1})
    if duplicates:
        raise QuestionError(f"{path.name}: duplicate ids {duplicates}")
    missing_pairs = sorted(q["id"] for q in questions if q.get("pair") and q["pair"] not in ids)
    if missing_pairs:
        # A translation and its original must be in the same set, or the test set would
        # hold a question already seen in another language.
        raise QuestionError(f"{path.name}: pair not in the same file for {missing_pairs}")
    return questions


def sha256_of(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_test(path: Path = TEST_FILE, *, final: bool, expected_sha256: str | None) -> list[dict]:
    """The test set, only for the final measurement, and only unchanged since it was sealed."""
    if not final:
        raise QuestionError("the test set is read only for the final run (--final)")
    if not expected_sha256:
        raise QuestionError("the test set is not sealed: write its sha256 in eval/README.md first")
    actual = sha256_of(path)
    if actual != expected_sha256:
        raise QuestionError(f"test set changed since it was sealed: sha256 {actual} != {expected_sha256}")
    return load(path)
