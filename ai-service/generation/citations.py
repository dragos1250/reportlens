"""Check the model's [P#] citations against the passages it was given.

The model cites passage ids, never page numbers. The code maps each id to its
document and page, so a cited page is always one of the pages actually sent.
"""

import re
from dataclasses import dataclass, field

# "[P2]" or "[P1, P3]"
_MARKER_GROUP = re.compile(r"\[\s*(P\d+(?:\s*,\s*P\d+)*)\s*\]")


@dataclass(frozen=True)
class Citation:
    marker: str
    doc_id: str
    page: int
    chunk_id: str


@dataclass
class CitationCheck:
    citations: list[Citation]  # valid, in order of first appearance in the answer
    invalid: list[str] = field(default_factory=list)  # ids not among the passages sent
    problems: list[str] = field(default_factory=list)

    @property
    def pages(self) -> list[int]:
        return [c.page for c in self.citations]


def markers_in(text: str) -> list[str]:
    """Passage ids cited in the text, in order of first appearance, without repeats."""
    found: list[str] = []
    for group in _MARKER_GROUP.findall(text):
        for marker in re.split(r"\s*,\s*", group):
            if marker not in found:
                found.append(marker)
    return found


def check_citations(status: str, answer: str, declared: list[str],
                    passages: dict[str, dict]) -> CitationCheck:
    in_text = markers_in(answer)
    check = CitationCheck(
        citations=[
            Citation(m, passages[m]["doc_id"], passages[m]["page"], passages[m]["chunk_id"])
            for m in in_text if m in passages
        ],
        invalid=[m for m in in_text if m not in passages],
    )
    if check.invalid:
        check.problems.append(f"cites passages that were not provided: {', '.join(check.invalid)}")
    if sorted(set(declared)) != sorted(in_text):
        check.problems.append(f"'cited' list {sorted(set(declared))} differs from citations in text {sorted(in_text)}")
    if status == "answered" and not in_text:
        check.problems.append("answer has no citations")
    return check


def render(answer: str, passages: dict[str, dict]) -> str:
    """Replace [P#] with [doc, p. N]; unknown ids are flagged, not hidden."""

    def replace(match: re.Match) -> str:
        parts = []
        for m in re.split(r"\s*,\s*", match.group(1)):
            if m in passages:
                parts.append(f"{passages[m]['doc_id']}, p. {passages[m]['page']}")
            else:
                parts.append(f"INVALID CITATION {m}")
        return "[" + "; ".join(parts) + "]"

    return _MARKER_GROUP.sub(replace, answer)
