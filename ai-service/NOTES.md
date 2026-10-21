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

Chunks went from 2614 to 2575. 42 chunks still contained the header bar (page 5 and
mostly even pages 146-230): there the page number is the first line and the header is
the second, so it was not an edge line.

**Update (stage 5, step 0): repeated peeling.** The same rule now runs in passes
(at most 3, `DEFAULT_EDGE_MAX_PASSES`): removing a page number exposes the header
below it, which is then checked like any edge line. Peeling stops at the first line
that is not repeated on 20 pages. Lines removed per pass:

| Pass | Lines | What |
|---|---|---|
| 1 | 327 | the five keys in the table above |
| 2 | 159 | 42 header bars below a page number; 76 second line of the exhibit banner; 41 page numbers exposed by pass 1 (all checked: printed page = PDF page minus 5-9) |
| 3 | 75 | `Page # of #` exhibit footers |

Total 561 lines; chunks 2575 -> 2549; chunks with the header bar 42 -> 0.

Effect on retrieval (e5-small, 10 questions): hit@5 3/10 -> 3/10, hit@10 3/10 -> 4/10,
hit@20 9/10 -> 9/10. Cleaner chunks, but no gain at rank 5: q03/q04 lost the
header-bar chunks from their top 5 and still miss.

### Known gaps

- 116 of 588 pages have no text layer (scanned exhibits, pages 262 and 341-581).
  They are skipped; OCR is out of scope for now.
- The exhibit banner "CERTAIN IDENTIFIED INFORMATION ..." is left in 7 chunks where it
  is not at a page edge.

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
  to 0.868 across all three queries. An irrelevant result scored 0.809, while
  correct ones scored 0.843-0.868. A fixed score threshold will not work as the
  "not in the report" guardrail (stage 6).
- **One sample question had no valid answer in the document.** "Care este datoria netă
  a grupului la sfârșitul anului?" (Group net debt at year end) returned directors' pay
  and board passages. This is not a weakness of Romanian retrieval: this Form 20-F does
  not state the Group net debt figure. "Net debt" occurs only 4 times (pages 183, 193,
  196), and page 193 describes the cash and investments included in net debt.
  Lesson: check every evaluation question against the document before using it.

### Retrieval evaluation (hit@5)

Questions: `eval/retrieval_questions.jsonl`, 10 hand-written questions, 5 Romanian-English
pairs, expected pages checked in the PDF. Pages are **physical PDF pages**; printed page
numbers differ (offset 5 at the start, e.g. printed 15 = PDF 20; offset 8 later, e.g.
printed 172 = PDF 180).

| | e5-small | e5-base |
|---|---|---|
| hit@5, all | 3/10 (30%) | 4/10 (40%) |
| hit@5, English | 2/5 (40%) | 2/5 (40%) |
| hit@5, Romanian | 1/5 (20%) | 2/5 (40%) |
| Model in HF cache | 471 MB | 1083 MB |
| Embedding 2575 chunks | 42-45 s | 136.6 s |
| Vectors | 4.0 MB (384 dim) | 7.9 MB (768 dim) |

Rank of the best chunk on an expected page, in the full ranking of 2575 chunks
(5 or less = hit):

| Question | e5-small | e5-base |
|---|---|---|
| q01 en - undrawn committed credit facilities | 1 | 1 |
| q02 ro - same | 13 | 3 |
| q03 en - total revenue FY26 | 16 | 6 |
| q04 ro - same | 12 | 6 |
| q05 en - three strategic priorities | 1 | 1 |
| q06 ro - same | 1 | 1 |
| q07 en - direct-to-device satellite partner | 19 | 27 |
| q08 ro - same | 55 | 10 |
| q09 en - Chair of the Board | 15 | 18 |
| q10 ro - same | 19 | 21 |

With 10 questions, one question is 10 points: the gap between the two models is a single
question (q02) and is not conclusive. The default stays e5-small for now.

Why the misses happen (observed in the chunks; causes are hypotheses until tested):

- **Abbreviation mismatch (q07, q08).** The answer is one sentence on page 38:
  "We are partnering with AST SpaceMobile to enable D2D satellite connectivity".
  The question says "direct-to-device"; the text says "D2D", inside a 988-character
  chunk about other topics.
- **Answer split from its subject (q09, q10).** Page 11 ends a letter with
  "Jean-François van Boxmeer, Chair"; page 85 has "in his capacity as Chair of the Board"
  in one chunk, with the name in another.
- **Generic wording pulls in other chunks (q03, q04).** Page 17 has "Total revenue:
  Increased 8.0% to €40.5 billion", yet ranks 6-16. The top results are chunks with
  "year ended 31 March 2026" and three of them start with the leftover header bar
  "Vodafone Group Plc Annual Report on Form 20-F 2026 ...". An earlier, shorter sample
  query ("What was total revenue in FY26?") found pages 11 and 17 at ranks 1-2.
- Most misses are near misses (rank 6-27). Candidates to test: keyword search and
  re-ranking (stage 5), removing the remaining header bars.

## Stage 5: hybrid search and reranking

Setup, fixed before looking at results (no tuning on the 10 questions):
BM25 written by hand with k1 = 1.5, b = 0.75; Reciprocal Rank Fusion with k = 60 over
the top 50 of semantic (e5-small) and top 50 of BM25; the top 30 fused candidates go to
the cross-encoder. Chunks: 2549, after the header peeling in stage 5, step 0.

### Results (10 questions, 5 Romanian-English pairs)

| | semantic | bm25 | hybrid | hybrid + rerank (mMiniLM) | hybrid + rerank (bge) |
|---|---|---|---|---|---|
| hit@5, all | 3/10 | 4/10 | 5/10 | 5/10 | **7/10** |
| hit@5, ro | 1/5 | 0/5 | 2/5 | 2/5 | 2/5 |
| hit@5, en | 2/5 | 4/5 | 3/5 | 3/5 | **5/5** |
| hit@10, all | 4/10 | 6/10 | 7/10 | 6/10 | 7/10 |
| hit@10, ro | 2/5 | 2/5 | 2/5 | 2/5 | 2/5 |
| hit@10, en | 2/5 | 4/5 | 5/5 | 4/5 | 5/5 |
| hit@20, all | **9/10** | 6/10 | 8/10 | 8/10 | 8/10 |
| hit@20, ro | 4/5 | 2/5 | 3/5 | 4/5 | 3/5 |
| hit@20, en | 5/5 | 4/5 | 5/5 | 4/5 | 5/5 |
| Reranker, 30 candidates: median / max | - | - | - | 0.56 s / 0.61 s | 6.21 s / 7.16 s |
| Retrieval per question (warm) | 0.01 s | < 0.01 s | 0.01 s | 0.57 s | 6.22 s |

Rerankers: `cross-encoder/mmarco-mMiniLMv2-L12-H384-v1` (470 MB in cache, Apache-2.0) and
`BAAI/bge-reranker-v2-m3` (2188 MB in cache, Apache-2.0). Times measured on CPU, models
already loaded, after one unmeasured warm-up query.

Rank of the first chunk on an expected page (">20" = not in the top 20):

| Question | semantic | bm25 | hybrid | + mMiniLM | + bge |
|---|---|---|---|---|---|
| q01 en credit facilities | 1 | 2 | 1 | 1 | 1 |
| q02 ro | 12 | 7 | 2 | 1 | 2 |
| q03 en total revenue | 11 | >20 | 9 | >20 | 5 |
| q04 ro | 8 | >20 | >20 | 19 | >20 |
| q05 en strategic priorities | 1 | 2 | 1 | 1 | 1 |
| q06 ro | 1 | 7 | 1 | 1 | 1 |
| q07 en satellite partner | 20 | 1 | 4 | 3 | 2 |
| q08 ro | >20 | >20 | >20 | >20 | >20 |
| q09 en Chair of the Board | 15 | 3 | 8 | 8 | 2 |
| q10 ro | 19 | >20 | 11 | 11 | 17 |

### What the numbers say (and do not say)

- **BM25 helps English, not Romanian.** English questions share words with the English
  text (q07: "satellite" -> page 38 at rank 1); Romanian ones match only names, numbers
  and dates (BM25 hit@20 ro: 2/5).
- **Hybrid is the best cheap option:** hit@5 3/10 -> 5/10 at about 0.01 s per question.
  It can push a page out of the top 20 that semantic alone had (hit@20 9 -> 8: q04).
- **bge improves English to 5/5 at hit@5, but costs about 6 s per question on CPU**,
  11 times slower than mMiniLM. mMiniLM adds nothing over hybrid at hit@5.
- **No reranker fixes Romanian questions whose page is not among the 30 candidates**
  (q04, q08). Candidate generation, not reranking, is the limit there.
- With 10 questions, one question is 10 points; the English/Romanian split has 5 each.
  These are signals, not conclusions. Parameters stay at the standard values until a
  larger set with a dev/test split exists (stage 10).

### Time for one question in the app (measured parts only)

With models already loaded: retrieval takes about 0.01 s (hybrid), 0.57 s (hybrid + mMiniLM)
or 6.2 s (hybrid + bge). Answer generation by the LLM (stage 4) comes on top and is not
measured yet. One-off model loading at startup, measured in this session: e5-small 7.6 s
(cached), mMiniLM 22.1 s and bge 32.1 s (first load, including download).

## Stage 4: answer generation with citations

Retrieval: hybrid (no reranker), top 5 passages. LLM: OpenAI Responses API,
`reasoning.effort = "low"`, `max_output_tokens = 1200`, structured output
(`status`, `answer`, `cited`), `store = false`.

- **Citations are passage ids, not page numbers.** The model cites `[P2]`; the code maps
  P2 to the document and page it sent. A cited page is therefore always a page that was
  actually provided; an id that was not sent is reported as an invalid citation.
- **Passages are data.** Instructions are in the system message; the question and passages
  are in the user message inside `<question>` / `<passage>` blocks, with `<`, `>`, `&` and
  quotes escaped, so text in a PDF cannot close a block or add a fake passage. The model
  has no tools.
- **Cost** is computed from the token counts the API returns and a price table copied
  from the OpenAI pricing page (checked 2026-10-21).

### Results on the 10 questions (2026-10-21)

| | gpt-6-luna | gpt-6.1-sol |
|---|---|---|
| Answers citing an expected page, all | 4/10 | 4/10 |
| Romanian / English | 1/5 / 3/5 | 1/5 / 3/5 |
| Expected page among the 5 passages sent (upper bound) | 5/10 | 5/10 |
| Status answered / not_found | 4 / 6 | 4 / 6 |
| Incomplete (hit max_output_tokens) | 0 | 0 |
| Invalid citations | 0 | 0 |
| Reasoning tokens (all questions) | 0 | 0 |
| Total cost, 10 questions | $0.001660 | $0.036327 |
| LLM time per question: median / max | 1.91 s / 2.80 s | 2.96 s / 3.97 s |

Per question (same for both models): answered with a correct page citation on q01, q05,
q06, q07; not_found on q02, q03, q04, q08, q09, q10. Checked by hand: every answered
question states what the cited passage says (q01 "€7.6 billion": luna cited page 25,
sol page 195; both pages state it). Sol translated "Customers, Simplicity and Growth"
into Romanian for q06; luna kept the English names.

What this shows:

- **Every miss was a retrieval miss, answered honestly.** In all 6 not_found cases the
  passage with the answer was not among the 5 sent, and both models said so instead of
  guessing. No answer cited a passage that was not provided.
- **"Expected page sent" overstates by one (q02):** a chunk of page 193 was sent, but not
  the one containing the figure (`p0193-c005`).
- **The more expensive model brings nothing measurable here:** same citations and
  statuses, 22 times the cost, about 1 s slower. Quality is capped by retrieval.
- The luna cost of q01 ($0.000038) is low because OpenAI served most of the prompt from
  its cache (the same question had been asked a minute earlier).
