// bge-mcp-env — laedt BGE_MCP_TOKEN in die opencode-Umgebung.
//
// bge-mcp (Shim auf :13005) verlangt zwingend einen Bearer-Token. Die
// opencode-Config referenziert ihn als Platzhalter
//   "headers": {"Authorization":"Bearer {env:BGE_MCP_TOKEN}"}
// in .opencode/opencode.jsonc. opencode expandiert {env:...} aus process.env
// beim Start — ist BGE_MCP_TOKEN dort nicht gesetzt, wird der Header zu
// "Bearer " (leer) und der Server antwortet 401, was opencode als "failed"
// anzeigt (T002504).
//
// Der Token liegt in ~/.config/bge-mcp/server.env (SSOT, nicht getrackt).
// Dieses Plugin sourct diese Datei in process.env, BEVOR opencode die MCP-
// Config aufloest. Damit funktioniert die Auth unabhaengig davon, aus welcher
// Shell opencode gestartet wird — kein manuelles "set -a; . server.env"
// vor dem Start noetig.
//
// Fail-silent: fehlt die Datei oder ist BGE_MCP_TOKEN leer, bleibt die
// Variable ungesetzt und opencode zeigt bge-mcp wie bisher als "failed"
// (Diagnose: scripts/bge-mcp/check-client-env.sh).

import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const ENV_FILE = join(homedir(), ".config", "bge-mcp", "server.env")

function loadServerEnv(): void {
  if (process.env.BGE_MCP_TOKEN) return // bereits gesetzt — nichts tun
  try {
    const raw = readFileSync(ENV_FILE, "utf8")
    for (const line of raw.split(/\r?\n/)) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line)
      if (!m) continue
      const [, key, value] = m
      // Nur BGE_MCP_TOKEN uebernehmen — keine fremden Variablen aus der Datei
      // in die opencode-Umgebung leaken.
      if (key === "BGE_MCP_TOKEN" && value) {
        process.env.BGE_MCP_TOKEN = value
      }
    }
  } catch {
    // Datei fehlt/unlesbar: Variable bleibt ungesetzt, opencode zeigt bge-mcp
    // als "failed" — Diagnose via scripts/bge-mcp/check-client-env.sh.
  }
}

export default async () => {
  return {
    config: async (cfg: any) => {
      loadServerEnv()
      return cfg
    },
  }
}
