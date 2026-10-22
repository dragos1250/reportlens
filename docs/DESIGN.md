# ReportLens UI design spec (dark theme)

Source of truth for stage 8 (React + Tailwind + pdf.js). The visual reference is the design prototype (a static React prototype with mock data, kept outside git) plus screenshots of it. Where this file and the prototype disagree, ask the developer.

## Principle

The user is checking claims against a long document, not chatting. Every answer must be easy to verify: a citation is a link to a highlighted passage on the exact page. Depth and motion belong to the upload and processing moments only; the workspace stays calm and legible. One memorable element in the workspace: the **page rail**.

## Tokens (dark)

| Token | Value | Use |
|---|---|---|
| app | `#0F1720` | app background |
| app-deep | `#0B121A` | top bar, mobile tabs |
| panel | `#151F2B` | assistant panel |
| panel-raised | `#1A2633` | raised surfaces |
| panel-soft | `#111B25` | viewer toolbar |
| text | `#E6EDF3` | primary text |
| secondary | `#9FB0C0` | secondary text |
| muted | `#6F8191` | decorative only (rules, rail labels); never for text the user must read |
| accent | `#FFE14D` | the highlighter: cited passage, current page on the rail, primary button |
| accent-ink | `#221F0B` | text on accent |
| teal | `#4FD1B5` | cited-page ticks on the rail, "grounded" status dot |
| line | `rgba(230,237,243,.11)` | hairlines (strong: `.18`) |
| paper | `#E8E3D7` | PDF page (warm, not pure white); night reading tones it darker |

No red and no company brand colors: the project is not affiliated with any company. Define the tokens once in the Tailwind theme, do not scatter hex values.

## Type

- UI: Schibsted Grotesk 400 to 700. Answers and snippets: Source Serif 4 400/600.
- Page numbers and citations use tabular figures.
- **Minimum 12px for any text the user reads** (the prototype uses 8 to 11px in places: chips, hints, rail labels, source snippets; raise them). Citation chips 12px, ledger snippets 13px, composer hint 12px.
- Sentence case. The prototype uses an all-caps "eyebrow" above the hero and above message labels; keep it to the hero at most.

## Screens and flow

1. **Upload**: dark background, one hero 3D moment (CSS 3D stack of four translucent pages floating in depth, slow idle motion), headline, one primary button "Upload a report", drop zone ("or drop a PDF here"), privacy note.
2. **Processing**: the stack fans out; "Reading N pages" with a progress line and a plain step label (Splitting into passages, Indexing, Preparing your workspace).
3. **Workspace**: header (logo, document title, page count, Night reading toggle), page rail, PDF viewer with toolbar, assistant panel (440px).
4. **Answered**, **Not in this report**, **Select and explain** (stage 9) states live inside the workspace.
5. **Phone**: Report and Assistant tabs at the bottom; tapping a citation on Assistant switches to Report at that page.

## The page rail

Vertical strip mapping all pages (position = (page - 1) / (pages - 1)). Hairline ticks every few pages; ticks for pages cited in the conversation are teal and longer; the current page is a yellow bar. Needs an accessible name; clicking it jumps to that page (nice-to-have). Compute positions from the real page count.

## Citations

- In the answer text, a citation is a small bordered chip `p. 195`. Hover/active: yellow border or fill.
- Clicking a chip: the viewer jumps to that page, the cited passage gets the yellow highlight (a short left-to-right sweep, disabled with `prefers-reduced-motion`), the rail marker moves.
- Under the latest answer, a **Sources** list: page number in large tabular figures, a short title, a two-line snippet in serif, active row with a faint yellow outline. Clicking a row equals clicking its chip. Heading line: "N passages checked, M cited."
- Highlighting uses the pdf.js text layer. If the passage is not found exactly, highlight nothing and still jump to the page; never fail silently on the jump.

## States

- **Not in this report** (status `not_found` or `not_in_report`): dashed, softly hatched block, one calm sentence saying nothing supported was found and that the assistant does not guess, the pages that were checked as chips, then "Search the report text" and "Rephrase". Never styled as an error.
- **Loading**: "Searching the report" then the answer. **Error**: say what failed and what to do, with Retry.
- **Select and explain**: small floating toolbar above the selection ("Explain this", "Ask about this"); the panel quotes the selection with its page and says the explanation is based only on that text.

## Reading comfort

The PDF page stays light but warm. A **Night reading** toggle tones the page darker (brightness and slight sepia). Persist the choice in localStorage inside try/catch.

## Accessibility floor

- Real `button`, `a`, `textarea` with a label; no click handlers on divs; icon-only buttons have `aria-label`.
- Visible keyboard focus (add a focus ring; the prototype has none). Touch targets at least 44px on phones (the prototype's icon buttons are 30px).
- Text contrast 4.5:1 for anything readable; the yellow accent is never the only signal.
- Reduced motion respected; the 3D stack stops floating.

## Copy rules

Plain verbs, one name per action ("Ask", "Explain this", "Retry"). Refusals are calm and specific. UI language is English; the answer language follows the EN/RO choice (the API already has `lang`).

## Implementation notes

- Port the prototype into `frontend/` (React + Vite + Tailwind + TypeScript). Do not copy the design prototype's scaffolding: its generator config folder, `AGENTS.md`, `CLAUDE.md`, `.mise.toml` and the generator plugins in `vite.config.ts`.
- Replace all mock data (company name, page text, answers, the regex that fakes "not found") with calls to the backend. The PDF is rendered by pdf.js from a backend endpoint; the PDF is never in git.
- Upload is a new feature (the document must be ingested and indexed), not part of stage 8: for now the first screen chooses among the documents already indexed.
- Convert the prototype's hand-written CSS to Tailwind utilities and theme tokens gradually, one component at a time, and say why for every dependency you add.
