#!/usr/bin/env bats
# tests/spec/e2e-test-infrastructure/vision-sweep.bats
#
# [T012781] Verdrahtung der vision-geurteilten Sweep-Stufe.
#
# Geprueft wird Kommandoausgabe, nicht Quelltext: was `task --list` meldet und
# was `task --dry` als auszufuehrendes Kommando rendert. Kein Test hier setzt
# einen erreichbaren Vision-Endpunkt oder einen GPU-Host voraus — ein Test, der
# das taete, misst in CI die Ausstattung des Runners statt den Zustand des Codes.
#
# Warum die Guards inline im cmds-Block stehen und nicht als `preconditions:`:
# `task --dry` WERTET preconditions AUS (gemessen an systemtest:all:headed ->
# Exit 201). Als precondition formuliert waere die Stufe in CI nicht pruefbar.
#
# SSOT: openspec/specs/e2e-test-infrastructure.md (REQ-vs-01..04, REQ-k8-02/04)

setup() {
  REPO_ROOT="$(cd "$(dirname "${BATS_TEST_FILENAME}")/../../.." && pwd)"
  TARGET="test:e2e:visual-sweep:vision"
  SPEC_FILE="$REPO_ROOT/tests/e2e/specs/k8-headed-verify.spec.ts"
  SKILL_FILE="$REPO_ROOT/.claude/skills/dev-flow-e2e/SKILL.md"
  PROXY="127.0.0.1:18235"
}

# ── Das Ziel existiert und ist beschrieben ─────────────────────────────────

@test "T012781: task --list kennt das Vision-Sweep-Ziel" {
  command -v task >/dev/null 2>&1 || skip "go-task nicht installiert"
  run bash -c "cd '$REPO_ROOT' && task --list 2>&1"
  # Positiv-Anker: die Liste ist ueberhaupt gefuellt. Ohne ihn bestuende ein
  # Negativtest auch bei leerer Ausgabe.
  [[ "${#output}" -gt 100 ]]
  [[ "$output" == *"test:e2e:visual-sweep"* ]]
  [[ "$output" == *"$TARGET"* ]]
}

# ── Der gerenderte Lauf haelt die Nebenlaeufigkeitsgrenze ein ──────────────

@test "T012781: gerendertes Kommando ist headed und auf drei Worker gedeckelt" {
  command -v task >/dev/null 2>&1 || skip "go-task nicht installiert"
  run bash -c "cd '$REPO_ROOT' && task --dry '$TARGET' 2>&1"
  [[ "$status" -eq 0 ]]
  [[ "${#output}" -gt 50 ]]

  # REQ-vs-03: hoechstens drei gleichzeitige Vision-Anfragen. Der Deckel haengt
  # an der Worker-Zahl — jeder Worker ist ein eigener Prozess, jedes Project ist
  # seriell, also gilt: gleichzeitige Anfragen <= Worker.
  [[ "$output" == *"--workers=3"* ]]
  [[ "$output" == *"--headed"* ]]
  [[ "$output" == *"VISUAL_SWEEP_VISION=1"* ]]
}

@test "T012781: alle vier Sweep-Projects laufen in EINEM Aufruf" {
  command -v task >/dev/null 2>&1 || skip "go-task nicht installiert"
  run bash -c "cd '$REPO_ROOT' && task --dry '$TARGET' 2>&1"
  [[ "$status" -eq 0 ]]
  # Vier Projects auf drei Workern ist Absicht: drei laufen, das vierte rueckt
  # nach. Die Obergrenze haengt an der Worker-Zahl, nicht an der Project-Zahl.
  [[ "$output" == *"visual-sweep-mentolder-desktop"* ]]
  [[ "$output" == *"visual-sweep-mentolder-mobile"* ]]
  [[ "$output" == *"visual-sweep-korczewski-desktop"* ]]
  [[ "$output" == *"visual-sweep-korczewski-mobile"* ]]
}

@test "T012781: der Lauf prueft Anzeige und Vision-Endpunkt, bevor er startet" {
  command -v task >/dev/null 2>&1 || skip "go-task nicht installiert"
  run bash -c "cd '$REPO_ROOT' && task --dry '$TARGET' 2>&1"
  [[ "$status" -eq 0 ]]
  # Headed ohne DISPLAY bricht mit einer Chromium-Meldung ab, die nicht nach der
  # Ursache aussieht.
  [[ "$output" == *"DISPLAY"* ]]
  # Wer dieses Ziel aufruft, will ausdruecklich ein Vision-Urteil. Ein stiller
  # Lauf ganz ohne Urteil waere die schlechtere Antwort.
  [[ "$output" == *"$PROXY"* ]]
}

# ── Kein CI-Gate (REQ-k8-02) ───────────────────────────────────────────────

@test "T012781: kein Workflow ruft das Vision-Ziel auf" {
  local wf_dir="$REPO_ROOT/.github/workflows"
  [[ -d "$wf_dir" ]]

  # Positiv-Anker: das Verzeichnis wurde wirklich durchsucht. Ein bekanntes,
  # vorhandenes Muster muss Treffer liefern — sonst waere die Null unten die
  # Null einer fehlgeschlagenen Suche, nicht die einer bestandenen Zusicherung.
  local anchor
  anchor="$(grep -rl 'task ' "$wf_dir" | wc -l | tr -d ' ')"
  [[ "$anchor" -gt 0 ]]

  local hits
  hits="$(grep -rl "$TARGET" "$wf_dir" | wc -l | tr -d ' ')"
  [[ "$hits" -eq 0 ]]
}

# ── Der falsche Vision-Pfad ist ersetzt (REQ-k8-04) ────────────────────────
#
# Vor T012781 nannten beide Dateien Port 8094 (in scripts/llm/loadouts.json
# nicht vorhanden) mit 8091 als Rueckfall (Loadout gemma26-factory, notes:
# "Kein mmproj"). Der Aufruf war damit dauerhaft wirkungslos.
#
# Geprueft wird die URL-Form ":8094" / ":8091", nicht das blosse Vorkommen der
# Ziffernfolge. Der Defekt war die Endpunkt-Konstante
# 'http://localhost:8094/v1/chat/completions' — die traegt den Doppelpunkt. Die
# Prosa, die ERKLAERT warum diese Ports falsch sind, muss stehen bleiben duerfen,
# sonst faellt mit dem Test auch der Grund weg und der naechste Leser wiederholt
# den Fehler.
# Anker CRLF-tolerant: tr -d '\r' vor jedem Vergleich.

@test "T012781: k8-headed-verify zeigt auf den Proxy, nicht auf 8094/8091" {
  [[ -f "$SPEC_FILE" ]]
  local body
  body="$(tr -d '\r' < "$SPEC_FILE")"
  # Positiv-Anker: die Datei wurde gelesen und ist nicht leer.
  [[ "${#body}" -gt 200 ]]
  [[ "$body" == *"K8_VISION_URL"* ]]

  [[ "$body" == *"$PROXY"* ]]
  [[ "$body" != *":8094"* ]]
  [[ "$body" != *":8091"* ]]
}

@test "T012781: k8-headed-verify sendet einen Modellnamen mit" {
  [[ -f "$SPEC_FILE" ]]
  local body
  body="$(tr -d '\r' < "$SPEC_FILE")"
  [[ "${#body}" -gt 200 ]]
  # Ohne 'model' trifft die Anfrage beim Proxy kein Backend.
  [[ "$body" == *"gemma12-vision"* ]]
}

@test "T012781: dev-flow-e2e Schritt 8.5 nennt den Proxy, nicht 8094/8091" {
  [[ -f "$SKILL_FILE" ]]
  local body
  body="$(tr -d '\r' < "$SKILL_FILE")"
  [[ "${#body}" -gt 200 ]]
  # Positiv-Anker: der Abschnitt, um den es geht, ist ueberhaupt vorhanden.
  [[ "$body" == *"headed-verify"* ]]

  [[ "$body" == *"$PROXY"* ]]
  [[ "$body" != *":8094"* ]]
  [[ "$body" != *":8091"* ]]
}
