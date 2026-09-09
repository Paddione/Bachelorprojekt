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
// Dieser Plugin-Hook fragt deshalb beim opencode-Start zuerst den Daemon (:1900)
// ab. Wenn die Desktop-App den Server ohne Daemon-Adoption gestartet hat, faellt
// er auf :1919/v1/models + /v1/stats zurueck. Limit + Name des Alias-Entries
// folgen damit dem tatsaechlich servierten Modell und seiner KV-Kapazitaet.
// Fail-silent: ist kein Discovery-Pfad erreichbar, bleibt der statische Fallback.
//
// Grenze: config laeuft EINMAL beim opencode-Start. Wer mid-Session per
// /engine/switch wechselt, startet opencode neu oder akzeptiert das Limit des
// alten Modells bis dahin.

import { appendFile } from "node:fs/promises"
import { join } from "node:path"

const DAEMON_STATUS = "http://127.0.0.1:1900/engine/status"
const SERVER_MODELS = "http://127.0.0.1:1919/v1/models"
const SERVER_STATS = "http://127.0.0.1:1919/v1/stats"
const SERVER_CACHE = "http://127.0.0.1:1919/v1/cache/status"
const THINKING_MODEL = "active-thinking"
const FAST_MODEL = "active-fast"

// Telemetrie-Ablage neben den bestehenden FreeToken-Logs
// (scripts/llm/restart-freetoken.ps1 etabliert LOCALAPPDATA/FreeToken/logs
// bereits als Log-Konvention). Der Pfad loest ueber LOCALAPPDATA immer in ein
// Benutzerprofilverzeichnis auf, niemals in den Working Tree. Fehlt die
// Variable (Nicht-Windows-CI), wird Telemetrie ohne Fehler uebersprungen.
const TELEMETRY_PATH = process.env.LOCALAPPDATA
  ? join(process.env.LOCALAPPDATA, "FreeToken", "logs", "alias-telemetry.jsonl")
  : null

// Fire-and-forget: die appendFile-Promise wird bewusst nicht awaited und
// ihr Fehlerfall vollstaendig verschluckt. Ein Telemetrie-Ausfall darf den
// ausgehenden Request weder verzoegern noch veraendern noch nach aussen
// durchschlagen (Requirement: Alias Usage Telemetry for the FreeToken
// Plugin, Szenario "A telemetry failure leaves the request untouched").
const recordAliasUsage = (alias: unknown, promptChars: number) => {
  if (!TELEMETRY_PATH) return
  const record =
    JSON.stringify({
      ts: new Date().toISOString(),
      alias,
      promptChars,
    }) + "\n"
  appendFile(TELEMETRY_PATH, record).catch(() => {
    // Zieldatei/-verzeichnis fehlt, ist gesperrt oder das Volume ist voll:
    // Telemetrie ist best-effort, der Request laeuft unveraendert weiter.
  })
}

const fetchJson = async (url: string) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(1500) })
  if (!res.ok) throw new Error(`${url} returned ${res.status}`)
  return (await res.json()) as any
}

const basename = (value: unknown) =>
  String(value || "")
    .split(/[\\/]/)
    .filter(Boolean)
    .pop()

// The Desktop app can own a healthy :1919 server without the standalone daemon
// adopting it. In that state /engine/status truthfully reports no managed process,
// but it is not authoritative for the serving endpoint. Prefer a daemon model when
// present, then fall back to the server's own model and KV telemetry.
const discoverRuntime = async () => {
  let daemon: any = null
  try {
    daemon = await fetchJson(DAEMON_STATUS)
  } catch {
    // Server discovery below remains authoritative for Desktop-owned engines.
  }

  const daemonId = basename(daemon?.model)
  if (daemonId && daemon.running) {
    return {
      id: daemonId,
      running: true,
      kvTokens: undefined as number | undefined,
    }
  }

  let models: any
  try {
    models = await fetchJson(SERVER_MODELS)
  } catch (error) {
    if (daemonId) {
      return {
        id: daemonId,
        running: false,
        kvTokens: undefined as number | undefined,
      }
    }
    throw error
  }
  const served = models?.data?.[0]
  const id = basename(served?.root) || basename(served?.id)
  if (!id) throw new Error("FreeToken /v1/models returned no resident model")

  let kvTokens: number | undefined
  try {
    const stats = await fetchJson(SERVER_STATS)
    let pages = Number(stats?.kv?.total_pages)
    let pageSize = Number(stats?.kv?.page_size ?? 1)
    if (!Number.isFinite(pages) || pages <= 0) {
      const cache = await fetchJson(SERVER_CACHE)
      pages = Number(cache?.geometry?.num_pages)
      pageSize = Number(cache?.geometry?.page_size ?? 1)
    }
    if (
      Number.isFinite(pages) &&
      pages > 0 &&
      Number.isFinite(pageSize) &&
      pageSize > 0
    ) {
      kvTokens = pages * pageSize
    }
  } catch {
    // The concrete model's calibrated limit remains the safe fallback.
  }

  return { id, running: true, kvTokens }
}

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
            // Vor der enable_thinking-Mutation, damit alias exakt das vom
            // Aufrufer gesendete body.model ist - ungefiltert, unabhaengig
            // davon, ob die nachfolgende Verzweigung greift.
            recordAliasUsage(body.model, JSON.stringify(body.messages ?? []).length)
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

        const runtime = await discoverRuntime()
        const { id } = runtime

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
        const calibrated = runtime.kvTokens
          ? Math.min(ref.limit.context, runtime.kvTokens)
          : ref.limit.context
        const grow = ceiling > calibrated && runtime.running && calibrated >= 100_000

        models.active.limit = { ...ref.limit, ...(grow ? { context: ceiling } : {}) }
        models.active.name =
          `FreeToken-active → ${id} (${models.active.limit.context} ctx` +
          `${grow ? `, Ceiling ${ceiling} aktiv — KV muss via ft ctl cache mitwachsen` : " nutzbar"}` +
          `${runtime.running ? "" : " — Engine gestoppt, Limit gilt beim naechsten Start"})`

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
