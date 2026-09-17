// bge-mcp-env — laedt BGE_MCP_TOKEN in die opencode-Umgebung.
//
// bge-mcp (Shim auf :13005) verlangt zwingend einen Bearer-Token. Die
// opencode-Config referenziert ihn als Platzhalter
//   "headers": {"Authorization":"Bearer {env:BGE_MCP_TOKEN}"}
// in .opencode/opencode.jsonc. opencode expandiert {env:...} aus process.env —
// ist BGE_MCP_TOKEN dort beim Start nicht gesetzt, wird der Header zu
// "Bearer " (leer) und der Server antwortet 401, was opencode als "failed"
// anzeigt (T002504).
//
// Der Token liegt in ~/.config/bge-mcp/server.env (SSOT, nicht getrackt).
// Dieses Plugin liest die Datei in process.env ein. Das passiert auf
// Modul-Top-Level, also beim Laden des Plugins beim opencode-Start — der
// fruehestmoegliche Zeitpunkt im Prozess, jedenfalls vor dem Verbinden der
// MCP-Clients. (Ein `config`-Hook dafuer existiert in opencode nicht; die
// Event-Liste kennt nur shell.env/tool/session/... — siehe
// https://opencode.ai/docs/plugins/. Ein Hook waere ohnehin spaeter dran als
// der Import.) Damit funktioniert die Auth unabhaengig davon, aus welcher
// Shell (oder aus dem Desktop-Launcher, der weder ~/.bashrc noch ~/.profile
// sourct) opencode gestartet wird.
//
// WICHTIG: Diese Datei muss in einem Verzeichnis liegen, das opencode
// automatisch laedt — `.opencode/plugins/` (Projekt) oder
// `~/.config/opencode/plugins/` (global). Das singulaere `plugin/`
// (Repo-Konvention, Ziel von scripts/opencode-sync-agents.sh) wird von
// opencode NICHT geladen; der Sync verteilt die Dateien deshalb zusaetzlich
// nach `~/.config/opencode/plugins/` (T0141xx).
//
// Fail-silent: fehlt die Datei oder ist BGE_MCP_TOKEN leer, bleibt die
// Variable ungesetzt und opencode zeigt bge-mcp wie bisher als "failed"
// (Diagnose: `task mcp:doctor` bzw. scripts/bge-mcp/check-client-env.sh).

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
    // als "failed" — Diagnose via `task mcp:doctor`.
  }
}

// Import-Zeitpunkt: SOFORT laden, nicht erst in einem Hook. Plugin-Hooks
// laufen nach dem Modul-Import; MCP-Clients verbinden sich noch spaeter,
// sodass {env:BGE_MCP_TOKEN} beim Expandieren gesetzt ist.
loadServerEnv()

export const BgeMcpEnv = async () => {
  return {}
}
