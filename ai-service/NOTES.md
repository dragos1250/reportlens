# Ingestion notes

## Table detection is off by default

**Decision:** `read_pdf` does not detect tables unless asked (`--tables` in the CLI).
Table rows stay in the running text, line by line, with their labels and numbers.

**Why:** measured on the Vodafone Form 20-F FY26 (588 pages) with pdfplumber 0.11.10
and its default (line-based) table settings:

- 505 tables detected.
- Only 7 passed a plausibility check (at least 2 rows and 2 columns, no cell over
  200 characters, at least 3 cells containing digits). Rejected:
  - 241 had fewer than 2 rows or 2 columns (e.g. page numbers, single number columns);
  - 81 had a cell over 200 characters (layout boxes holding a whole page of text);
  - 176 had fewer than 3 cells with digits (e.g. the navigation bar in the page header).
- The 7 plausible ones held numbers without row labels or headers, so they could not be
  cited on their own.
- Text inside detected tables was removed from the page text, so data was lost.
  Page 180, "Equity shareholders' funds": the chunk kept `11,887 660` and lost `10,414` and `319`.
  Page 20 produced no text chunk at all.

Without table detection, the same run gives 2614 text chunks, page 180 reads
`Equity shareholders' funds 10,414 11,887 319 660`, and page 20 has 9 text chunks.

The table chunking code (`table_to_chunks`) is kept and tested for reports whose
tables have ruling lines.

## Known gaps

- 116 of 588 pages have no text layer (scanned exhibits, pages 262 and 341-581).
  They are skipped; OCR is out of scope for now.
- Repeated headers/footers (e.g. "Strategic report Governance Financials Other
  information Vodafone Group Plc Annual Report on Form 20-F 2026") are not removed yet.
