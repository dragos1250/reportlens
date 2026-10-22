# eval

Test questions with expected source pages. The code that measures the system is in
`ai-service/evaluation/` (plus the earlier `retrieval/evaluate.py` and `generation/evaluate.py`).

## Two sets: dev and test

| File | Questions | Use |
|---|---|---|
| `dev.jsonl` | 29 | tuning: thresholds, reranker, translation; run as often as needed |
| `test.jsonl` | 17 | measured **once**, at the end, with the configuration chosen on dev |

- The 22 questions of the earlier stages (`q01`-`q10`, `n01`-`n12`) are in `dev.jsonl`: they
  were already used to choose the search method, so they cannot be test questions.
- The test questions are written by the project's author; ground-truth pages are confirmed in
  the PDF by a person, never taken from the system being evaluated.
- A question and its translation (`pair`) are always in the same set.
- **Seal:** before the final run, the sha256 of `test.jsonl` is written below. The evaluation
  code reads the test set only with `--final` and only if the hash matches, so it cannot be
  tuned on, and a change after the results were seen would show.

**Test set sha256:** _not sealed yet_

What the test set holds (17 questions): 4 answered on one page (any expected page counts),
**only one** whose answer has several parts that must all be found (a `multi_page` question
on Deutsche Telekom's 2030 and 2040 climate targets), 2 in Romanian, 2 comparisons, which
need expected pages found **in both reports**, 4 without an answer in the report (one of
them asked of both reports, one "near miss": the term appears, the answer does not) and
4 traps. So 9 questions have an answer and 8 do not.

Two planned questions were dropped before sealing because their ground truth could not be
confirmed in the PDF: Vodafone's Group Adjusted EBITDAaL (no clear Group total in the text)
and a capital expenditure comparison (Vodafone reports "capital additions", not capital
expenditure). Together with the 29 dev questions, the evaluation has 46 questions.

The repository is public, so anyone can read the test set; the seal only proves it did not
change after the results were seen.

## Question format (one JSON object per line)

```json
{"id": "q01", "category": "single_page", "lang": "en", "question": "...", "doc_id": "vodafone-20f-fy26",
 "answerable": true, "expected_pages": [25, 193, 195], "pair": "q02", "confirmed": true}
```

| Field | Meaning |
|---|---|
| `id` | unique id |
| `category` | `single_page`, `multi_page`, `romanian`, `compare`, `negative` (not in the report), `trap` (looks answerable, is not: the right behaviour is to refuse or state the mismatch) |
| `lang` | `en` or `ro` |
| `doc_id` | the report to search, as in `scripts/reports.json`; a question about both reports has `doc_ids` (two reports) instead: always for `compare`, and allowed for a `negative` or `trap` asked of both |
| `answerable` | `false` for `negative` and `trap`, `true` otherwise |
| `expected_pages` | pages that contain the answer; a hit on any of them counts. For `compare`, one list per report: `{"vodafone-20f-fy26": [17], "dtag-ar-2025": [29]}` |
| `expected_parts` | `multi_page` only: two or more page lists, each one a part of the answer; every part must be found |
| `pair` | id of the same question in the other language, if any |
| `confirmed` | `true` once a person has checked the pages in the PDF |
| `near_miss` | optional, for a `negative` question whose term does appear in the report (e.g. "Japan" in bond names) while the answer does not: any figure given counts as invented |
| `note` | optional: why a page was kept or left out, or what makes a trap tempting |

Pages are **physical PDF page numbers** (1 = first page of the file), not the numbers
printed on the page. In the Vodafone Form 20-F FY26, printed page 15 is PDF page 20.
Only pages with a text layer can be expected pages: the system cannot find scanned pages.

## Finding candidate pages

Exact text search in the PDF, independent of the system (no chunks, embeddings or LLM):

```powershell
cd ai-service
.\.venv\Scripts\python.exe -m evaluation.find_pages "undrawn committed" --doc vodafone-20f-fy26
.\.venv\Scripts\python.exe -m evaluation.find_pages "free cash flow al" "19.5" --doc dtag-ar-2025
```

It lists candidate pages with a short context; a person opens each page in the PDF and
keeps the ones that really answer the question. Exact search misses a different wording (for
`q01`, page 193 says the same thing in other words), so a candidate list is a start, not
the answer.
