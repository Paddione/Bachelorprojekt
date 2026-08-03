#!/usr/bin/env bats
# tests/spec/software-factory/orphan-slot-reap.bats
# SSOT: openspec/specs/software-factory.md
# Tickets: T002610 (Waisen-Slot blockiert Claim still), T002618 (Watchdog bricht ab)
#
# Pruefmodus [T002448-M4]: command output verification. Jeder Test fuehrt das
# betroffene Skript AUS und prueft dessen Ausgabe bzw. den resultierenden
# DB-Zustand. Kein Source-Grep auf Skript-Interna — ein solcher Test belegt nur,
# dass Text existiert, nicht dass der Sweep tatsaechlich raeumt.
#
# Live-Tests brauchen einen erreichbaren Dev-Cluster (FACTORY_CTX gesetzt) und
# ueberspringen sich sonst — dasselbe Muster wie die FA-SF-Tests in scheduling.bats.
# Sie duerfen NIE gegen 'fleet' laufen; seed_test_feature verweigert das von sich aus.

load '_sf_common'

# factory-test-fixtures traegt die Endung .sh und ist damit nicht ueber `load`
# erreichbar (bats sucht .bash); die Bestandstests sourcen es ebenso direkt.
setup()    { _sf_setup; source tests/lib/factory-test-fixtures.sh; }
teardown() { _sf_teardown; }

# Namespace der Brand im aktuellen Kontext (dev-Cluster tragen das -dev-Suffix).
# FACTORY_NS hat Vorrang: der lokale k3d-Dev-Cluster haelt seinen shared-db-Pod
# in 'workspace', nicht im brand-abgeleiteten Namespace.
_osr_ns() {
  local brand="$1" ctx="${FACTORY_CTX:-fleet}" ns
  if [[ -n "${FACTORY_NS:-}" ]]; then echo "$FACTORY_NS"; return 0; fi
  case "$brand" in
    mentolder)  ns=workspace ;;
    korczewski) ns=workspace-korczewski ;;
    *) return 2 ;;
  esac
  if [[ "$ctx" == k3d-* || "$ctx" == *-dev ]]; then ns="${ns}-dev"; fi
  echo "$ns"
}

# psql gegen den shared-db-Pod der Brand. Heredoc-Eingaben brauchen `exec -i`,
# sonst laeuft psql mit leerem stdin und meldet trotzdem Exit 0.
_osr_psql() {
  local brand="$1" sql="$2" ctx="${FACTORY_CTX:-fleet}" ns pod
  ns="$(_osr_ns "$brand")" || return 2
  pod=$(kubectl get pod -n "$ns" --context "$ctx" \
    -l 'app in (shared-db, shared-db-dev)' --field-selector status.phase=Running \
    -o name 2>/dev/null | head -1)
  [[ -z "$pod" ]] && return 1
  kubectl exec -i "$pod" -n "$ns" --context "$ctx" -c postgres -- \
    psql -U website -d website -qtAc "$sql"
}

# Ticket in den Waisen-Zustand versetzen: Slot gesetzt, Status NICHT in_progress,
# updated_at um <mins> zurueckdatiert. Genau die Reproduktion aus T002610.
_osr_make_orphan() {
  local brand="$1" ext="$2" slot="$3" mins="$4"
  _osr_psql "$brand" "UPDATE tickets.tickets SET pipeline_slot=${slot}, status='backlog', updated_at = now() - interval '${mins} minutes' WHERE external_id='${ext}';"
}

_osr_slot_of() {
  _osr_psql "$1" "SELECT COALESCE(pipeline_slot::text,'NULL') FROM tickets.tickets WHERE external_id='$2';"
}

_osr_status_of() {
  _osr_psql "$1" "SELECT status FROM tickets.tickets WHERE external_id='$2';"
}

# Gibt jede Zeile aus, die `local` ausserhalb einer Funktion verwendet.
# Funktionsgrenzen: `name() {` bis zur schliessenden Klammer auf Spalte 0 —
# das deckt den Stil aller Skripte unter scripts/factory/ ab.
_osr_toplevel_local() {
  awk '
    /^[a-zA-Z_][a-zA-Z0-9_]*\(\)[[:space:]]*\{/ { infn = 1; next }
    infn && /^\}/                               { infn = 0; next }
    !infn && /^[[:space:]]*local[[:space:]]/    { print FILENAME ":" FNR ": " $0 }
  ' "$1"
}

# ── T002610: Waisen-Sweep im Watchdog ───────────────────────────────────────#

@test "T002610: watchdog releases an orphaned pipeline_slot" {
  # expected: FAIL bis der Waisen-Sweep in watchdog.sh existiert.
  # RED-Beweis: heute raeumt kein Sweep einen Slot, dessen Ticket nicht
  # in_progress ist — pipeline_slot bleibt auf 1 stehen.
  [ -n "${FACTORY_CTX:-}" ] || skip "no dev cluster context set"
  local brand="${TEST_BRAND:-korczewski}"
  ext=$(seed_test_feature "$brand" "tests/fixtures/osr-$$-a.txt")
  _osr_make_orphan "$brand" "$ext" 1 30

  run env BRAND="$brand" FACTORY_ORPHAN_SLOT_MIN=10 bash scripts/factory/watchdog.sh
  [ "$status" -eq 0 ]

  [ "$(_osr_slot_of "$brand" "$ext")" = "NULL" ]
}

@test "T002610: reaping an orphan leaves the ticket status untouched" {
  # expected: FAIL bis der Sweep existiert.
  # Abgrenzung zum Stale-Sweep: der setzt zusaetzlich den Status zurueck. Bei
  # einem Waisen ist der Status bereits korrekt; nur der Slot ist falsch.
  [ -n "${FACTORY_CTX:-}" ] || skip "no dev cluster context set"
  local brand="${TEST_BRAND:-korczewski}"
  ext=$(seed_test_feature "$brand" "tests/fixtures/osr-$$-b.txt")
  _osr_make_orphan "$brand" "$ext" 2 30

  run env BRAND="$brand" FACTORY_ORPHAN_SLOT_MIN=10 bash scripts/factory/watchdog.sh
  [ "$status" -eq 0 ]

  [ "$(_osr_slot_of "$brand" "$ext")" = "NULL" ]
  [ "$(_osr_status_of "$brand" "$ext")" = "backlog" ]
}

@test "T002610: the sweep spares running tickets and fresh orphans" {
  # POSITIV-ANKER [T002356-M1]: Ohne diesen Test bestuende "der Waise ist weg"
  # auch dann, wenn der Sweep wahllos JEDEN Slot raeumt. Erst der gueltige Fall
  # (Waise verschwindet), dann die Negativ-Aussagen (diese beiden bleiben).
  [ -n "${FACTORY_CTX:-}" ] || skip "no dev cluster context set"
  local brand="${TEST_BRAND:-korczewski}"
  orphan=$(seed_test_feature "$brand" "tests/fixtures/osr-$$-c.txt")
  running=$(seed_test_feature "$brand" "tests/fixtures/osr-$$-d.txt")
  fresh=$(seed_test_feature "$brand" "tests/fixtures/osr-$$-e.txt")

  _osr_make_orphan "$brand" "$orphan" 1 30
  # laufend: Slot gesetzt UND in_progress → kein Waise
  _osr_psql "$brand" "UPDATE tickets.tickets SET pipeline_slot=2, status='in_progress', updated_at = now() - interval '30 minutes' WHERE external_id='${running}';"
  # frischer Waise: Slot gesetzt, aber innerhalb der Karenzzeit
  _osr_make_orphan "$brand" "$fresh" 3 1

  # STALE_MIN hoch setzen, damit der bestehende Stale-Sweep das laufende Ticket
  # nicht seinerseits abraeumt — hier wird ausschliesslich der Waisen-Sweep geprueft.
  run env BRAND="$brand" FACTORY_ORPHAN_SLOT_MIN=10 FACTORY_STALE_MIN=999 \
    bash scripts/factory/watchdog.sh
  [ "$status" -eq 0 ]

  # Positiv-Anker zuerst: der Sweep tut ueberhaupt etwas.
  [ "$(_osr_slot_of "$brand" "$orphan")" = "NULL" ]
  # Negativ-Aussagen: diese beiden bleiben unangetastet.
  [ "$(_osr_slot_of "$brand" "$running")" = "2" ]
  [ "$(_osr_slot_of "$brand" "$fresh")" = "3" ]
}

# ── T002618: Watchdog laeuft ueberhaupt bis ans Ende ─────────────────────────#

@test "T002618: watchdog completes its sweep when a stale ticket exists" {
  # expected: FAIL bis `local tier_name` in watchdog.sh:160 korrigiert ist.
  # RED-Beweis: `local` ausserhalb einer Funktion ist unter `set -euo pipefail`
  # ein Fehler; das Skript endet mit Exit 1, sobald die Stale-Liste nicht leer
  # ist. Bei leerer Liste laeuft es durch — deshalb faellt es sonst nie auf.
  [ -n "${FACTORY_CTX:-}" ] || skip "no dev cluster context set"
  local brand="${TEST_BRAND:-korczewski}"
  ext=$(seed_test_feature "$brand" "tests/fixtures/osr-$$-f.txt")
  env BRAND="$brand" bash scripts/factory/slots.sh claim "$ext" 1 >/dev/null
  _osr_psql "$brand" "UPDATE tickets.tickets SET updated_at = now() - interval '40 minutes' WHERE external_id='${ext}';"

  run env BRAND="$brand" FACTORY_STALE_MIN=30 bash scripts/factory/watchdog.sh
  [ "$status" -eq 0 ]
  # Auf die Fehlerzeile eingegrenzt statt gegen das gesamte $output zu matchen.
  [ "$(printf '%s\n' "$output" | grep -c 'can only be used in a function')" -eq 0 ]
  # Der Lauf endet mit seinem JSON-Array — Beleg, dass er das Skriptende erreicht.
  printf '%s\n' "$output" | tail -1 | jq -e 'type == "array"'
}

# ── T002610: Dispatcher meldet fehlgeschlagene Claims ───────────────────────#

@test "T002610: schedule.sh reports a candidate whose slot claim fails" {
  # expected: FAIL bis schedule.sh den claim-gang-Fehlschlag meldet statt ihn
  # mit `>/dev/null 2>&1` zu verschlucken.
  # RED-Beweis: ein Ticket im Waisen-Zustand steht in der Queue, kann nie
  # geclaimt werden und erzeugt heute keinerlei Ausgabe.
  [ -n "${FACTORY_CTX:-}" ] || skip "no dev cluster context set"
  local brand="${TEST_BRAND:-korczewski}"
  ext=$(seed_test_feature "$brand" "tests/fixtures/osr-$$-g.txt")
  _osr_make_orphan "$brand" "$ext" 1 1

  run env BRAND="$brand" FACTORY_GLOBAL_CAP=3 bash scripts/factory/schedule.sh
  [ "$status" -eq 0 ]

  # Meldung auf die WARN-Zeile eingegrenzt: ein ungefilterter Vergleich gegen
  # $output koennte allein durch den Worktree-Pfad in einer Usage-Zeile passen.
  [ "$(printf '%s\n' "$output" | grep 'WARN' | grep -c "$ext")" -ge 1 ]
  # Fail-open: stdout bleibt ein gueltiger Launch-Plan.
  printf '%s\n' "$output" | grep '^\[' | tail -1 | jq -e 'type == "array"'
}

# ── Offline (laeuft auch ohne Cluster in CI) ────────────────────────────────#

@test "T002618: watchdog.sh uses no 'local' outside a function" {
  # expected: FAIL bis watchdog.sh:160 von `local tier_name=` auf `tier_name=`
  # korrigiert ist.
  #
  # Warum hier ausnahmsweise die Quelle geprueft wird statt der Laufzeit
  # [Abweichung von T002448-M4]: der Defekt schlaegt nur zu, wenn die Stale-Liste
  # nicht leer ist — das setzt eine erreichbare Ticket-DB voraus. Der Live-Test
  # oben deckt genau das ab, skippt aber ohne Cluster und liefe damit in CI nie.
  # `bash -n` taugt nicht als Ersatz: die Datei ist syntaktisch gueltig, der
  # Fehler entsteht erst zur Laufzeit.
  #
  # Die PRAEMISSE wird trotzdem ausgefuehrt statt behauptet (Schritte 1 und 2),
  # und der Detektor selbst hat einen Positiv-Anker (Schritt 3) — ohne ihn
  # bestuende der Test auch dann, wenn das awk-Muster gar nichts findet
  # [T002356-M1].
  local wd="$REPO_ROOT/scripts/factory/watchdog.sh"

  # 1) Praemisse belegen: `local` innerhalb einer Funktion ist zulaessig.
  run bash -c 'set -euo pipefail; f() { local x=1; echo "$x"; }; f'
  [ "$status" -eq 0 ]

  # 2) Praemisse belegen: auf Top-Level bricht es den Lauf ab.
  run bash -c 'set -euo pipefail; for i in 1; do local x=1; done; echo reached'
  [ "$status" -ne 0 ]
  [ "$(printf '%s\n' "$output" | grep -c 'can only be used in a function')" -eq 1 ]

  # 3) Detektor gegen eine Fixture mit bekanntem Treffer — Positiv-Anker.
  local fixture="$BATS_TEST_TMPDIR/toplevel-local.sh"
  printf '%s\n' '#!/usr/bin/env bash' 'f() {' '  local ok=1' '}' 'for i in 1; do' '  local bad=1' 'done' > "$fixture"
  [ "$(_osr_toplevel_local "$fixture" | wc -l)" -eq 1 ]

  # 4) Die eigentliche Aussage: watchdog.sh enthaelt keinen solchen Treffer.
  run _osr_toplevel_local "$wd"
  [ "$(printf '%s' "$output" | grep -c .)" -eq 0 ]
}

@test "T002610: watchdog dry-resolve stays green with the orphan sweep in place" {
  run env BRAND=mentolder FACTORY_DRY_RESOLVE=1 bash scripts/factory/watchdog.sh
  [ "$status" -eq 0 ]
}

@test "T002610: schedule.sh dry-resolve stays green with the claim reporting in place" {
  run env BRAND=mentolder FACTORY_DRY_RESOLVE=1 bash scripts/factory/schedule.sh
  [ "$status" -eq 0 ]
}
