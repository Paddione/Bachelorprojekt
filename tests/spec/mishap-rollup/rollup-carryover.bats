#!/usr/bin/env bats
# tests/spec/mishap-rollup/rollup-carryover.bats — T013108
#
# Pruefmodus: OUTPUT-VERIFIKATION [T002448-M4]. Das Skript wird AUSGEFUEHRT und
# sein stdout/Exit-Code geprueft — kein Source-Grep.
#
# Hintergrund: Ein Rollup-Container schliesst per Merge=Closure, sobald irgendein
# PR auf seinem Zyklus-Branch merged. Eintraege, die dabei unerledigt blieben,
# waren danach unrettbar — der naechste Flush legt einen frischen Container an,
# und die Batch-Kommentare des alten liest niemand mehr (Zyklus 08-20/T012909:
# 3 von 10 Eintraegen erledigt, Container done/fixed). T013043 machte
# Unerledigtes sichtbar, dieses Ticket traegt es weiter.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  CARRY="$REPO_ROOT/scripts/factory/rollup-carryover.sh"
  WORK="$BATS_TEST_TMPDIR/work"
  mkdir -p "$WORK"
}

# Ein Zyklus-Plan im Format, das rollup-plan-tasks.sh seit T013043 erzeugt:
# zwei Eintraege offen, einer abgehakt.
_plan_with_open_entries() {
  cat <<'EOF'
---
title: "mishap-incident-rollup-2026-08-20-T012909 — Implementation Plan"
ticket_id: T012909
---

# mishap-incident-rollup-2026-08-20-T012909 — Implementation Plan

## Aufgaben — ein Eintrag, eine Entscheidung

- [x] **1. Erledigter Eintrag** (drift, komponente/a) — Disposition: gefixt, PR #1234
- [ ] **2. Offener Eintrag zwei** (suspicious, scripts/beispiel.sh) — Disposition: _<gefixt | bereits gefixt | kein Repo-Fix>_ + Begruendung
- [ ] **3. Offener Eintrag drei** (degraded, llm-proxy) — Disposition: _<gefixt | bereits gefixt | kein Repo-Fix>_ + Begruendung

- [ ] **Final Verification.** Die drei verpflichtenden CI-Gates:
EOF
}

_plan_all_done() {
  cat <<'EOF'
# mishap-incident-rollup-2026-08-19-T012445 — Implementation Plan

- [x] **1. Alles erledigt** (drift, komponente/a) — Disposition: gefixt
- [ ] **Final Verification.** Die drei verpflichtenden CI-Gates:
EOF
}

@test "aus einem Zyklus-Plan entsteht ein Batch mit genau den offenen Eintraegen" {
  _plan_with_open_entries > "$WORK/tasks.md"
  run bash "$CARRY" --plan "$WORK/tasks.md" --slug mishap-incident-rollup-2026-08-20-T012909
  [ "$status" -eq 0 ]
  # Positiv-Anker: beide offenen Eintraege sind uebernommen ...
  printf '%s\n' "$output" | grep -qF 'Offener Eintrag zwei'
  printf '%s\n' "$output" | grep -qF 'Offener Eintrag drei'
  # ... der abgehakte nicht.
  [ "$(printf '%s\n' "$output" | grep -cF 'Erledigter Eintrag')" -eq 0 ]
  # Der Prozess-Schritt ist kein Mishap-Eintrag.
  [ "$(printf '%s\n' "$output" | grep -cF 'Final Verification')" -eq 0 ]
}

@test "der erzeugte Batch wird vom Plan-Renderer als Batch erkannt" {
  _plan_with_open_entries > "$WORK/tasks.md"
  run bash "$CARRY" --plan "$WORK/tasks.md" --slug mishap-incident-rollup-2026-08-20-T012909
  [ "$status" -eq 0 ]
  # Der Uebertrag muss durch dieselbe Tuer wie ein Flusher-Batch, sonst zaehlt
  # ihn der Generator nicht mit.
  printf '%s\n' "$output" > "$WORK/comment.txt"
  run bash -c "'$REPO_ROOT/scripts/factory/rollup-plan-tasks.sh' --count < '$WORK/comment.txt'"
  [ "$status" -eq 0 ]
  [ "$(printf '%s' "$output" | tr -d '[:space:]')" = "2" ]
}

@test "der Uebertrag nennt den Quell-Zyklus" {
  _plan_with_open_entries > "$WORK/tasks.md"
  run bash "$CARRY" --plan "$WORK/tasks.md" --slug mishap-incident-rollup-2026-08-20-T012909
  [ "$status" -eq 0 ]
  printf '%s\n' "$output" | grep -qF 'mishap-incident-rollup-2026-08-20-T012909'
}

@test "ein Plan ohne offene Eintraege liefert Exit 3 und keinen Batch" {
  _plan_all_done > "$WORK/tasks.md"
  run bash "$CARRY" --plan "$WORK/tasks.md" --slug mishap-incident-rollup-2026-08-19-T012445
  # Positiv-Anker zuerst: der Kontrollfall mit offenen Eintraegen liefert 0 ...
  _plan_with_open_entries > "$WORK/tasks-open.md"
  run bash "$CARRY" --plan "$WORK/tasks-open.md" --slug x
  [ "$status" -eq 0 ]
  # ... erst dann die Negativ-Aussage.
  run bash "$CARRY" --plan "$WORK/tasks.md" --slug mishap-incident-rollup-2026-08-19-T012445
  [ "$status" -eq 3 ]
  [ -z "$(printf '%s' "$output" | tr -d '[:space:]')" ]
}

@test "--scan liefert nur den juengsten Zyklus, nicht jeden mit offenen Eintraegen" {
  local root="$WORK/repo-multi"
  mkdir -p "$root/openspec/changes/archive/2026-08-18-mishap-incident-rollup-2026-08-18-T012402"
  mkdir -p "$root/openspec/changes/archive/2026-08-20-mishap-incident-rollup-2026-08-20-T012909"
  _plan_with_open_entries > "$root/openspec/changes/archive/2026-08-18-mishap-incident-rollup-2026-08-18-T012402/tasks.md"
  printf 'T012402' > "$root/openspec/changes/archive/2026-08-18-mishap-incident-rollup-2026-08-18-T012402/.ticket"
  _plan_with_open_entries > "$root/openspec/changes/archive/2026-08-20-mishap-incident-rollup-2026-08-20-T012909/tasks.md"
  printf 'T012909' > "$root/openspec/changes/archive/2026-08-20-mishap-incident-rollup-2026-08-20-T012909/.ticket"

  run bash "$CARRY" --scan "$root" --container T099999
  [ "$status" -eq 0 ]
  # Positiv-Anker: der juengste Zyklus ist dabei ...
  printf '%s\n' "$output" | grep -qF '2026-08-20-T012909'
  # ... und genau eine Zeile kommt zurueck, der aeltere Zyklus nicht. Sonst
  # kaeme derselbe Eintrag nach zwei folgenlosen Zyklen doppelt im Plan an.
  [ "$(printf '%s\n' "$output" | grep -c 'mishap-incident-rollup')" -eq 1 ]
  [ "$(printf '%s\n' "$output" | grep -cF 'T012402')" -eq 0 ]
}

@test "--scan findet Zyklus-Plaene mit offenen Eintraegen und ueberspringt den laufenden" {
  local root="$WORK/repo"
  mkdir -p "$root/openspec/changes/mishap-incident-rollup-2026-08-20-T012909"
  mkdir -p "$root/openspec/changes/archive/2026-08-19-mishap-incident-rollup-2026-08-19-T012445"
  mkdir -p "$root/openspec/changes/mishap-incident-rollup-2026-08-25-T099999"
  _plan_with_open_entries > "$root/openspec/changes/mishap-incident-rollup-2026-08-20-T012909/tasks.md"
  printf 'T012909' > "$root/openspec/changes/mishap-incident-rollup-2026-08-20-T012909/.ticket"
  _plan_all_done > "$root/openspec/changes/archive/2026-08-19-mishap-incident-rollup-2026-08-19-T012445/tasks.md"
  printf 'T012445' > "$root/openspec/changes/archive/2026-08-19-mishap-incident-rollup-2026-08-19-T012445/.ticket"
  # Der laufende Zyklus: gehoert dem aktuellen Container und darf sich nicht
  # selbst uebertragen.
  _plan_with_open_entries > "$root/openspec/changes/mishap-incident-rollup-2026-08-25-T099999/tasks.md"
  printf 'T099999' > "$root/openspec/changes/mishap-incident-rollup-2026-08-25-T099999/.ticket"

  run bash "$CARRY" --scan "$root" --container T099999
  [ "$status" -eq 0 ]
  # Positiv-Anker: der abgeschlossene Zyklus mit offenen Eintraegen ist dabei ...
  printf '%s\n' "$output" | grep -qF 'mishap-incident-rollup-2026-08-20-T012909'
  # ... der vollstaendig erledigte nicht, und der laufende auch nicht.
  [ "$(printf '%s\n' "$output" | grep -cF 'T012445')" -eq 0 ]
  [ "$(printf '%s\n' "$output" | grep -cF 'T099999')" -eq 0 ]
}
