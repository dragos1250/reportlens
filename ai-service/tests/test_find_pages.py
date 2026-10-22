from evaluation.find_pages import find, normalise

PAGES = [
    "Strategic report",
    "Cash and undrawn\ncommitted facilities of €7.6 billion. Undrawn COMMITTED lines.",
    "",  # a scanned page: no text, never a candidate
    "Net debt at 31 December 2025 was EUR 140 billion.",
]


def test_matching_ignores_case_and_line_breaks():
    assert normalise("Undrawn\n  Committed") == "undrawn committed"
    results = find(PAGES, ["undrawn committed"])
    assert [r["page"] for r in results] == [2]
    assert results[0]["count"] == 2
    assert "€7.6 billion" in results[0]["snippets"][0]


def test_pages_are_physical_and_one_based():
    assert [r["page"] for r in find(PAGES, ["net debt"])] == [4]


def test_every_term_must_be_on_the_same_page():
    assert [r["page"] for r in find(PAGES, ["net debt", "31 december 2025"])] == [4]
    assert find(PAGES, ["net debt", "undrawn"]) == []


def test_pages_without_text_never_match():
    assert all(r["page"] != 3 for r in find(PAGES, [" "]))
