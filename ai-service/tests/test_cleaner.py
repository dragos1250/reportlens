from ingestion.cleaner import normalize_line, remove_repeated_edge_lines

HEADER = "Vodafone Group Plc Annual Report 2026"


LETTERS = "abcdefghijklmnopqrstuvwxyz"


def report(n_pages):
    """Pages with a header on top and the page number as footer.

    Bodies differ by letter, not digit: digits are normalised away, so
    "page 1" and "page 2" would count as the same repeated line.
    """
    return [f"{HEADER} {i}\n\nBody text of page {LETTERS[i - 1]}.\n\n{i}" for i in range(1, n_pages + 1)]


def test_normalize_line_replaces_numbers_and_collapses_spaces():
    assert normalize_line("Annual  Report 2026   page 15") == "Annual Report # page #"


def test_removes_header_and_footer_repeated_on_enough_pages():
    cleaned, removed = remove_repeated_edge_lines(report(3), min_pages=3)
    assert removed == 6
    assert cleaned[0].strip() == "Body text of page a."


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


def test_header_below_page_number_is_peeled_in_a_second_pass():
    pages = [f"{i}\n{HEADER}\nBody of page {letter}" for i, letter in enumerate("abc")]
    cleaned, removed = remove_repeated_edge_lines(pages, min_pages=3)
    assert removed == 6  # pass 1: page number, pass 2: header
    assert cleaned[0].strip() == "Body of page a"


def test_single_pass_leaves_header_below_page_number():
    pages = [f"{i}\n{HEADER}\nBody of page {letter}" for i, letter in enumerate("abc")]
    cleaned, removed = remove_repeated_edge_lines(pages, min_pages=3, max_passes=1)
    assert removed == 3
    assert cleaned[0].strip() == f"{HEADER}\nBody of page a"


def test_peeling_stops_at_first_line_that_is_not_repeated():
    pages = [f"{i}\nUnique opening line {letter}\n{HEADER}\nBody {letter}" for i, letter in enumerate("abc")]
    cleaned, _ = remove_repeated_edge_lines(pages, min_pages=3)
    # The page number goes; the header sits below an ordinary line, so it stays.
    assert cleaned[0].strip() == f"Unique opening line a\n{HEADER}\nBody a"


def test_skips_glyph_only_lines_when_finding_the_edge():
    pages = [f"(cid:2)\n{HEADER} {i}\n{body}" for i, body in enumerate(["Alpha", "Beta", "Gamma"])]
    cleaned, removed = remove_repeated_edge_lines(pages, min_pages=3)
    assert removed == 3
    assert cleaned[0] == "(cid:2)\nAlpha"


def test_empty_pages_are_left_alone():
    cleaned, removed = remove_repeated_edge_lines(["", "  "], min_pages=1)
    assert (cleaned, removed) == (["", "  "], 0)
