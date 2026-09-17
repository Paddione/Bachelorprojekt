#!/usr/bin/env bash
# scripts/llm-proxy/retire-service.sh — Stoppt und deaktiviert llm-proxy.service [T900213].
#
# FreeToken (:1919) ist seit T900208 das einzige lokale Backend. Der llm-proxy
# (:18235) wird hiermit sauber stillgelegt. Reversibel:
#   systemctl --user enable --now llm-proxy.service
#
# Usage:
#   bash scripts/llm-proxy/retire-service.sh --confirm

set -euo pipefail

if [[ "${1:-}" != "--confirm" ]]; then
  echo "Usage: $0 --confirm" >&2
  echo "Stoppt und deaktiviert llm-proxy.service via systemctl --user." >&2
  exit 2
fi

if [[ "${CI:-}" = "true" ]] || [[ -n "${GITHUB_ACTIONS:-}" ]]; then
  echo "retire-service: Verweigerung unter CI (kein systemd/User-Service im Container)." >&2
  exit 1
fi

if ! command -v systemctl >/dev/null 2>&1; then
  echo "retire-service: systemctl nicht verfuegbar." >&2
  exit 1
fi

is_active=0
if systemctl --user is-active --quiet llm-proxy.service 2>/dev/null; then
  is_active=1
fi

is_enabled=0
if systemctl --user is-enabled --quiet llm-proxy.service 2>/dev/null; then
  is_enabled=1
fi

if [[ $is_active -eq 0 && $is_enabled -eq 0 ]]; then
  echo "retire-service: llm-proxy.service ist bereits inaktiv und deaktiviert."
  exit 0
fi

if [[ $is_active -eq 1 ]]; then
  systemctl --user stop llm-proxy.service
fi

if [[ $is_enabled -eq 1 ]]; then
  systemctl --user disable llm-proxy.service
fi

echo "retire-service: llm-proxy.service erfolgreich stillgelegt."
exit 0
