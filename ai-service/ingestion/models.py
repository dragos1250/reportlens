from dataclasses import asdict, dataclass, field

# A table as extracted from the PDF: rows of cells, a cell can be empty (None).
Table = list[list[str | None]]


@dataclass
class Page:
    """Raw content of one PDF page, before chunking."""

    number: int  # 1-based physical page number in the PDF
    text: str  # paragraphs separated by a blank line, table areas removed
    tables: list[Table] = field(default_factory=list)


@dataclass(frozen=True)
class Chunk:
    """A passage that can be retrieved and cited (document + page)."""

    chunk_id: str  # deterministic, e.g. "vodafone-fy26-p0042-c003"
    doc_id: str
    page: int
    chunk_index: int  # position within the page
    kind: str  # "text" or "table"
    text: str

    def to_dict(self) -> dict:
        return asdict(self)
