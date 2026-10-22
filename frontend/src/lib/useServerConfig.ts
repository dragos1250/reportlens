import { useEffect, useState } from "react"

import { api } from "../api/client"
import type { ServerConfig } from "../api/types"

/** What this server offers (uploads, premium voice); null until known or if it cannot be read. */
export function useServerConfig(): ServerConfig | null {
  const [config, setConfig] = useState<ServerConfig | null>(null)
  useEffect(() => {
    let cancelled = false
    api.config().then((c) => { if (!cancelled) setConfig(c) }, () => { if (!cancelled) setConfig(null) })
    return () => {
      cancelled = true
    }
  }, [])
  return config
}
