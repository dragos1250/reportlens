import { useCallback, useEffect, useRef, useState } from "react"

/** The parts of the Web Speech API recognition used here (not in TypeScript's DOM types). */
interface Recognition {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}

type RecognitionClass = new () => Recognition

export type MicLang = "ro-RO" | "en-US"
const MIC_LANG_KEY = "reportlens.mic-lang"

function recognitionClass(): RecognitionClass | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionClass; webkitSpeechRecognition?: RecognitionClass }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

function readMicLang(): MicLang {
  try {
    return window.localStorage.getItem(MIC_LANG_KEY) === "en-US" ? "en-US" : "ro-RO"
  } catch {
    return "ro-RO"
  }
}

const ERRORS: Record<string, string> = {
  "not-allowed": "Microphone access is blocked. Allow it in the site settings, then try again.",
  "service-not-allowed": "Microphone access is blocked. Allow it in the site settings, then try again.",
  "no-speech": "No speech was heard. Try again.",
  "audio-capture": "No microphone was found.",
  network: "Voice input needs a connection to the browser's speech service.",
}

/**
 * Voice input for the question: the recognised words go into the text field, never sent on
 * their own, so they can be checked first. Alt+M starts and stops (the M key's position, so
 * it works on a Romanian layout too; AltGr is not Alt+M), Esc stops.
 */
export function MicButton({ onText }: { onText: (text: string) => void }) {
  const Recognizer = recognitionClass()
  const [lang, setLang] = useState<MicLang>(readMicLang)
  const [listening, setListening] = useState(false)
  const [heard, setHeard] = useState("")
  const [problem, setProblem] = useState<string | null>(null)
  const recognition = useRef<Recognition | null>(null)
  const text = useRef(onText)
  text.current = onText

  const stop = useCallback(() => {
    recognition.current?.stop()
  }, [])

  const start = useCallback(() => {
    if (!Recognizer || recognition.current) return
    setProblem(null)
    setHeard("")
    const r = new Recognizer()
    r.lang = lang
    r.interimResults = true
    r.continuous = false
    r.onresult = (event) => {
      let interim = ""
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) text.current(result[0].transcript.trim())
        else interim += result[0].transcript
      }
      setHeard(interim)
    }
    r.onerror = (event) => setProblem(ERRORS[event.error] ?? "Voice input stopped. Try again.")
    r.onend = () => {
      recognition.current = null
      setListening(false)
      setHeard("")
    }
    recognition.current = r
    setListening(true)
    try {
      r.start()
    } catch {
      recognition.current = null
      setListening(false)
      setProblem("Voice input could not start. Try again.")
    }
  }, [Recognizer, lang])

  useEffect(() => {
    // Braces on purpose: an effect may only return its cleanup function.
    function onKey(event: KeyboardEvent) {
      if (event.code === "KeyM" && event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
        event.preventDefault()
        if (recognition.current) stop()
        else start()
      } else if (event.key === "Escape" && recognition.current) {
        stop()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [start, stop])

  useEffect(() => {
    return () => recognition.current?.stop()
  }, [])

  function chooseLang(next: MicLang) {
    setLang(next)
    try {
      window.localStorage.setItem(MIC_LANG_KEY, next)
    } catch {
      // not kept; applies until reload
    }
  }

  if (!Recognizer) {
    return (
      <span role="note" className="text-xs text-secondary" title="Voice input works in Chrome and Edge.">
        Voice input is not available in this browser.
      </span>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button type="button" onClick={() => (listening ? stop() : start())} aria-pressed={listening}
              aria-label={listening ? "Stop voice input (Alt+M or Esc)" : "Ask by voice (Alt+M)"}
              aria-keyshortcuts="Alt+M"
              className="flex min-h-11 items-center gap-1.5 rounded-md border border-line px-2 text-xs text-secondary hover:border-line-strong hover:text-text aria-pressed:border-accent aria-pressed:text-text md:min-h-8">
        <span aria-hidden="true" className={`size-2 rounded-full ${listening ? "animate-pulse bg-accent" : "bg-secondary"}`} />
        Mic
      </button>
      <fieldset className="m-0 flex border-0 p-0">
        <legend className="sr-only">Voice input language</legend>
        {(["ro-RO", "en-US"] as const).map((option) => (
          <label key={option}
                 className="grid min-h-11 min-w-8 cursor-pointer place-items-center rounded-md px-1 text-xs text-secondary has-checked:bg-line has-checked:text-text md:min-h-8">
            <input type="radio" name="mic-lang" value={option} checked={lang === option}
                   onChange={() => chooseLang(option)} className="sr-only"
                   aria-label={option === "ro-RO" ? "Speak Romanian" : "Speak English"} />
            {option === "ro-RO" ? "RO" : "EN"}
          </label>
        ))}
      </fieldset>
      <p aria-live="polite" className="m-0 w-full text-xs text-secondary">
        {listening ? `Listening…${heard ? ` “${heard}”` : ""}` : problem ?? ""}
      </p>
      <p className="m-0 w-full text-xs text-secondary">
        Voice input uses the browser's speech service: Chrome sends the audio to Google to transcribe it.
      </p>
    </div>
  )
}
