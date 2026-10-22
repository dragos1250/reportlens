import "@fontsource-variable/schibsted-grotesk"
import "@fontsource-variable/source-serif-4"
import "./styles.css"

import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import App from "./App"
import { ErrorBoundary } from "./components/ErrorBoundary"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary name="ReportLens" className="h-full">
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
