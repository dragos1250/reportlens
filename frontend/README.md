# frontend

React 19 + TypeScript + Tailwind CSS 4, built with Vite 8. Shows the report with pdf.js
(react-pdf) next to the assistant; citations jump to the page and highlight the passage.

```powershell
npm install
npm run dev        # http://127.0.0.1:5173, proxies /api to the backend on :8080
npm test           # Vitest + Testing Library, API mocked with MSW (no backend, no LLM)
npm run typecheck
npm run build
```

The backend and the AI service must be running for `npm run dev` (see the main README).
Design decisions and measurements: [NOTES.md](NOTES.md). Visual spec: [docs/DESIGN.md](../docs/DESIGN.md).
