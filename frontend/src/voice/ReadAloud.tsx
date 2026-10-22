import { useEffect, useRef, useState } from "react"

import { api } from "../api/client"
import type { Message } from "../api/types"
import { type SpokenLang, speakInBrowser, stopBrowserVoice } from "./browserVoice"

export type VoiceProvider = "browser" | "elevenlabs"

/**
 * "Read aloud" under an answer. The text and its language come from the server
 * (message.spokenText / spokenLang): the language of the answer, not of the selector.
 * With the premium voice chosen and allowed, the server makes the audio; if it refuses
 * (limit, outage), the browser voice reads instead and the reason is shown.
 */
export function ReadAloud({ message, conversationId, provider }: {
  message: Message
  conversationId: string
  provider: VoiceProvider
}) {
  const [playing, setPlaying] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const audio = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    return () => stop() // never keep talking about an answer that is gone
  }, [])

  const text = message.spokenText
  const lang: SpokenLang = message.spokenLang === "ro" ? "ro" : "en"
  if (!text) return null

  function stop() {
    audio.current?.pause()
    audio.current = null
    stopBrowserVoice()
    setPlaying(false)
  }

  /** premiumFailure: why the premium voice did not read it, kept visible whatever happens next. */
  async function browser(premiumFailure: string | null) {
    try {
      await speakInBrowser(text!, lang)
      setNotice(premiumFailure && `${premiumFailure} Using the browser voice.`)
    } catch (error) {
      const why = error instanceof Error ? error.message : "The answer could not be read aloud."
      setNotice(premiumFailure ? `${premiumFailure} The browser voice cannot read it either: ${why}` : why)
    }
  }

  async function play() {
    setNotice(null)
    setPlaying(true)
    try {
      if (provider === "elevenlabs") {
        try {
          const blob = await api.speech(conversationId, message.id)
          const player = new Audio(URL.createObjectURL(blob))
          audio.current = player
          await new Promise<void>((resolve) => {
            player.onended = () => resolve()
            player.onerror = () => resolve()
            void player.play().catch(() => resolve())
          })
          return
        } catch (error) {
          await browser(error instanceof Error ? error.message : "The premium voice is not available.")
          return
        }
      }
      await browser(null)
    } finally {
      setPlaying(false)
    }
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => (playing ? stop() : void play())} aria-pressed={playing}
              aria-label={playing ? "Stop reading" : `Read the answer aloud (${lang === "ro" ? "Romanian" : "English"})`}
              className="min-h-9 rounded-md border border-line px-2.5 text-xs text-secondary hover:border-line-strong hover:text-text max-md:min-h-11">
        {playing ? "Stop" : "Read aloud"}
      </button>
      {notice && <p role="status" className="m-0 text-xs text-secondary">{notice}</p>}
    </div>
  )
}
