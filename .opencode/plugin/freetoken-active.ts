// freetoken-active — macht den Alias freetoken-local/active modellagnostisch.
//
// FreeToken (Windows, :1919) ignoriert das model-Feld von Anfragen und serviert
// immer das gerade residente Modell (live gegengeprueft 2026-08-23: bogus-ID
// und nicht-residente ID liefern beide erfolgreich zurueck). Ein opencode-Agent
// kann damit auf EINEN Alias zeigen und trifft trotzdem immer das aktive
// Modell.
//
// Was FreeToken NICHT kann: das richtige Kontext-Limit melden. Der Server
// advertiert max_model_len=262144, nutzbar sind aber nur die KV-Pages der
// jeweiligen Serve-Konfiguration (Qwen 131072, gpt-oss 65536, Gemma 32768).
// opencode nutzt limit.context fuer Auto-Compact bei 95% — ein falscher Wert
// produziert genau die "Input sequence length exceeds"-Drops, gegen die die
// Kalibrierung gebaut wurde.
//
// Dieser Plugin-Hook fragt deshalb beim opencode-Start den Daemon (:1900) ab,
// welches Modell resident ist (bzw. als letztes konfiguriert war), und setzt
// Limit + Namen des Alias-Entries auf die gemessenen Werte des konkreten
// Modell-Entries. Fail-silent: ist der Daemon nicht erreichbar (andere
// Maschine, Engine aus, kein FreeToken), bleibt der statische Fallback stehen.
//
// Grenze: config laeuft EINMAL beim opencode-Start. Wer mid-Session per
// /engine/switch wechselt, startet opencode neu oder akzeptiert das Limit des
// alten Modells bis dahin.

const DAEMON_STATUS = "http://127.0.0.1:1900/engine/status"

export default async () => {
  return {
    config: async (cfg: any) => {
      try {
        const models = cfg?.provider?.["freetoken-local"]?.models
        if (!models?.active) return

        const res = await fetch(DAEMON_STATUS, { signal: AbortSignal.timeout(1500) })
        if (!res.ok) return
        const st = (await res.json()) as any

        // st.model ist der Windows-Pfad zum Checkpoint; Basisname = Modell-ID.
        const id = String(st.model || "")
          .split(/[\\/]/)
          .filter(Boolean)
          .pop()
        if (!id) return

        const ref = models[id]
        if (!ref?.limit?.context) return // unbekanntes Modell: Fallback-Limit behalten

        models.active.limit = { ...ref.limit }
        models.active.name =
          `FreeToken-active → ${id} (${ref.limit.context} ctx nutzbar` +
          `${st.running ? "" : " — Engine gestoppt, Limit gilt beim naechsten Start"})`
      } catch {
        // Daemon nicht erreichbar: Alias behaelt statische Defaults.
      }
    },
  }
}
