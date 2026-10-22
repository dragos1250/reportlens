import { vi } from "vitest"

/** Test doubles for the browser speech APIs (jsdom has none of them). */

export interface Spoken {
  text: string
  lang: string
  voice: string | undefined
}

/** speechSynthesis with the given voices; returns what was spoken. */
export function fakeSpeechSynthesis(voiceLangs: string[]): Spoken[] {
  const spoken: Spoken[] = []
  const voices = voiceLangs.map((lang) => ({ lang, name: `Voice ${lang}` }))

  class Utterance {
    text: string
    lang = ""
    voice: { name: string } | null = null
    onend: (() => void) | null = null
    onerror: (() => void) | null = null
    constructor(text: string) {
      this.text = text
    }
  }

  vi.stubGlobal("SpeechSynthesisUtterance", Utterance)
  vi.stubGlobal("speechSynthesis", {
    getVoices: () => voices,
    addEventListener: () => {},
    cancel: () => {},
    speak: (u: Utterance) => {
      spoken.push({ text: u.text, lang: u.lang, voice: u.voice?.name })
      u.onend?.()
    },
  })
  return spoken
}

/** A SpeechRecognition whose last instance the test drives. */
export function fakeRecognition() {
  const state = {
    last: null as null | FakeRecognition,
    started: 0,
  }

  class FakeRecognition {
    lang = ""
    interimResults = false
    continuous = false
    onresult: ((event: unknown) => void) | null = null
    onerror: ((event: { error: string }) => void) | null = null
    onend: (() => void) | null = null
    start() {
      state.last = this
      state.started += 1
    }
    stop() {
      this.onend?.()
    }
    say(transcript: string, isFinal = true) {
      this.onresult?.({ resultIndex: 0, results: [{ isFinal, 0: { transcript } }] })
    }
    fail(error: string) {
      this.onerror?.({ error })
      this.onend?.()
    }
  }

  vi.stubGlobal("webkitSpeechRecognition", FakeRecognition)
  return state
}

/** Audio playback: records what was played and ends at once. */
export function fakeAudio(): { played: number } {
  const counter = { played: 0 }
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:fake", revokeObjectURL: () => {} }))
  vi.spyOn(window.HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) {
    counter.played += 1
    queueMicrotask(() => this.onended?.(new Event("ended")))
    return Promise.resolve()
  })
  vi.spyOn(window.HTMLMediaElement.prototype, "pause").mockImplementation(() => {})
  return counter
}
