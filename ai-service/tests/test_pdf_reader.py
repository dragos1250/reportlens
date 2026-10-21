from ingestion.pdf_reader import _inside, lines_to_text


def line(text, top, height=10):
    return {"text": text, "top": top, "bottom": top + height}


def test_lines_close_together_form_one_paragraph():
    lines = [line("First", 0), line("second", 12), line("third", 24)]
    assert lines_to_text(lines) == "First\nsecond\nthird"


def test_large_gap_starts_new_paragraph():
    lines = [line("End of one.", 0), line("Start of two.", 30)]
    assert lines_to_text(lines) == "End of one.\n\nStart of two."


def test_moving_up_the_page_starts_new_paragraph():
    # The text flow jumped from the bottom of column 1 to the top of column 2.
    lines = [line("Column one", 500), line("Column two", 100)]
    assert lines_to_text(lines) == "Column one\n\nColumn two"


def test_no_lines_gives_empty_text():
    assert lines_to_text([]) == ""


def test_inside_uses_object_centre():
    bbox = (0, 0, 100, 100)
    assert _inside({"x0": 90, "x1": 104, "top": 10, "bottom": 20}, bbox)
    assert not _inside({"x0": 95, "x1": 115, "top": 10, "bottom": 20}, bbox)
