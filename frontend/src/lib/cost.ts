/**
 * An estimated cost in US dollars for display. Four decimals hide the smallest costs (a
 * question answered mostly from OpenAI's prompt cache costs about $0.00004), so below
 * $0.0001 two significant digits are shown instead of "$0.0000".
 */
export function formatUsd(cost: number): string {
  if (cost === 0) return "$0"
  if (cost < 0.0001) return `$${cost.toPrecision(2)}`
  return `$${cost.toFixed(4)}`
}
