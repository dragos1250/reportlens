import { describe, expect, it } from "vitest"

import { docLabels, shortName } from "./reports"

const VOD = { docId: "vodafone-20f-fy26", title: "Vodafone Group Plc - Annual Report on Form 20-F, FY26", chunks: 1 }
const DT = { docId: "dtag-ar-2025", title: "Deutsche Telekom AG - Annual Report 2025", chunks: 1 }

describe("report labels", () => {
  it("keeps the company name without legal-form words", () => {
    expect(shortName(VOD)).toBe("Vodafone")
    expect(shortName(DT)).toBe("Deutsche Telekom")
    expect(shortName({ docId: "x", title: "Sample Annual Report 2026" })).toBe("Sample Annual Report 2026")
  })

  it("looks labels up by document id", () => {
    const label = docLabels([VOD, DT])
    expect(label(DT.docId)).toBe("Deutsche Telekom")
    expect(label("unknown")).toBe("unknown")
  })
})
