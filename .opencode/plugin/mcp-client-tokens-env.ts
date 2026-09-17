// mcp-client-tokens-env — laedt FACTORY_MCP_TOKEN und MCP_POSTGRES_TOKEN in
// die opencode-Umgebung.
//
// Die Remote-MCP-Clients factory-mcp-node und mcp-postgres verlangen zwingend
// einen Bearer-Token. Die opencode-Config referenziert ihn als Platzhalter
//   "headers": {"Authorization":"Bearer {env:FACTORY_MCP_TOKEN}"}
//   "headers": {"Authorization":"Bearer {env:MCP_POSTGRES_TOKEN}"}
// in .opencode/opencode.jsonc. opencode expandiert {env:...} aus process.env —
// ist die jeweilige Variable beim Start nicht gesetzt, wird der Header zu
// "Bearer " (leer) und der Server antwortet 401, was opencode als "failed"
// anzeigt (T900202).
//
// Die Tokens liegen in ~/.config/factory-mcp-node/server.env bzw.
// ~/.config/mcp-postgres/server.env (SSOT, nicht getrackt). Dieses Plugin liest
// diese Dateien in process.env ein. Das passiert auf Modul-Top-Level, also beim
// Laden des Plugins beim opencode-Start — der fruehestmoegliche Zeitpunkt im
// Prozess, jedenfalls vor dem Verbinden der MCP-Clients. (Ein `config`-Hook
// dafuer existiert in opencode nicht; die Event-Liste kennt nur
// shell.env/tool/session/... — siehe https://opencode.ai/docs/plugins/.)
// Damit funktioniert die Auth unabhaengig davon, aus welcher Shell (oder aus
// dem Desktop-Launcher, der weder ~/.bashrc noch ~/.profile sourct) opencode
// gestartet wird.
//
// WICHTIG: Diese Datei muss in einem Verzeichnis liegen, das opencode
// automatisch laedt — `.opencode/plugins/` (Projekt) oder
// `~/.config/opencode/plugins/` (global). Das singulaere `plugin/`
// (Repo-Konvention, Ziel von scripts/opencode-sync-agents.sh) wird von
// opencode NICHT geladen; der Sync verteilt die Dateien deshalb zusaetzlich
// nach `~/.config/opencode/plugins/` (T0141xx).
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
    // Client als "failed" — Diagnose via `task mcp:doctor`.
  }
}

// Import-Zeitpunkt: SOFORT laden, nicht erst in einem Hook. Plugin-Hooks
// laufen nach dem Modul-Import; MCP-Clients verbinden sich noch spaeter,
// sodass {env:...} beim Expandieren gesetzt ist.
for (const { file, key } of SOURCES) {
  loadServerEnv(file, key)
}

export const McpClientTokensEnv = async () => {
  return {}
}
