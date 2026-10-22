import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * An effect may return nothing or a cleanup function. TypeScript does not catch an effect
 * that returns a value (a () => Promise still fits () => void), so this guards the source:
 * no async effect, and no arrow with an expression body, whose value would be returned.
 */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

describe("effects", () => {
  const files = sourceFiles(join(__dirname, ".."))

  it("scans the app sources", () => {
    expect(files.length).toBeGreaterThan(10)
  })

  it.each(files)("%s has no effect that returns a value", (file) => {
    const source = readFileSync(file, "utf8")
    expect(source).not.toMatch(/useEffect\(\s*async/)
    expect(source).not.toMatch(/useEffect\(\s*\([^)]*\)\s*=>(?!\s*\{)/)
  })
})
