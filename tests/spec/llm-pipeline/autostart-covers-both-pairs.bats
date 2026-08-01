#!/usr/bin/env bats
# tests/spec/llm-pipeline/autostart-covers-both-pairs.bats
# SSOT: openspec/specs/llm-pipeline.md
# Ticket: T002489
#
# Pruefmodus (Test-Resultats-Konvention T002448-M4): QUELLTEXT — dokumentierte
# Ausnahme. Der Autostart-Eintrag ist Windows-Host-Konfiguration; sein Ergebnis
# (ein .cmd im Startup-Ordner) entsteht erst bei der Anmeldung am GPU-Host und
# ist in der CI weder erzeugbar noch messbar. Geprueft wird deshalb der
# Generator: welche Server er in den Shim schreibt.
#
# Hintergrund: Am 2026-08-01 lief von vier bge-Backends nur :8096. Ursache waren
# drei unabhaengige Luecken — der Autostart kannte die Batch-Server nicht, der
# Watchdog war nicht mitinstalliert, und beide interaktiven Server waren zuvor
# an 'CUDA error: unknown error' gestorben.
#
# CRLF-Hinweis [T002338-M2]: scripts/llm/*.ps1 sind durchgehend CRLF. Anker auf
# '$' matchen dort nicht — '[[:space:]]*$' verwenden.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  INSTALLER="$REPO/scripts/llm/install-startup-autostart.ps1"
  WATCHDOG="$REPO/scripts/llm/watchdog-llm-servers.ps1"
}

@test "autostart installer exists" {
  [ -f "$INSTALLER" ]
}

@test "autostart covers all four bge servers, not just the interactive pair" {
  # Positiv-Anker: das interaktive Paar war immer schon drin — steht es nicht
  # mehr da, ist der Test kaputt und nicht die Implementierung.
  for s in start-embed-server start-rerank-server; do
    run grep -c "Script = '${s}\.ps1'" "$INSTALLER"
    echo "$s -> $output"
    [ "$output" -ge 1 ]
  done

  # Der eigentliche Gegenstand: das Batch-Paar.
  for s in start-embed-batch-server start-rerank-batch-server; do
    run grep -c "Script = '${s}\.ps1'" "$INSTALLER"
    echo "$s -> $output"
    [ "$output" -ge 1 ]
  done
}

@test "every server the watchdog supervises is also in the autostart list" {
  # Die eigentliche Invariante: Was der Watchdog neu startet, muss beim Booten
  # ueberhaupt erst einmal starten. Driftet eine der beiden Listen, faellt genau
  # das auf — unabhaengig davon, welche Server kuenftig dazukommen.
  local missing=""
  while IFS= read -r script; do
    [ -n "$script" ] || continue
    grep -q "Script = '${script}'" "$INSTALLER" || missing="${missing}${script} "
  done < <(grep -oP "Script = '\K[^']+" "$WATCHDOG")

  echo "im Watchdog, nicht im Autostart: ${missing:-<keine>}"
  [ -z "$missing" ]
}

@test "installer offers a watchdog switch — the servers die and need restarting" {
  # Ohne Watchdog bleibt ein an CUDA gestorbener Server tot, bis jemand ihn
  # von Hand startet. Genau das war der beobachtete Zustand.
  run grep -cE '\[switch\]\$Watchdog[[:space:]]*,?[[:space:]]*$' "$INSTALLER"
  echo "watchdog switch -> $output"
  [ "$output" -ge 1 ]
}
