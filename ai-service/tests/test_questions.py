import json

import pytest

from evaluation.questions import DEV_FILE, QuestionError, load, load_test, sha256_of, validate


def single(**overrides):
    question = {"id": "x1", "category": "single_page", "lang": "en", "question": "q", "doc_id": "d",
                "answerable": True, "expected_pages": [3], "confirmed": True}
    return {**question, **overrides}


def write(tmp_path, rows, name="set.jsonl"):
    path = tmp_path / name
    path.write_text("".join(json.dumps(r) + "\n" for r in rows), encoding="utf-8")
    return path


def test_the_dev_set_in_the_repository_is_valid():
    questions = load(DEV_FILE)
    assert len(questions) == 29
    assert {q["category"] for q in questions} >= {"single_page", "romanian", "multi_page", "compare", "negative"}


def test_answerable_must_fit_the_category():
    with pytest.raises(QuestionError, match="does not fit"):
        validate(single(category="negative"), "t")
    with pytest.raises(QuestionError, match="does not fit"):
        validate(single(category="trap", answerable=True), "t")


def test_compare_needs_pages_for_both_documents():
    compare = single(category="compare", doc_ids=["a", "b"], expected_pages={"a": [1], "b": [2]})
    del compare["doc_id"]
    validate(compare, "t")
    with pytest.raises(QuestionError, match="each of its two documents"):
        validate({**compare, "expected_pages": {"a": [1]}}, "t")
    with pytest.raises(QuestionError, match="two different"):
        validate({**compare, "doc_ids": ["a", "a"]}, "t")


def test_a_question_without_an_answer_can_be_about_both_reports():
    negative = single(category="negative", answerable=False, doc_ids=["a", "b"], expected_pages=[])
    del negative["doc_id"]
    validate(negative, "t")
    with pytest.raises(QuestionError, match="two different"):
        validate({**negative, "doc_ids": ["a"]}, "t")


def test_multi_page_needs_two_parts():
    validate(single(category="multi_page", expected_parts=[[1], [2, 3]]), "t")
    with pytest.raises(QuestionError, match="expected_parts"):
        validate(single(category="multi_page", expected_parts=[[1]]), "t")


def test_a_translation_must_be_in_the_same_file(tmp_path):
    path = write(tmp_path, [single(id="q1", pair="q2")])
    with pytest.raises(QuestionError, match="pair not in the same file"):
        load(path)


def test_duplicate_ids_are_refused(tmp_path):
    with pytest.raises(QuestionError, match="duplicate"):
        load(write(tmp_path, [single(), single()]))


def test_the_test_set_needs_final_and_an_unchanged_hash(tmp_path):
    path = write(tmp_path, [single()], "test.jsonl")
    sealed = sha256_of(path)
    with pytest.raises(QuestionError, match="--final"):
        load_test(path, final=False, expected_sha256=sealed)
    with pytest.raises(QuestionError, match="not sealed"):
        load_test(path, final=True, expected_sha256=None)
    assert load_test(path, final=True, expected_sha256=sealed)[0]["id"] == "x1"

    path.write_text(path.read_text(encoding="utf-8") + json.dumps(single(id="x2")) + "\n", encoding="utf-8")
    with pytest.raises(QuestionError, match="changed since it was sealed"):
        load_test(path, final=True, expected_sha256=sealed)
