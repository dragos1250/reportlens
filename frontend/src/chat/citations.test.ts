import { describe, expect, it } from "vitest"

import type { Passage } from "../api/types"
import { checkedPages, splitAnswer } from "./citations"

const passage = (marker: string, page: number): Passage => ({
  marker, page, docId: "d", chunkId: `d-p${page}`, text: `text of ${page}`, cited: true,
})
const P = [passage("P1", 25), passage("P2", 195), passage("P3", 25)]

describe("splitAnswer", () => {
  it("turns markers into citations between text", () => {
    expect(splitAnswer("Up 8% [P2]. Facilities [P1].", P)).toEqual([
      { kind: "text", text: "Up 8% " },
      { kind: "cite", passages: [P[1]] },
      { kind: "text", text: ". Facilities " },
      { kind: "cite", passages: [P[0]] },
      { kind: "text", text: "." },
    ])
  })

  it("handles grouped markers", () => {
    expect(splitAnswer("Both [P1, P2]", P)[1]).toEqual({ kind: "cite", passages: [P[0], P[1]] })
  })

  it("keeps an unknown marker as text", () => {
    expect(splitAnswer("Claim [P9].", P)).toEqual([{ kind: "text", text: "Claim [P9]." }])
  })

  it("returns plain text when there is no marker", () => {
    expect(splitAnswer("The passages do not contain this.", P)).toEqual([
      { kind: "text", text: "The passages do not contain this." },
    ])
  })
})

describe("checkedPages", () => {
  it("lists each checked page once, in page order", () => {
    expect(checkedPages([passage("P1", 195), passage("P2", 12), passage("P3", 195)])).toEqual([12, 195])
  })
})
