import { describe, expect, it } from "vitest"

import { formatUsd } from "./cost"

describe("formatUsd", () => {
  it("keeps four decimals for usual costs", () => {
    expect(formatUsd(0.0002073)).toBe("$0.0002")
    expect(formatUsd(0.003843)).toBe("$0.0038")
  })

  it("does not round a small cost down to zero", () => {
    expect(formatUsd(0.00003744)).toBe("$0.000037")
    expect(formatUsd(0)).toBe("$0")
  })
})
