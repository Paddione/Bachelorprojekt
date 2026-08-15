#!/usr/bin/env bash
# scripts/lm-studio/lmstudio-bge-autoload.sh
#
# T005594 — haelt bge-m3 in LM Studio geladen, damit das Embed-Backup-Glied
# der llm-proxy-Kette (T005557) nach TTL-Ablauf oder LM-Studio-Neustart
# wieder verfuegbar ist. LM Studio 0.4.21 hat KEINE native Auto-Load-Option
# (`lms load` kennt kein --persist); entladen wird das Modell durch die
# GUI-Default-TTL (1h Idle, `lms ps` zeigt "45m/1h") oder manuell — dieser
# Lauf ist das Sicherheitsnetz dafuer.
#
# Idempotent und still: laeuft LM Studio nicht, endet das Skript ohne Aktion
# (der Timer versucht es beim naechsten Tick wieder). Der TCP-Check zuerst
# ist bewusst: ohne ihn wuerde `lms ps` unter systemd moeglicherweise die
# GUI-App zu starten versuchen, fuer die dort kein DISPLAY existiert.
#
# Aufgerufen vom systemd-User-Timer lmstudio-bge-autoload.timer; manuell:
#   bash scripts/lm-studio/lmstudio-bge-autoload.sh
#
# T006143: bge-m3 ist NUR auf PK-L-1 geladen zu halten — auf dem PK-Tablet
# darf das Modell in LM Studio nicht als geladen erscheinen (sonst laedt
# `lms load -y` ohne Device-Pin ggf. dort). Die llm-proxy-Kette behandelt
# LM Studio als EIN logisches Backend (:1234), egal welches LM-Link-Geraet
# das Modell traegt — die Ladung auf PK-L-1 ist per LM-Studio-UI
# sicherzustellen (Modell dort laden, Tablet-Eintrag fuer bge-m3 entfernen).

set -euo pipefail

LMS="$HOME/.lmstudio/bin/lms"
MODEL="text-embedding-bge-m3"
API_PORT=1234

# 1) LM-Studio-API-Server erreichbar? Sonst still beenden.
if ! (exec 3<>"/dev/tcp/127.0.0.1/${API_PORT}") 2>/dev/null; then
  exit 0
fi

# 2) Modell bereits geladen? `lms ps --json` liefert eine Liste mit
#    `identifier`-Feldern. Ist `lms ps` selbst kaputt, ist der Load-Versuch
#    in Schritt 3 die beste Recovery — derselbe Pfad wie "nicht geladen".
if "$LMS" ps --json 2>/dev/null | python3 -c "
import json, sys
try:
    loaded = [m.get('identifier', '') for m in json.load(sys.stdin)]
except Exception:
    sys.exit(1)
sys.exit(0 if '$MODEL' in loaded else 1)
"; then
  exit 0
fi

# 3) Nachladen. -y ist Pflicht: ohne TTY haengt `lms load` am interaktiven
#    Device-Prompt, wenn das Modell auf mehreren LM-Link-Geraeten existiert
#    (beobachtet 2026-08-14, siehe Memory lm-studio-wsl-lmlink).
"$LMS" load -y "$MODEL"
