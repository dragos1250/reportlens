import { act, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useRef, useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { Composer } from "../chat/Composer"
import { fakeRecognition } from "./fakes"
import { MicButton } from "./MicButton"

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

/** The real composer, so the test sees where recognised words end up. */
function ComposerHarness({ onSubmit }: { onSubmit: () => void }) {
  const [draft, setDraft] = useState("Revenue")
  const ref = useRef<HTMLTextAreaElement>(null)
  return <Composer draft={draft} lang="auto" busy={false} textareaRef={ref} onDraft={setDraft} onLang={() => {}}
                   onSubmit={onSubmit} />
}

describe("Voice input", () => {
  it("says it is not available when the browser has no speech recognition (Firefox)", () => {
    render(<MicButton onText={vi.fn()} />)
    expect(screen.getByRole("note")).toHaveTextContent("Voice input is not available in this browser.")
    expect(screen.queryByRole("button", { name: /Ask by voice/ })).toBeNull()
  })

  it("shows that it is listening, puts the words into the field and never sends them", async () => {
    const recognition = fakeRecognition()
    const onSubmit = vi.fn()
    render(<ComposerHarness onSubmit={onSubmit} />)

    await userEvent.click(screen.getByRole("button", { name: "Ask by voice (Alt+M)" }))
    expect(screen.getByRole("button", { name: /Stop voice input/ })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByText("Listening…")).toBeInTheDocument()
    expect(recognition.last!.lang).toBe("ro-RO")

    act(() => recognition.last!.say("in 2025", false))
    expect(screen.getByText("Listening… “in 2025”")).toBeInTheDocument()
    act(() => recognition.last!.say("in 2025"))
    act(() => recognition.last!.stop())

    expect(screen.getByLabelText("Ask about the report")).toHaveValue("Revenue in 2025")
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Ask by voice (Alt+M)" })).toHaveAttribute("aria-pressed", "false")
  })

  it("explains a blocked microphone", async () => {
    const recognition = fakeRecognition()
    render(<MicButton onText={vi.fn()} />)
    await userEvent.click(screen.getByRole("button", { name: /Ask by voice/ }))
    act(() => recognition.last!.fail("not-allowed"))
    expect(screen.getByText("Microphone access is blocked. Allow it in the site settings, then try again."))
      .toBeInTheDocument()
  })

  it("Alt+M starts and stops, Esc stops, and AltGr+M (Ctrl+Alt) does nothing", () => {
    const recognition = fakeRecognition()
    render(<MicButton onText={vi.fn()} />)

    fireEvent.keyDown(document, { code: "KeyM", key: "m", altKey: true, ctrlKey: true })  // AltGr on Windows
    expect(recognition.started).toBe(0)

    fireEvent.keyDown(document, { code: "KeyM", key: "µ", altKey: true })  // any character the layout gives
    expect(recognition.started).toBe(1)
    expect(screen.getByRole("button", { name: /Stop voice input/ })).toBeInTheDocument()
    fireEvent.keyDown(document, { code: "KeyM", key: "m", altKey: true })
    expect(screen.getByRole("button", { name: /Ask by voice/ })).toBeInTheDocument()

    fireEvent.keyDown(document, { code: "KeyM", key: "m", altKey: true })
    fireEvent.keyDown(document, { key: "Escape", code: "Escape" })
    expect(screen.getByRole("button", { name: /Ask by voice/ })).toHaveAttribute("aria-pressed", "false")
  })

  it("listens in the language chosen next to the button, and remembers it", async () => {
    const recognition = fakeRecognition()
    const { unmount } = render(<MicButton onText={vi.fn()} />)
    await userEvent.click(screen.getByRole("radio", { name: "Speak English" }))
    await userEvent.click(screen.getByRole("button", { name: /Ask by voice/ }))
    expect(recognition.last!.lang).toBe("en-US")
    unmount()

    render(<MicButton onText={vi.fn()} />)
    expect(screen.getByRole("radio", { name: "Speak English" })).toBeChecked()
  })

  it("says next to the button that Chrome sends the audio to Google", () => {
    fakeRecognition()
    render(<MicButton onText={vi.fn()} />)
    expect(screen.getByText(/Chrome sends the audio to Google/)).toBeInTheDocument()
  })
})
