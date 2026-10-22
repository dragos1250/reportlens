# Frontend notes (stage 8)

Decisions behind the UI and the measurements that support them. Measured on 2026-10-22
on a Windows laptop, with the Vodafone Form 20-F FY26 (588 pages, 32 MB).

## How the browser reaches the data

```
browser -> Vite dev server 127.0.0.1:5173 -> /api proxy -> Spring Boot :8080 -> FastAPI :8000
```

- One origin for the browser: no CORS configuration, and the frontend holds no keys and
  no service addresses (only relative `/api/...` paths).
- New endpoints for the UI: `GET /api/documents/{id}/pdf` (Spring streams it from FastAPI's
  `GET /documents/{id}/pdf`), and assistant messages now carry every checked passage with
  its text and the answer with `[P#]` markers (Flyway V2, `passages jsonb`).

## PDF loading

- react-pdf 11 (pdf.js 6.3) renders one page at a time.
- The backend answers HTTP range requests (206) and Spring streams the bytes without holding
  the file: the Spring process's working set changed by about 1 MB while serving the full
  32 MB file.
- pdf.js needs **both** `disableAutoFetch` and `disableStream`. Measured with pdf.js through
  Spring, opening the report and reading page 12:

| Options | Bytes read |
|---|---|
| auto-fetch off, streaming on | 32.19 MB (the whole file, in the background) |
| auto-fetch off, streaming off (used) | 0.59 MB, 11 range requests |

## Highlighting a cited passage

`src/pdf/highlight.ts`, a pure function with tests:

1. The page's text layer items and the passage are normalised the same way: letters and
   digits only, lower case, any other run of characters becomes one space, a hyphen at a
   line end joins the word, `(cid:N)` glyphs are dropped. Ingestion cleaned the passage text,
   so the raw text layer and the passage only match after this.
2. Exact match first. Otherwise anchors: the first and the last 8 words, in order, at most
   twice the passage's length apart (tables and columns reorder the middle).
3. Otherwise nothing is marked, the viewer still jumps to the page and says
   "Couldn't mark the passage on page N; its text is in Sources."

Each normalised character remembers its text item and offset, so only those characters are
wrapped in `<mark>`. react-pdf inserts the renderer's string as HTML, so the PDF's own text
is escaped first (a test checks an `<img onerror>` payload stays text).

Measured on real pages (pdf.js text layer of the PDF served by Spring) for a deterministic
sample of 255 passages, every 10th of the 2549 chunks:

| Result | Passages |
|---|---|
| exact | 242 (94.9%) |
| anchors | 12 (4.7%) |
| not found | 1 (0.4%) |

The miss (page 53): the chunk has "standards1" (a footnote number joined to the word) and the
text layer has "standards" and "1" as separate items.

## Layout and design rules

- Tokens from `docs/DESIGN.md` are defined once in the Tailwind `@theme`; components use
  only utilities (no hex values in components). CSS kept by hand: the hero's 3D page stack,
  the highlight sweep in the pdf.js text layer, `prefers-reduced-motion`.
- Text is at least 12 px (12/13/14/15/16 px used); keyboard focus has a visible ring; icon
  buttons and tabs are at least 44 px on phones; icon-only buttons have `aria-label`.
- Phones (< 768 px): Report and Assistant tabs; a citation tapped on Assistant opens Report
  at that page.
- First screen: hero with the indexed documents (upload comes later). The document title is
  shown as plain text: no logo, no company colours.
- Fonts (Schibsted Grotesk, Source Serif 4) are bundled from `@fontsource` packages: no
  request to Google Fonts.

## Dependencies

| Package | Why |
|---|---|
| react, react-dom 19.3 | UI (stack) |
| react-pdf 11 (pdfjs-dist 6.3) | page rendering, text layer, `customTextRenderer` for highlights |
| tailwindcss + @tailwindcss/vite 4.3 | styling, theme tokens (stack) |
| @fontsource-variable/schibsted-grotesk, source-serif-4 | design fonts, self-hosted (OFL) |
| vite 8.3, @vitejs/plugin-react 6.1, typescript 7.0 | dev server with proxy, build, type checking |
| vitest 5, @testing-library/react 16, user-event 14, jest-dom 7, jsdom 30, msw 3 | component tests with a mocked API |

The newest major versions worked. One change found: MSW 3 renamed the `listen()` option
`onUnhandledRequest` to `onUnhandledFrame` (the old name was ignored, so unhandled
requests would only have warned).

## Not verified automatically

The tests run in jsdom, which has no canvas: the real page rendering, the yellow sweep and
the phone layout were not checked in a browser in this session (see the manual checklist
in the stage report). The data path behind them was checked for real: PDF ranges through
the dev proxy, answers and refusals through `/api`.

### A bug only Docker showed: pdf.js's worker sent with the wrong type

In the Docker version the viewer did not start. The browser refused
`/assets/pdf.worker.min-*.mjs` ("non-JavaScript MIME type of application/octet-stream"), pdf.js
then failed to set up its worker, and the viewer's error boundary showed "failed to render".
`curl -I` on that file from the frontend container confirmed `Content-Type:
application/octet-stream`: nginx's `mime.types` maps `.js` but not `.mjs`, and module scripts
must have a JavaScript type. The fix is a `location ~* \.mjs$` block in `nginx.conf` that sets
`text/javascript` for that location only (a `types` block at server level would replace the
whole list and break `.js` and `.css`).

**Why no test caught it.** The unit tests run in Node with jsdom and a stand-in for the viewer:
they never ask nginx for a file and never run pdf.js's worker. The Vite dev server, used for
every manual check so far, serves `.mjs` correctly. The Docker check of stage 11 fetched
`index.html`, `/api` and a PDF range through nginx, not the JavaScript assets, and did not open
a real browser.

**Now checked:** `python scripts/check_nginx.py` starts nginx with `frontend/nginx.conf` and
sample files and checks the content type of `.js`, `.mjs` and `.css`, that the app's routes
return `index.html`, that `/actuator` is a 404 and that a missing module is a 404, not
`index.html`. It failed on the old config (2 checks) and passes on the new one in about a
second. `--image reportlens-frontend` runs the same checks on the built image with its real
asset names. It still does not render a page: a check in a real browser is on the list for
the evaluation stage.

## Report text search (exact, no AI)

The "Not in this report" block and the viewer toolbar open a search over the report's own
text. It runs in the browser on the text layer pdf.js extracts, with no backend call and
no cost.

- **Matching**: literal and case-insensitive. Normalised on both sides only for what a
  reader cannot see: whitespace runs, a word hyphenated across a line break, typographic
  apostrophes. Punctuation counts ("€7.6 billion" does not match "7 6 billion");
  diacritics are not folded ("prioritati" does not find "priorități").
- **Joining text items**: pdf.js emits its own whitespace items for gaps (17,118 of the
  75,628 items in the test report), so items on one line are joined as they are and a
  space is added only at line ends. Adding a space after every item broke phrases:
  "€7.6 billion" went from 3 matches to 0.
- **No prefilled term**: the field starts empty; after a refusal the question is shown as
  a hint only.
- **Cost of a full search**, measured with pdf.js through range requests: the text of all
  588 pages takes 2.4 s to extract and reads 32.1 MB (the whole file), 1.70 M characters,
  slowest page 33 ms; the first 50 pages read 3.5 MB in 0.4 s. So the search starts only
  on demand, keeps each page's text for the open document (a second search reuses it),
  and shows results page by page.
- **Responsiveness**: text extraction runs in pdf.js's worker; the main thread only
  matches one page at a time and gives control back to the browser every 10 pages. A new
  search, closing the panel or unmounting stops the running one (generation counter).
  Responsiveness in a real browser was not measured in this session.
- **Highlight**: a result uses the same character map and `renderItem` as citations, so
  the page text is escaped before `<mark>`; the context in the result list is rendered as
  React text. Tests cover an `<img onerror>` payload in the page text and in the query.
- **Pages without text**: the search reports how many pages it could not read. In the test
  report the 116 pages without a text layer are exactly the 116 pages without any passage
  in the database (overlap 116 of 116, none with text but no passage, none the other way).
- **Tests**: unit tests on page-like text, the hook (progress, cancel, unmount, errors), the
  panel inside the workspace, and a test on the real report read from `data/raw` with
  pdf.js, skipped when the PDF is not downloaded (no report text is stored in the repo).
