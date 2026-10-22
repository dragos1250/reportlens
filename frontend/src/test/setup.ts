import "@testing-library/jest-dom/vitest"

import { cleanup } from "@testing-library/react"
import { afterAll, afterEach, beforeAll } from "vitest"

import { server } from "./server"

// Every test talks to a mock API (MSW): no backend, no AI service, no LLM.
// A request with no handler fails the test (MSW 3 calls this option onUnhandledFrame).
beforeAll(() => server.listen({ onUnhandledFrame: "error" }))
afterEach(() => {
  server.resetHandlers()
  cleanup()
})
afterAll(() => server.close())
