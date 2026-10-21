from ingestion.chunker import (
    chunk_page,
    clean_paragraph,
    make_chunk_id,
    pack,
    split_paragraphs,
    split_text,
    table_to_chunks,
)
from ingestion.models import Page


def test_clean_paragraph_joins_hyphenated_words_and_collapses_whitespace():
    assert clean_paragraph("opera-\ntional   costs\nrose") == "operational costs rose"


def test_clean_paragraph_keeps_real_hyphens():
    assert clean_paragraph("year-on-year\nGrowth-\nRate") == "year-on-year Growth- Rate"


def test_split_paragraphs_drops_empty_ones():
    assert split_paragraphs("First\nline.\n\n\n  \n\nSecond.") == ["First line.", "Second."]


def test_pack_respects_max_chars():
    chunks = pack(["aaaa", "bbbb", "cccc"], max_chars=9, sep=" ")
    assert chunks == ["aaaa bbbb", "cccc"]


def test_pack_adds_overlap_from_previous_chunk():
    chunks = pack(["one two three", "four five six"], max_chars=20, sep=" ", overlap_chars=6)
    assert chunks == ["one two three", "three four five six"]


def test_pack_skips_overlap_when_it_does_not_fit():
    chunks = pack(["one two three", "four five six seven"], max_chars=20, sep=" ", overlap_chars=6)
    assert chunks == ["one two three", "four five six seven"]


def test_split_text_keeps_short_paragraphs_together():
    assert split_text("Alpha.\n\nBeta.", max_chars=100) == ["Alpha.\n\nBeta."]


def test_split_text_splits_long_paragraph_at_sentences():
    text = " ".join(f"Sentence number {i}." for i in range(20))
    chunks = split_text(text, max_chars=100, overlap_chars=0)
    assert len(chunks) > 1
    assert all(len(c) <= 100 for c in chunks)
    assert all(c.endswith(".") for c in chunks)
    assert " ".join(chunks) == text


def test_split_text_never_exceeds_max_chars_with_overlap():
    text = "\n\n".join("word " * 30 for _ in range(10))
    assert all(len(c) <= 200 for c in split_text(text, max_chars=200, overlap_chars=50))


def test_table_to_chunks_renders_header_and_rows():
    table = [["Metric", "FY26", None], ["Revenue", "40.5", ""], [None, None, None]]
    assert table_to_chunks(table) == [
        "| Metric | FY26 |  |\n|---|---|---|\n| Revenue | 40.5 |  |"
    ]


def test_table_to_chunks_repeats_header_when_split():
    table = [["Country", "Customers"]] + [[f"Country {i}", str(i)] for i in range(30)]
    chunks = table_to_chunks(table, max_chars=120)
    assert len(chunks) > 1
    assert all(c.startswith("| Country | Customers |\n|---|---|") for c in chunks)
    assert all(len(c) <= 120 for c in chunks)


def test_table_to_chunks_ignores_empty_table():
    assert table_to_chunks([[None, ""], ["  ", None]]) == []


def test_make_chunk_id_is_deterministic_and_padded():
    assert make_chunk_id("vodafone-fy26", 42, 3) == "vodafone-fy26-p0042-c003"


def test_chunk_page_puts_text_before_tables_and_keeps_page_metadata():
    page = Page(number=7, text="Intro paragraph.", tables=[[["A", "B"], ["1", "2"]]])
    chunks = chunk_page("doc", page)
    assert [(c.kind, c.chunk_index, c.chunk_id) for c in chunks] == [
        ("text", 0, "doc-p0007-c000"),
        ("table", 1, "doc-p0007-c001"),
    ]
    assert all(c.page == 7 and c.doc_id == "doc" for c in chunks)


def test_chunk_page_returns_nothing_for_empty_page():
    assert chunk_page("doc", Page(number=1, text="  \n\n ")) == []
