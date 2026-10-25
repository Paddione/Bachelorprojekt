#!/usr/bin/env bash
# scripts/llm/pk-tablet/run-loadout.sh — laeuft AUF dem Tablet als
# /opt/llama/run-loadout.sh, gestartet von llama-server@<slug>.service.
# Die argv-Datei schreibt scripts/llm/pk-tablet/apply.sh (eine Zeile je
# Argument, gerendert von render.mjs). mapfile statt Wortzerlegung: JSON wie
# {"enable_thinking":false} bleibt so ein einziges Argument.
set -euo pipefail

slug="${1:?Aufruf: run-loadout.sh <slug>}"
argv_file="/etc/llama/${slug}.argv"
[[ -f "$argv_file" ]] || { echo "run-loadout: ${argv_file} fehlt — task llm:tablet:apply ausfuehren" >&2; exit 1; }

mapfile -t argv < "$argv_file"
exec /opt/llama/current/llama-server "${argv[@]}"
