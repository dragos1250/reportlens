/**
 * Reading aloud with the browser's own voices (speechSynthesis): free, nothing leaves the
 * device. A voice for the answer's language is required: reading Romanian with an English
 * voice would be worse than saying plainly that no Romanian voice is installed.
 */
export type SpokenLang = "ro" | "en"

const TAGS: Record<SpokenLang, string> = { ro: "ro-RO", en: "en-US" }
const NAMES: Record<SpokenLang, string> = { ro: "Romanian", en: "English" }

export class VoiceMissing extends Error {
  constructor(lang: SpokenLang) {
    super(`No ${NAMES[lang]} voice installed. Add one in your system's speech settings, or read the answer on screen.`)
    this.name = "VoiceMissing"
  }
}

export function browserVoiceSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window
}

/** The voices load asynchronously in some browsers: wait for them a moment. */
async function voices(): Promise<SpeechSynthesisVoice[]> {
  const now = window.speechSynthesis.getVoices()
  if (now.length > 0) return now
  return new Promise((resolve) => {
    const done = () => resolve(window.speechSynthesis.getVoices())
    window.speechSynthesis.addEventListener("voiceschanged", done, { once: true })
    window.setTimeout(done, 1000)
  })
}

export async function findVoice(lang: SpokenLang): Promise<SpeechSynthesisVoice | null> {
  const prefix = lang.toLowerCase()
  return (await voices()).find((v) => v.lang.toLowerCase().replace("_", "-").startsWith(prefix)) ?? null
}

/** Reads the text; resolves when done or stopped. Throws VoiceMissing if there is no voice for lang. */
export async function speakInBrowser(text: string, lang: SpokenLang): Promise<void> {
  if (!browserVoiceSupported()) throw new Error("This browser cannot read aloud.")
  const voice = await findVoice(lang)
  if (!voice) throw new VoiceMissing(lang)
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.voice = voice
  utterance.lang = TAGS[lang]
  return new Promise((resolve) => {
    utterance.onend = () => resolve()
    utterance.onerror = () => resolve()
    window.speechSynthesis.speak(utterance)
  })
}

export function stopBrowserVoice(): void {
  if (browserVoiceSupported()) window.speechSynthesis.cancel()
}
