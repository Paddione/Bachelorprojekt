// freetoken-active — macht den Alias freetoken-local/active modellagnostisch
// und fuehrt Auto-Swap beim Modellwechsel im Picker aus.
//
// FreeToken (Windows, :1919) ignoriert das model-Feld von Anfragen und serviert
// immer das gerade residente Modell. Ein opencode-Agent zeigt auf den Alias
// "active". Limit + Name folgen dem tatsaechlich servierten Modell.
//
// Auto-Swap (T900155): Bei session.next.model.switched wechselt das Plugin
// die residente Engine ueber den Daemon (:1900). Bei Wechsel auf ein Nicht-FreeToken-
// Modell wird die Engine gestoppt (/engine/stop) um VRAM freizugeben.
// Synchroner Consistency-Guard im Fetch-Wrapper sichert Drift ab.

import { appendFile } from "node:fs/promises"
import { join } from "node:path"

const DAEMON_STATUS = "http://127.0.0.1:1900/engine/status"
const DAEMON_SWITCH = "http://127.0.0.1:1900/engine/switch"
const DAEMON_START = "http://127.0.0.1:1900/engine/start"
const DAEMON_STOP = "http://127.0.0.1:1900/engine/stop"

const SERVER_MODELS = "http://127.0.0.1:1919/v1/models"
const SERVER_STATS = "http://127.0.0.1:1919/v1/stats"
const SERVER_CACHE = "http://127.0.0.1:1919/v1/cache/status"
const THINKING_MODEL = "active-thinking"
const FAST_MODEL = "active-fast"

export interface EngineConfig {
  model: string
  port: number
  args: string[]
  contextLimit: number
}

export const ALIAS_ENGINE_MAP: Record<string, EngineConfig> = {
  "active": {
    model: "Qwen3.6-35B-A3B-NVFP4",
    port: 1919,
    args: ["--kv-reserve-tokens", "131072", "--max-running-requests", "1"],
    contextLimit: 200000,
  },
  "active-thinking": {
    model: "Qwen3.6-35B-A3B-NVFP4",
    port: 1919,
    args: ["--kv-reserve-tokens", "131072", "--max-running-requests", "1"],
    contextLimit: 200000,
  },
  "active-fast": {
    model: "Qwen3.6-35B-A3B-NVFP4",
    port: 1919,
    args: ["--kv-reserve-tokens", "131072", "--max-running-requests", "1"],
    contextLimit: 85000,
  },
  "Qwen3.6-35B-A3B-NVFP4": {
    model: "Qwen3.6-35B-A3B-NVFP4",
    port: 1919,
    args: ["--kv-reserve-tokens", "131072", "--max-running-requests", "1"],
    contextLimit: 200000,
  },
  "gpt-oss-20b": {
    model: "gpt-oss-20b",
    port: 1919,
    args: ["--kv-reserve-tokens", "65536", "--max-running-requests", "1"],
    contextLimit: 65536,
  },
  "Gemma-4-26B-A4B-NVFP4": {
    model: "Gemma-4-26B-A4B-NVFP4",
    port: 1919,
    args: ["--kv-reserve-tokens", "32768", "--max-running-requests", "1"],
    contextLimit: 32768,
  },
}

const TELEMETRY_PATH = process.env.LOCALAPPDATA
  ? join(process.env.LOCALAPPDATA, "FreeToken", "logs", "alias-telemetry.jsonl")
  : null

const recordAliasUsage = (alias: unknown, promptChars: number) => {
  if (!TELEMETRY_PATH) return
  const record =
    JSON.stringify({
      ts: new Date().toISOString(),
      alias,
      promptChars,
    }) + "\n"
  appendFile(TELEMETRY_PATH, record).catch(() => {})
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
  let activeModelsConfig: any = null

  return {
    config: async (cfg: any) => {
      try {
        const models = cfg?.provider?.["freetoken-local"]?.models
        if (models) {
          activeModelsConfig = models
        }
        if (!models?.active) return

        const upstreamFetch = cfg.provider["freetoken-local"].options?.fetch ?? fetch
        cfg.provider["freetoken-local"].options.fetch = async (
          input: RequestInfo | URL,
          init?: RequestInit,
        ) => {
          if (typeof init?.body !== "string") return upstreamFetch(input, init)
          try {
            const body = JSON.parse(init.body)

            // System-merge fix: merge all system messages into position 0
            if (Array.isArray(body.messages) && body.messages.length > 0) {
              const systemMsgs = body.messages.filter((m: any) => m.role === "system")
              if (systemMsgs.length > 0) {
                const mergedContent = systemMsgs
                  .map((m: any) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content)))
                  .join("\n\n")
                const nonSystemMsgs = body.messages.filter((m: any) => m.role !== "system")
                body.messages = [{ role: "system", content: mergedContent }, ...nonSystemMsgs]
              }
            }

            // Fetch wrapper engine consistency check (safety net)
            const targetAlias = body.model || "active"
            const mappedConfig = ALIAS_ENGINE_MAP[targetAlias] || {
              model: basename(targetAlias) || targetAlias,
              port: 1919,
              args: [],
              contextLimit: 100000,
            }
            const expectedEngineModel = mappedConfig.model

            let currentRuntime: any = null
            try {
              currentRuntime = await discoverRuntime()
            } catch {
              // Discovery failed
            }

            if (currentRuntime && currentRuntime.running && currentRuntime.id !== expectedEngineModel) {
              // Engine model drifted from expected model - perform synchronous switch before proxying
              try {
                const switchRes = await fetch(DAEMON_SWITCH, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    model: expectedEngineModel,
                    port: mappedConfig.port ?? 1919,
                    args: mappedConfig.args ?? [],
                    force: true,
                  }),
                  signal: AbortSignal.timeout(5000),
                })
                if (!switchRes.ok) {
                  console.warn(`[freetoken-active] Fetch engine consistency switch returned ${switchRes.status}`)
                }
              } catch (err: any) {
                console.warn(`[freetoken-active] Fetch engine consistency switch error: ${err?.message}`)
              }
            }

            recordAliasUsage(body.model, JSON.stringify(body.messages ?? []).length)
            if (body.model === THINKING_MODEL || body.model === FAST_MODEL) {
              body.chat_template_kwargs = {
                ...(body.chat_template_kwargs ?? {}),
                enable_thinking: body.model === THINKING_MODEL,
              }
            }
            init = { ...init, body: JSON.stringify(body) }
          } catch {
            // Non-JSON request bodies pass through unchanged.
          }
          return upstreamFetch(input, init)
        }

        const runtime = await discoverRuntime()
        const { id } = runtime

        const ref = models[id]
        if (!ref?.limit?.context) return

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

    event: async ({ event }: { event: any }) => {
      if (event?.type !== "session.next.model.switched") return

      const modelRef = event.properties?.model ?? event.model ?? event.properties
      if (!modelRef || typeof modelRef !== "object") return

      const providerID = modelRef.providerID || modelRef.provider
      const id = modelRef.id || modelRef.model

      if (!providerID) return

      if (providerID !== "freetoken-local") {
        // Non-FreeToken model selected: Stop FreeToken engine to free VRAM
        try {
          const res = await fetch(DAEMON_STOP, {
            method: "POST",
            signal: AbortSignal.timeout(5000),
          })
          if (!res.ok) {
            console.error(`[freetoken-active] POST /engine/stop returned status ${res.status}`)
          }
        } catch (err: any) {
          // Degraded failure path: non-blocking error handling
          console.error(`[freetoken-active] Degraded failure stopping FreeToken engine: ${err?.message}`)
        }
        return
      }

      // FreeToken model selected
      const mappedConfig = ALIAS_ENGINE_MAP[id] ?? {
        model: id,
        port: 1919,
        args: ["--kv-reserve-tokens", "131072", "--max-running-requests", "1"],
        contextLimit: 100000,
      }
      const targetEngineModel = mappedConfig.model

      let daemonStatus: any = null
      try {
        daemonStatus = await fetchJson(DAEMON_STATUS)
      } catch {
        // Daemon unreachable
      }

      const runningModel = daemonStatus?.running ? basename(daemonStatus.model) : null

      if (daemonStatus?.running && runningModel === targetEngineModel) {
        // Same engine model selected: update context limit / name only, no engine call
        if (activeModelsConfig && activeModelsConfig.active) {
          activeModelsConfig.active.limit = {
            ...activeModelsConfig.active.limit,
            context: mappedConfig.contextLimit,
          }
          activeModelsConfig.active.name = `FreeToken-active → ${targetEngineModel} (${mappedConfig.contextLimit} ctx nutzbar)`
        }
        return
      }

      // Different engine model selected (or engine is currently stopped)
      try {
        const endpoint = daemonStatus?.running ? DAEMON_SWITCH : DAEMON_START
        const payload = daemonStatus?.running
          ? { model: targetEngineModel, port: mappedConfig.port, args: mappedConfig.args, force: true }
          : { model: targetEngineModel, port: mappedConfig.port, args: mappedConfig.args }

        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10000),
        })

        if (!res.ok) {
          throw new Error(`${endpoint} returned status ${res.status}`)
        }

        if (activeModelsConfig && activeModelsConfig.active) {
          activeModelsConfig.active.limit = {
            ...activeModelsConfig.active.limit,
            context: mappedConfig.contextLimit,
          }
          activeModelsConfig.active.name = `FreeToken-active → ${targetEngineModel} (${mappedConfig.contextLimit} ctx nutzbar)`
        }
      } catch (err: any) {
        // Degraded failure path: surface error notification, keep old engine running
        console.error(`[freetoken-active] Auto-swap error switching engine to ${targetEngineModel}: ${err?.message}`)
      }
    },
  }
}
