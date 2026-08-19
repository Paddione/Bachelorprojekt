#!/usr/bin/env bash
# scripts/dsh/web-up.sh — Start the DSH Web UI and register it in the Session Hub.
#
# Prueft, dass der Harness-Klon gebaut ist, startet die Web-Oberflaeche mit dem
# Repo-Bundle als Overlay, registriert die Sitzung im Hub und raeumt den Eintrag
# beim Beenden wieder ab.
#
# Usage: web-up.sh [port]        Default: 3080
#
# Exit-Codes:
#   0  Oberflaeche lief und wurde regulaer beendet
#   2  Klon fehlt oder ist nicht gebaut (Ursache steht in der Meldung)
#
# [T012965] Drei Korrekturen gegenueber der ersten Fassung, jede einzeln belegt:
#   - Der Start laeuft ueber `pnpm dsh` im Klon. `node_modules/.bin/dsh` gibt es
#     im Workspace nicht (ls => No such file), der Aufruf endete immer mit Exit 2.
#   - Das Overlay-Flag heisst `--patch`, nicht `--bundle` (`pnpm dsh --help`).
#     Mit dem falschen Flag waeren Hook-Bridge und Guard-Plugin nicht geladen
#     gewesen — der Nachweis haette nichts belegt.
#   - `session-hub.sh register` kennt `--name --port --type --title`, nicht
#     `--slug`/`--url` (cmd_register in scripts/session-hub.sh).
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
DSH_WEB_PORT="${1:-${DSH_WEB_PORT:-3080}}"
PATCH_FILE="$REPO/tools/dsh/cordis.patch.yml"

# --- Vorbedingungen ----------------------------------------------------------------
# [T012965] Der Klon wird aufgeloest, nicht geraten: im Worktree existiert nur ein
# node_modules-Symlink ohne package.json, und `pnpm` bricht dort mit
# ERR_PNPM_NO_PKG_MANIFEST ab.
if ! DSH_DIR="$(bash "$HERE/resolve-clone.sh" "$REPO" 2>/dev/null)"; then
  echo "web-up: deepseek-harness checkout not built — no clone with a package.json found" >&2
  echo "  set DSH_DIR, or run: task dsh:dsh:build" >&2
  exit 2
fi
if [[ ! -d "$DSH_DIR/node_modules" ]]; then
  echo "web-up: deepseek-harness not built (node_modules missing). Run:" >&2
  echo "  task dsh:dsh:build" >&2
  exit 2
fi
if [[ ! -f "$PATCH_FILE" ]]; then
  echo "web-up: bundle overlay missing at $PATCH_FILE" >&2
  exit 2
fi

# --- Laufzeit-Overlay aus der Vorlage bauen -----------------------------------------
# [T012965] Die eingecheckte Vorlage traegt Platzhalter; die realen Pfade stehen
# erst hier fest (gitignorierter Klon an maschinenabhaengigem Ort).
RUNTIME_PATCH="$(mktemp -t dsh-patch-XXXXXX.yml)"
trap 'rm -f "$RUNTIME_PATCH"' EXIT
sed -e "s#@@DSH_CLONE@@#${DSH_DIR}#g" -e "s#@@REPO@@#${REPO}#g" "$PATCH_FILE" > "$RUNTIME_PATCH"

if grep -q '@@' "$RUNTIME_PATCH"; then
  echo "web-up: unresolved placeholder left in the runtime overlay:" >&2
  grep -n '@@' "$RUNTIME_PATCH" >&2
  exit 2
fi

echo "web-up: starting dsh web UI on port $DSH_WEB_PORT (clone: $DSH_DIR)" >&2

( cd "$DSH_DIR" && pnpm dsh --profile web --patch "$RUNTIME_PATCH" --port "$DSH_WEB_PORT" ) &
DSH_PID=$!

# --- Im Session-Hub registrieren ---------------------------------------------------
HUB_NAME="dsh-web-${DSH_WEB_PORT}"
trap 'rm -f "$RUNTIME_PATCH"; bash "$REPO/scripts/session-hub.sh" deregister --name "$HUB_NAME" >/dev/null 2>&1 || true' EXIT

bash "$REPO/scripts/session-hub.sh" register \
  --name "$HUB_NAME" \
  --port "$DSH_WEB_PORT" \
  --type "dsh-web" \
  --title "DSH Web UI (port $DSH_WEB_PORT)" \
  >/dev/null 2>&1 || echo "web-up: session-hub registration skipped" >&2

wait "$DSH_PID" || true
