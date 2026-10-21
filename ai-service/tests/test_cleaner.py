from ingestion.cleaner import normalize_line, remove_repeated_edge_lines

HEADER = "Vodafone Group Plc Annual Report 2026"


def report(n_pages, body=lambda i: f"Body text of page {i}."):
    """Pages with a header on top and the page number as footer."""
    return [f"{HEADER} {i}\n\n{body(i)}\n\n{i}" for i in range(1, n_pages + 1)]


def test_normalize_line_replaces_numbers_and_collapses_spaces():
    assert normalize_line("Annual  Report 2026   page 15") == "Annual Report # page #"


def test_removes_header_and_footer_repeated_on_enough_pages():
    cleaned, removed = remove_repeated_edge_lines(report(3), min_pages=3)
    assert removed == 6
    assert cleaned[0].strip() == "Body text of page 1."


def test_keeps_edge_lines_below_threshold():
    pages = report(3)
    cleaned, removed = remove_repeated_edge_lines(pages, min_pages=4)
    assert removed == 0
    assert cleaned == pages


def test_normal_line_repeated_twice_is_not_removed():
    pages = report(25)
    pages[4] = "(a) a Change of Control occurs; and\nmore text"
    pages[9] = "(a) a Change of Control occurs; and\nother text"
    cleaned, _ = remove_repeated_edge_lines(pages, min_pages=20)
    assert cleaned[4].startswith("(a) a Change of Control occurs; and")
    assert cleaned[9].startswith("(a) a Change of Control occurs; and")


def test_never_removes_lines_from_the_middle_of_a_page():
    pages = report(3)
    pages[1] = f"Intro\n{HEADER} 99\nOutro"
    cleaned, _ = remove_repeated_edge_lines(pages, min_pages=2)
    assert cleaned[1] == f"Intro\n{HEADER} 99\nOutro"


def test_skips_glyph_only_lines_when_finding_the_edge():
    pages = [f"(cid:2)\n{HEADER} {i}\n{body}" for i, body in enumerate(["Alpha", "Beta", "Gamma"])]
    cleaned, removed = remove_repeated_edge_lines(pages, min_pages=3)
    assert removed == 3
    assert cleaned[0] == "(cid:2)\nAlpha"


def test_empty_pages_are_left_alone():
    cleaned, removed = remove_repeated_edge_lines(["", "  "], min_pages=1)
    assert (cleaned, removed) == (["", "  "], 0)
