import type { DocumentInfo } from "../api/types"

// Legal-form words that only make a label longer: "Vodafone Group Plc" -> "Vodafone".
const SUFFIXES = new Set(["plc", "ag", "se", "sa", "s.a.", "nv", "n.v.", "group", "inc.", "inc", "ltd", "ltd."])

/**
 * Short name of a report for citation chips: the company part of the title (before " - "),
 * without legal-form words. Falls back to the title or id when nothing is left.
 */
export function shortName(document: Pick<DocumentInfo, "docId" | "title">): string {
  const company = document.title.split(" - ")[0].trim()
  const words = company.split(/\s+/)
  while (words.length > 1 && SUFFIXES.has(words[words.length - 1].toLowerCase())) words.pop()
  return words.join(" ") || document.title || document.docId
}

/** Short name of each report in a comparison, by docId. Components get one only when comparing. */
export type DocLabel = (docId: string) => string

export function docLabels(reports: DocumentInfo[]): DocLabel {
  const names = new Map(reports.map((r) => [r.docId, shortName(r)]))
  return (docId) => names.get(docId) ?? docId
}
