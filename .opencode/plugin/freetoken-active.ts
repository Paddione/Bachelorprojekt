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
const THINKING_MODEL = "active-thinking"
const FAST_MODEL = "active-fast"

export default async () => {
  return {
    config: async (cfg: any) => {
      try {
        const models = cfg?.provider?.["freetoken-local"]?.models
        if (!models?.active) return

        // @ai-sdk/openai-compatible does not preserve arbitrary nested request
        // fields from agent options. Inject the Qwen chat-template switch at the
        // final fetch boundary instead. The model aliases are local routing keys;
        // FreeToken deliberately ignores the request model and serves the resident
        // checkpoint, so no engine restart is needed when agents change mode.
        const upstreamFetch = cfg.provider["freetoken-local"].options?.fetch ?? fetch
        cfg.provider["freetoken-local"].options.fetch = async (
          input: RequestInfo | URL,
          init?: RequestInit,
        ) => {
          if (typeof init?.body !== "string") return upstreamFetch(input, init)
          try {
            const body = JSON.parse(init.body)
            if (body.model === THINKING_MODEL || body.model === FAST_MODEL) {
              body.chat_template_kwargs = {
                ...(body.chat_template_kwargs ?? {}),
                enable_thinking: body.model === THINKING_MODEL,
              }
              init = { ...init, body: JSON.stringify(body) }
            }
          } catch {
            // Non-JSON request bodies pass through unchanged.
          }
          return upstreamFetch(input, init)
        }

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

        // SDLC-Ceiling (T-los, 2026-08-24): Fuer autonome Laeufe advertise ich
        // bis zu SDLC_CONTEXT_CEILING (Default 200000) statt des kalibrierten
        // Werts. Der Native-Auto-Compact greift bei 95% des advertisierten
        // Kontexts — bei 200k also ~190k. DAS GEHT NUR, wenn der Server die
        // KV-Seiten dorthin mitwachsen laesst ("ft ctl cache --kv <n>" zieht
        // Kontext auf Kosten der unbedeutenden MoE-Slot-Caches hoch); das
        // bedient der Operator serverseitig, nicht dieses Plugin.
        //
        // Guard: nur bei laufender Engine und nur fuer Modelle mit
        // dokumentiertem Headroom (kalibriert >= 100000 — nach Matrix ist das
        // Qwen3.6-35B-offload; gpt-oss/Gemma behalten ihr sicheres Limit).
        // Daemon nicht erreichbar oder Engine gestoppt => Kalibrierung bleibt.
        const ceiling = Number(process.env.SDLC_CONTEXT_CEILING ?? 200_000)
        const calibrated = ref.limit.context
        const grow = ceiling > calibrated && st.running && calibrated >= 100_000

        models.active.limit = { ...ref.limit, ...(grow ? { context: ceiling } : {}) }
        models.active.name =
          `FreeToken-active → ${id} (${models.active.limit.context} ctx` +
          `${grow ? `, Ceiling ${ceiling} aktiv — KV muss via ft ctl cache mitwachsen` : " nutzbar"}` +
          `${st.running ? "" : " — Engine gestoppt, Limit gilt beim naechsten Start"})`

        // Purpose-specific aliases keep their requested budgets. They still get
        // the resident model name for visibility, while request mode is selected
        // dynamically by the fetch wrapper above.
        if (models[THINKING_MODEL]) {
          const thinkingContext = grow ? ceiling : Math.min(ceiling, calibrated)
          models[THINKING_MODEL].limit = {
            ...models[THINKING_MODEL].limit,
            context: thinkingContext,
          }
          models[THINKING_MODEL].name = `FreeToken thinking → ${id} (${thinkingContext} ctx)`
        }
        if (models[FAST_MODEL]) {
          const fastContext = Math.min(85_000, grow ? ceiling : calibrated)
          models[FAST_MODEL].limit = { ...models[FAST_MODEL].limit, context: fastContext }
          models[FAST_MODEL].name = `FreeToken non-thinking → ${id} (${fastContext} ctx)`
        }
      } catch {
        // Daemon nicht erreichbar: Alias behaelt statische Defaults.
      }
    },
  }
}
