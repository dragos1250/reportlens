from generation.citations import check_citations, markers_in, render

PASSAGES = {
    "P1": {"chunk_id": "d-p0011-c004", "doc_id": "d", "page": 11},
    "P2": {"chunk_id": "d-p0017-c000", "doc_id": "d", "page": 17},
}


def test_markers_in_finds_single_and_grouped_ids_in_order_without_repeats():
    assert markers_in("A [P2]. B [P1, P2]. C [P3][P1].") == ["P2", "P1", "P3"]


def test_valid_citations_map_to_document_and_page():
    check = check_citations("answered", "Revenue was €40.5 billion [P2].", ["P2"], PASSAGES)
    assert [(c.marker, c.page, c.chunk_id) for c in check.citations] == [("P2", 17, "d-p0017-c000")]
    assert check.invalid == [] and check.problems == []


def test_citation_to_a_passage_not_sent_is_invalid():
    check = check_citations("answered", "Claim [P2]. Other claim [P7].", ["P2", "P7"], PASSAGES)
    assert check.pages == [17]
    assert check.invalid == ["P7"]
    assert any("not provided" in p for p in check.problems)


def test_answer_without_citations_is_a_problem():
    check = check_citations("answered", "Revenue grew.", [], PASSAGES)
    assert check.problems == ["answer has no citations"]


def test_not_found_without_citations_is_fine():
    check = check_citations("not_found", "The passages do not contain this.", [], PASSAGES)
    assert check.problems == []


def test_declared_list_must_match_citations_in_text():
    check = check_citations("answered", "Claim [P1].", ["P1", "P2"], PASSAGES)
    assert any("differs" in p for p in check.problems)


def test_render_replaces_markers_with_document_and_page():
    assert render("Up 8% [P2]. Both [P1, P2].", PASSAGES) == "Up 8% [d, p. 17]. Both [d, p. 11; d, p. 17]."


def test_render_flags_invalid_markers():
    assert render("Claim [P9].", PASSAGES) == "Claim [INVALID CITATION P9]."
