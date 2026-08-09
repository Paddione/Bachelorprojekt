#!/usr/bin/env bats
# tests/spec/software-factory/brand-is-row-filter-not-namespace.bats
# SSOT: openspec/specs/software-factory.md
# T002689: `brand` ist eine Spalte in tickets.tickets, kein Ort. Die SDLC-Daten
# beider Brands liegen in DERSELBEN lokalen Datenbank; eine Abbildung
# brand -> Namespace ist ein Ueberbleibsel der Zwei-Cluster-Zeit und seit
# E3/T002626 falsch.
#
# PRUEFMODUS: command output verification. Jeder Test FUEHRT das Kommando AUS
# und prueft dessen stdout/rc — kein grep auf Skript-Quelltext. Die genutzten
# Dry-Resolve-Hooks (`--resolve-ns-only`, `FACTORY_DRY_RESOLVE=1`) loesen den
# Namespace ohne Cluster-Zugriff auf, die Tests laufen daher auch offline.
#
# POSITIV-ANKER: Jeder Test prueft ZUERST, dass der mentolder-Pfad das
# erwartete Ergebnis liefert. Faellt die Aufloesung ganz aus, wird der Test rot,
# statt die Negativ-Aussage vakuos zu erfuellen.

load '_sf_common'

setup()    { _sf_setup; }
teardown() { _sf_teardown; }

SDLC_NS="workspace"

@test "T002689: ticket.sh loest beide Brands auf den SDLC-Namespace auf" {
  # Positiv-Anker: der mentolder-Pfad liefert ueberhaupt eine Aufloesung.
  run bash scripts/ticket.sh --resolve-ns-only get --id T000001 --brand mentolder
  [ "$status" -eq 0 ]
  [ "$output" = "NS=${SDLC_NS}" ]

  # Kern der Aussage: korczewski ist ein Zeilenfilter, kein anderer Ort.
  run bash scripts/ticket.sh --resolve-ns-only get --id T000001 --brand korczewski
  [ "$status" -eq 0 ]
  [ "$output" = "NS=${SDLC_NS}" ]
}

@test "T002689: factory_resolve loest beide Brands auf den SDLC-Namespace auf" {
  # Positiv-Anker ueber den Dry-Resolve-Hook von schedule.sh.
  run env BRAND=mentolder FACTORY_DRY_RESOLVE=1 bash scripts/factory/schedule.sh
  [ "$status" -eq 0 ]
  [[ "$output" == *"ns=${SDLC_NS}" ]]

  run env BRAND=korczewski FACTORY_DRY_RESOLVE=1 bash scripts/factory/schedule.sh
  [ "$status" -eq 0 ]
  [[ "$output" == *"ns=${SDLC_NS}" ]]
}

@test "T002689: conflict-check loest beide Brands auf den SDLC-Namespace auf" {
  # conflict-check.sh haelt eine eigene Kopie der Abbildung UND eine eigene
  # Kontext-Suffix-Regel, der die k3d-Ausnahme aus T002626 fehlt. Sie ist
  # deshalb auch fuer den Default-Brand falsch (workspace-dev existiert nicht).
  run env BRAND=mentolder FACTORY_DRY_RESOLVE=1 bash scripts/factory/conflict-check.sh
  [ "$status" -eq 0 ]
  [[ "$output" == *"ns=${SDLC_NS}" ]]

  run env BRAND=korczewski FACTORY_DRY_RESOLVE=1 bash scripts/factory/conflict-check.sh
  [ "$status" -eq 0 ]
  [[ "$output" == *"ns=${SDLC_NS}" ]]
}

@test "T002689: readiness-audit erreicht fuer korczewski den SDLC-Namespace" {
  # Der Sentinel-Kontext aus _ticket-core.sh (T002224) greift hier nicht: vda.sh
  # startet einen eigenen Prozess, in dem die BATS-Variablen nicht wirken.
  # Deshalb wird der unerreichbare Kontext explizit gesetzt — der Pod-Lookup
  # scheitert damit garantiert ohne Cluster, und _pgpod nennt den Namespace, den
  # es abgefragt hat. Das ist der beobachtbare Output, an dem die
  # Brand-Aufloesung haengt.
  run env TICKET_CTX=t002689-no-cluster bash scripts/vda.sh ticket readiness-audit --brand mentolder
  [ "$status" -ne 0 ]
  [[ "$output" == *"namespace ${SDLC_NS} "* ]]

  run env TICKET_CTX=t002689-no-cluster bash scripts/vda.sh ticket readiness-audit --brand korczewski
  [ "$status" -ne 0 ]
  [[ "$output" == *"namespace ${SDLC_NS} "* ]]
  [[ "$output" != *"workspace-korczewski"* ]]
}

@test "T002689: Pod-Fehlermeldung nennt Kontext, Namespace und den Override" {
  run bash scripts/ticket.sh list --brand korczewski
  [ "$status" -ne 0 ]

  # Positiv-Anker: die Meldung erscheint ueberhaupt und nennt Ort und Kontext.
  [[ "$output" == *"no shared-db pod"* ]]
  [[ "$output" == *"namespace ${SDLC_NS} "* ]]
  [[ "$output" == *"context "* ]]

  # Kern: sie nennt den Hebel, mit dem der Aufrufer das korrigiert.
  [[ "$output" == *"TICKET_CTX"* ]]
}

@test "T002689: Backlog-Zaehlung faellt geschlossen aus statt 0 zu melden" {
  # Der Ausfall einer Brand darf nicht als "kein Backlog" durchgehen —
  # genau diese Klasse legte die korczewski-Brand still lahm.
  source scripts/factory/lib.sh

  # Positiv-Anker: auf dem Erfolgspfad liefert der Zaehler eine Zahl und rc=0.
  local stubdir="$BATS_TEST_TMPDIR/stub-ok"
  mkdir -p "$stubdir"
  cat >"$stubdir/kubectl" <<'STUB'
#!/usr/bin/env bash
case "$*" in
  *"get pod"*) echo "pod/shared-db-0" ;;
  *) echo '[{"external_id":"T000001"},{"external_id":"T000002"}]' ;;
esac
STUB
  chmod +x "$stubdir/kubectl"

  run env PATH="$stubdir:$PATH" bash -c 'source scripts/factory/lib.sh; factory_backlog_count korczewski'
  [ "$status" -eq 0 ]
  [[ "$output" =~ ^[0-9]+$ ]]

  # Kern: auf dem Fehlerpfad KEINE Zahl und rc != 0.
  local faildir="$BATS_TEST_TMPDIR/stub-fail"
  mkdir -p "$faildir"
  printf '#!/usr/bin/env bash\nexit 1\n' >"$faildir/kubectl"
  chmod +x "$faildir/kubectl"

  run env PATH="$faildir:$PATH" bash -c 'source scripts/factory/lib.sh; factory_backlog_count korczewski'
  [ "$status" -ne 0 ]
  [ "$output" != "0" ]
}
