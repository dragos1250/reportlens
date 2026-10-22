import { afterEach, describe, expect, it, vi } from "vitest"

import { readFlag, writeFlag } from "./storage"

describe("preference storage", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
  })

  it("round-trips a flag", () => {
    writeFlag("night", true)
    expect(readFlag("night", false)).toBe(true)
    writeFlag("night", false)
    expect(readFlag("night", true)).toBe(false)
  })

  it("uses the fallback when nothing is stored", () => {
    expect(readFlag("missing", true)).toBe(true)
  })

  it("keeps working when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked")
    })
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked")
    })
    expect(() => writeFlag("night", true)).not.toThrow()
    expect(readFlag("night", false)).toBe(false)
  })
})
