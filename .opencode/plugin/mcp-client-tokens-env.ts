// mcp-client-tokens-env — laedt FACTORY_MCP_TOKEN und MCP_POSTGRES_TOKEN in
// die opencode-Umgebung.
//
// Die Remote-MCP-Clients factory-mcp-node und mcp-postgres verlangen zwingend
// einen Bearer-Token. Die opencode-Config referenziert ihn als Platzhalter
//   "headers": {"Authorization":"Bearer {env:FACTORY_MCP_TOKEN}"}
//   "headers": {"Authorization":"Bearer {env:MCP_POSTGRES_TOKEN}"}
// in .opencode/opencode.jsonc. opencode expandiert {env:...} aus process.env
// beim Start — ist die jeweilige Variable dort nicht gesetzt, wird der Header
// zu "Bearer " (leer) und der Server antwortet 401, was opencode als "failed"
// anzeigt (T900202).
//
// Die Tokens liegen in ~/.config/factory-mcp-node/server.env bzw.
// ~/.config/mcp-postgres/server.env (SSOT, nicht getrackt). Dieses Plugin
// liest diese Dateien in process.env, BEVOR opencode die MCP-Config aufloest.
// Damit funktioniert die Auth unabhaengig davon, aus welcher Shell opencode
// gestartet wird — kein manuelles "set -a; . server.env" vor dem Start noetig.
//
// Fail-silent: fehlt eine Datei oder ist der jeweilige Token leer, bleibt die
// Variable ungesetzt und opencode zeigt den Client wie bisher als "failed".

import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const SOURCES: ReadonlyArray<{ file: string; key: string }> = [
  {
    file: join(homedir(), ".config", "factory-mcp-node", "server.env"),
    key: "FACTORY_MCP_TOKEN",
  },
  {
    file: join(homedir(), ".config", "mcp-postgres", "server.env"),
    key: "MCP_POSTGRES_TOKEN",
  },
]

function loadServerEnv(file: string, key: string): void {
  if (process.env[key]) return // bereits gesetzt — nichts tun
  try {
    const raw = readFileSync(file, "utf8")
    for (const line of raw.split(/\r?\n/)) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line)
      if (!m) continue
      const [, k, value] = m
      // Nur den erwarteten Key uebernehmen — keine fremden Variablen aus der
      // Datei in die opencode-Umgebung leaken.
      if (k === key && value) {
        process.env[key] = value
      }
    }
  } catch {
    // Datei fehlt/unlesbar: Variable bleibt ungesetzt, opencode zeigt den
    // Client als "failed".
  }
}

export default async () => {
  return {
    config: async (cfg: any) => {
      for (const { file, key } of SOURCES) {
        loadServerEnv(file, key)
      }
      return cfg
    },
  }
}
