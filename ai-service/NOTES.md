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

## Header/footer removal is conservative

**Decision:** only the first and last line of a page can be removed, and only if its
normalised form (digits replaced by `#`) is the first or last line on at least 20 pages
(`--edge-min-pages`). Text in the middle of a page is never touched.

**Why 20:** on the Vodafone Form 20-F FY26, the real headers/footers repeat on 41-85 pages,
while ordinary lines that happen to sit at a page edge repeat at most 14 times
("Exhibit #.#"), most only 1-2 times.

**Result on that report:** 327 lines removed, all headers, footers or page numbers:

| Pages | Line (normalised) |
|---|---|
| 85 | `Strategic report Governance Financials Other information Vodafone Group Plc Annual Report on Form #-F # #` |
| 84 | `# Vodafone Group Plc Annual Report on Form #-F # Strategic report Governance Financials Other information` |
| 76 | `CERTAIN IDENTIFIED INFORMATION HAS BEEN EXCLUDED FROM THIS EXHIBIT ...` |
| 41 | `Strategic report Governance Financials Other information Vodafone Group Plc Annual Report on Form #-F #` |
| 41 | `#` (page number alone) |

Chunks went from 2614 to 2575. 42 chunks still contain the header bar (page 5 and
mostly even pages 146-230): there the page number is the first line and the header is
the second, so it is not an edge line.

## Known gaps

- 116 of 588 pages have no text layer (scanned exhibits, pages 262 and 341-581).
  They are skipped; OCR is out of scope for now.
- Header bar left in 42 chunks (see above).
