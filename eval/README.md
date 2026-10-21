# eval

Test questions with expected source pages, and scripts that measure retrieval and answer quality.

A first small retrieval set is used from stage 3; the full set (30-50 questions) is built in stage 10.

## `retrieval_questions.jsonl`

Hand-written questions, one JSON object per line:

```json
{"id": "q01", "lang": "ro", "question": "...", "doc_id": "vodafone-20f-fy26", "expected_pages": [20]}
```

| Field | Meaning |
|---|---|
| `id` | unique id, e.g. `q01` |
| `lang` | language of the question: `ro` or `en` |
| `question` | the question as a user would ask it |
| `doc_id` | document to search, as in `scripts/reports.json` |
| `expected_pages` | pages that contain the answer; a hit on any of them counts |

Pages are **physical PDF page numbers** (1 = first page of the file), not the numbers
printed on the page. In the Vodafone Form 20-F FY26, printed page 15 is PDF page 20.

## Metric

**hit@5**: share of questions where at least one expected page appears among the
pages of the top 5 retrieved chunks. Reported overall and per language.
