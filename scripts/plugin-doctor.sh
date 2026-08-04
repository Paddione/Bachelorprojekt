#!/usr/bin/env bash
# scripts/plugin-doctor.sh — Vergleicht Plugin-Aktivierung gegen Installation. [T002651]
#
# Ein Plugin, das .claude/settings.json aktiviert (enabledPlugins: true), aber
# maschinenlokal nicht installiert oder im User-Scope deaktiviert ist, laedt
# nicht — ohne Fehler, ohne Warnung, ohne jedes Signal. Der Doctor meldet genau
# diese beiden Faehigkeitsverluste; die Gegenrichtung (lokal mehr aktiviert als
# im Repo deklariert) bleibt still, weil sie keine Faehigkeit kostet.
#
# Exit-Codes: 0 sauber oder nicht anwendbar, 1 Befund, 2 unlesbares JSON.
#
# Usage: bash scripts/plugin-doctor.sh [--json]
#   --json  valides JSON auf stdout (findings + status), Exit-Code bleibt gleich
#
# Overrides (Pflicht-Schnittstelle, damit CI gegen Fixtures pruefen kann
# statt nur zu greppen [T002448-M4]):
#   PLUGIN_DOCTOR_CLAUDE_HOME   ersetzt ~/.claude (maschinenlokaler Zustand)
#   PLUGIN_DOCTOR_REPO_SETTINGS ersetzt .claude/settings.json (Team-Wahrheit)
#
# Fehlt das Claude-Home-Verzeichnis (fremde Maschine, CI-Runner), hat die
# maschinenlokale Pruefung nichts zu sagen: Exit 0 mit einem Hinweis.
# Bewusst kein `skip`-Aequivalent — fail-open waere in CI still gruen.

set -uo pipefail

JSON_MODE=0
[ "${1:-}" = "--json" ] && JSON_MODE=1

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_SETTINGS="${PLUGIN_DOCTOR_REPO_SETTINGS:-${REPO_ROOT}/.claude/settings.json}"
CLAUDE_HOME="${PLUGIN_DOCTOR_CLAUDE_HOME:-${HOME}/.claude}"

export DOCTOR_REPO_SETTINGS="$REPO_SETTINGS"
export DOCTOR_CLAUDE_HOME="$CLAUDE_HOME"
export DOCTOR_JSON="$JSON_MODE"

exec python3 - "$REPO_SETTINGS" "$CLAUDE_HOME" "$JSON_MODE" <<'PY'
import json, os, sys

repo_path, claude_home, json_mode = sys.argv[1], sys.argv[2], sys.argv[3] == "1"

def die(msg, code):
    if json_mode:
        print(json.dumps({"findings": [], "note": msg, "status": "unreadable"}))
    else:
        print(msg)
    sys.exit(code)

def load_json(path, what):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return None
    except (OSError, ValueError, TypeError) as e:
        die("plugin-doctor: %s unlesbar (%s): %s" % (what, path, e), 2)

# Repo-Aktivierung = Team-Wahrheit (nur true-Eintraege aktivieren ein Plugin)
repo = load_json(repo_path, "Repo-Settings")
if repo is None:
    repo = {}
if not isinstance(repo, dict):
    die("plugin-doctor: Repo-Settings sind kein JSON-Objekt (%s)" % repo_path, 2)
repo_enabled = [k for k, v in repo.get("enabledPlugins", {}).items() if v is True]

# Kein Claude-Home -> maschinenlokale Pruefung hat nichts zu sagen (exit 0)
if not os.path.isdir(claude_home):
    note = "plugin-doctor: nicht anwendbar — kein Claude-Home (%s)" % claude_home
    if json_mode:
        print(json.dumps({"findings": [], "note": note, "status": "not_applicable"}))
    else:
        print(note)
    sys.exit(0)

installed = load_json(os.path.join(claude_home, "plugins", "installed_plugins.json"),
                      "installed_plugins.json") or {}
user = load_json(os.path.join(claude_home, "settings.json"), "User-Settings") or {}
if not isinstance(installed, dict):
    die("plugin-doctor: installed_plugins.json ist kein JSON-Objekt", 2)
if not isinstance(user, dict):
    die("plugin-doctor: User-Settings sind kein JSON-Objekt", 2)
user_plugins = user.get("enabledPlugins", {}) or {}

findings = []
for plugin in repo_enabled:
    if plugin not in installed:
        findings.append("%s: im Repo aktiviert, aber nicht installiert" % plugin)
    else:
        user_val = user_plugins.get(plugin)
        if user_val is not True:
            state = "deaktiviert" if user_val is False else "nicht gefuehrt"
            findings.append("%s: im Repo aktiviert, im User-Scope %s" % (plugin, state))

if json_mode:
    print(json.dumps({"findings": findings,
                      "status": "drift" if findings else "clean"}))
else:
    for f in findings:
        print("plugin-doctor: Befund: %s" % f)

sys.exit(1 if findings else 0)
PY
