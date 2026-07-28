#!/usr/bin/env bash
# scripts/agent-lock-identity.sh — Session- und Tool-Identitaet (Fragment, ge-source-t)
# Ausgelagert aus agent-lock.sh [T002447] wegen S1-Limit und logischer Gruppierung.
# Enthaelt: _AGENT_LOCK_SID_ENVS, _now, _my_sid, _sid_alive, _pid_alive, _detect_tool.
# NICHT eigenstaendig ausfuehrbar — wird von agent-lock.sh via Loader eingebunden.

# Namen der harness-gesetzten Session-Variablen, in Prüfreihenfolge. [T002375-p1]
# EINE Liste für _my_sid UND _detect_tool: bis hierher prüften beide unabhängig
# voneinander `CLAUDE_SESSION_ID`, und genau so läuft eine solche Liste auseinander.
# CLAUDE_CODE_SESSION_ID zuerst, weil Claude Code sie real exportiert;
# CLAUDE_SESSION_ID bleibt gültig — opencode und agy können sie setzen, und die
# bestehenden Tests hängen daran.
_AGENT_LOCK_SID_ENVS="CLAUDE_CODE_SESSION_ID CLAUDE_SESSION_ID"

_now() { date +%s; }

_my_sid() {
  # Harness-stable env wins (Claude Code / opencode expose a session id for
  # telemetry that survives across bash tool calls). The test override
  # AGENT_LOCK_SID stays as a second layer (CI / unit tests). Only fall back
  # to the per-call Unix SID when neither harness env nor test override is
  # set — that path is the source of the cross-call drift bug. [T001268]
  # [T002375-p1] Die Harness exportiert CLAUDE_CODE_SESSION_ID, nicht CLAUDE_SESSION_ID.
  # Gemessen: `env | grep -c '^CLAUDE_SESSION_ID='` -> 0, `…CLAUDE_CODE_SESSION_ID=` -> 1.
  # Die alte Zeile las nur die zweite Variante, fiel also IMMER auf den Unix-Fallback
  # unten durch — und der ist pro Bash-Tool-Call verschieden. Folge: `release` hielt den
  # eigenen Lock für fremd und verlangte --force. Das ist keine Kosmetik: --force ist das
  # Instrument, mit dem man FREMDE lebende Locks abräumt; erzwingt der Normalfall es,
  # gewöhnt sich jeder Aufrufer daran und räumt irgendwann einen echten fremden ab.
  # AGENT_LOCK_SID ZUERST: es ist der ausdrueckliche Test-Override (siehe Dateikopf).
  # Stuende er hinter den Harness-Variablen, wuerde ambient exportiertes
  # CLAUDE_CODE_SESSION_ID ihn ueberstimmen — und jeder Test, der ihn setzt, briche in
  # einer Harness-Session. Ein Override, den ambient State ueberstimmen kann, ist keiner.
  # (Der Altcode hatte denselben Fehler mit CLAUDE_SESSION_ID davor; er biss nur nie,
  # weil diese Variable real nie gesetzt war.)
  if [ -n "${AGENT_LOCK_SID:-}" ]; then printf '%s\n' "$AGENT_LOCK_SID"; return; fi
  local _v
  for _v in $_AGENT_LOCK_SID_ENVS; do
    if [ -n "${!_v:-}" ]; then printf '%s\n' "${!_v}"; return; fi
  done
  local s; s="$(ps -o sess= -p "$$" 2>/dev/null | tr -d ' ')"
  if [ -n "$s" ]; then printf '%s\n' "$s"; return; fi
  # fallback: 4th field after the ')' in /proc/self/stat is the session id
  local stat rest; stat="$(cat /proc/self/stat 2>/dev/null)"; rest="${stat##*) }"
  # shellcheck disable=SC2086
  set -- $rest; printf '%s\n' "${4:-0}"
}

_sid_alive() {
  [ -n "${1:-}" ] || return 1
  if [ -n "${AGENT_LOCK_FAKE_ALIVE+x}" ]; then
    case " $AGENT_LOCK_FAKE_ALIVE " in *" $1 "*) return 0;; *) return 1;; esac
  fi
  # Non-numeric sids are harness-provided session IDs (e.g. CLAUDE_SESSION_ID).
  # They cannot be verified via pgrep, so treat them as alive and rely on the
  # heartbeat TTL to reap them when their holder stops refreshing. [T001268]
  case "$1" in *[!0-9]*) return 0;; esac
  pgrep -s "$1" >/dev/null 2>&1
}

_pid_alive() {  # <pid>
  [ -n "${1:-}" ] || return 1
  kill -0 "$1" 2>/dev/null
}

_detect_tool() {
  # AGENT_LOCK_TOOL zuerst — analog AGENT_LOCK_SID in _my_sid. Die Harness exportiert
  # CLAUDECODE/CLAUDE_CODE_SESSION_ID ambient in jede Session; stuende der Override
  # dahinter, koennte ambient State ihn ueberstimmen. Ein Override, den ambient State
  # ueberstimmen kann, ist keiner. [T002447]
  if [ -n "${AGENT_LOCK_TOOL:-}" ]; then printf '%s\n' "$AGENT_LOCK_TOOL"; return; fi
  # CLAUDE_SESSION_ID is the harness-provided env from Claude Code / opencode;
  # we also accept the older CLAUDECODE/CLAUDE_CODE marker for back-compat.
  # CLAUDE_SESSION_ID alone is enough to identify the Claude harness. [T001268]
  # [T002375-p1] Dieselbe Namensliste wie _my_sid — sonst erkennt der eine die Harness
  # und der andere nicht.
  local _v _sid_env=""
  for _v in $_AGENT_LOCK_SID_ENVS; do [ -n "${!_v:-}" ] && _sid_env="1" && break; done
  if [ -n "${_sid_env}${CLAUDECODE:-}${CLAUDE_CODE:-}" ]; then echo claude
  elif [ -n "${GEMINI_CLI:-}${GEMINI_SANDBOX:-}${GEMINI_API_KEY:-}" ]; then echo gemini
  else echo unknown; fi
}
