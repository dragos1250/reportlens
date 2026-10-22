"""Checks on an uploaded file, before and while it is read. Every message is for the user."""

import re
from pathlib import Path


class UploadRejected(Exception):
    """The upload cannot be used; the message says why and what to do."""


def check_header(data: bytes) -> None:
    """The file must really be a PDF: its first bytes, not its name or declared type."""
    if not data.startswith(b"%PDF-"):
        raise UploadRejected("This file is not a PDF. Upload a PDF report.")


def check_size(size: int, max_bytes: int) -> None:
    if size == 0:
        raise UploadRejected("The file is empty.")
    if size > max_bytes:
        raise UploadRejected(f"The file is larger than {max_bytes // (1024 * 1024)} MB.")


def safe_title(filename: str | None) -> str:
    """A display title from the uploaded file's name. The name never becomes a path: files
    are stored under a random id."""
    name = re.split(r"[\\/]", filename or "")[-1]  # no folders, whatever the client sent
    name = re.sub(r"\.pdf$", "", name, flags=re.IGNORECASE)
    name = re.sub(r"[\x00-\x1f\x7f]", "", name)  # no control characters
    name = re.sub(r"\s+", " ", name).strip()[:200]
    return name or "Uploaded report"


def count_pages(path: Path) -> int:
    """Number of pages, read from the page tree before any text is extracted."""
    import pdfplumber
    try:
        with pdfplumber.open(path) as pdf:
            return len(pdf.pages)
    except Exception as error:  # pdfminer raises many types for damaged or encrypted files
        if "password" in f"{type(error).__name__} {error}".lower() or "encrypt" in str(error).lower():
            raise UploadRejected("This PDF is password-protected. Upload a version without a password.") from error
        raise UploadRejected("This PDF could not be opened; it may be damaged. Try another file.") from error


def check_pages(pages: int, max_pages: int) -> None:
    if pages == 0:
        raise UploadRejected("This PDF has no pages.")
    if pages > max_pages:
        raise UploadRejected(f"This PDF has {pages} pages; the limit is {max_pages}.")


def check_text_layer(pages_with_text: int, pages: int, min_share: float) -> None:
    """Pages without a text layer are scanned images; there is no OCR, so a mostly scanned
    document cannot be searched or cited."""
    if pages_with_text < min_share * pages:
        raise UploadRejected(
            f"Only {pages_with_text} of {pages} pages have a text layer. This looks like a scanned document, "
            "and ReportLens cannot read scanned pages (there is no OCR).")
