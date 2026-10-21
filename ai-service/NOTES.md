# AI service notes

Design decisions and the measurements behind them.
Measured on the Vodafone Form 20-F FY26 (588 pages), on a Windows laptop CPU.

## Stage 2: ingestion

### Table detection is off by default

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

### Header/footer removal is conservative

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

### Known gaps

- 116 of 588 pages have no text layer (scanned exhibits, pages 262 and 341-581).
  They are skipped; OCR is out of scope for now.
- Header bar left in 42 chunks (see above).

## Stage 3: embeddings and vector search

### Models compared

Token counts measured with each model's own tokenizer on all 2575 chunks
(max 1000 characters each). E5 counts include the `passage: ` prefix.

| Model | Dim | Layers | Weights | Max tokens | Tokens per chunk (median / p95 / max) | Chunks truncated |
|---|---|---|---|---|---|---|
| paraphrase-multilingual-MiniLM-L12-v2 | 384 | 12 | 471 MB | 128 | 183 / 248 / 389 | 2083 / 2575 (80.9%) |
| multilingual-e5-small | 384 | 12 | 471 MB | 512 | 185 / 250 / 391 | 0 |
| multilingual-e5-base | 768 | 12 | 1.11 GB | 512 | 185 / 250 / 391 | 0 |
| bge-m3 | 1024 | 24 | 2.27 GB | 8192 | 183 / 248 / 389 | 0 |

### Decision: multilingual-e5-small

- No chunk is truncated (longest chunk: 391 of 512 tokens). MiniLM would ignore the
  end of 81% of the chunks, unless chunks were cut to roughly half their size.
- Same size and dimension as MiniLM; smallest of the models that fit.
- bge-m3's 8192-token limit brings nothing here and it is the heaviest model.
- e5-base is the planned comparison once the evaluation questions exist.

E5 expects `query: ` before questions and `passage: ` before chunks; `Embedder` adds them.

### Measured costs

| | Value |
|---|---|
| `.venv` before / after installing sentence-transformers | 86 MB / 1153 MB |
| e5-small in the Hugging Face cache | 471 MB |
| `build_index`, first run (includes model download) | 65 s: 19.1 s load + 45.0 s embedding |
| `build_index`, model already cached | 51 s: 7.6 s load + 42.2 s embedding |
| Vectors | 2575 x 384 float32, 4.0 MB |

### Observations from three sample queries

- **Scores do not separate good from bad results.** Top-5 scores ranged from 0.786
  to 0.868 across all three queries. A completely wrong result scored 0.809, while
  correct ones scored 0.843-0.868. A fixed score threshold will not work as the
  "not in the report" guardrail (stage 6).
- **A Romanian question failed.** "Care este datoria netă a grupului la sfârșitul anului?"
  (net debt) returned only directors' pay and board composition passages; none
  mention net debt. The English question on total revenue found pages 11 and 17 at
  ranks 1-2. BM25 (stage 5) will not fix this by itself, since the Romanian words do
  not occur in the English text.
