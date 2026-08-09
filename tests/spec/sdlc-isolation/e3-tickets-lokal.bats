#!/usr/bin/env bats
# tests/spec/sdlc-isolation/e3-tickets-lokal.bats
# SSOT: openspec/changes/e3-sdlc-tickets-lokal/tasks.md (T002626)
#
# PRUEFMODUS: command output verification [T002448-M4]. Die Umstellung wird
# gemessen, indem die Skripte AUSGEFUEHRT und ihre Ausgaben gelesen werden —
# nicht, indem im Quelltext nach Kontextnamen gegrept wird. Ein Grep belegte
# nur, dass ein String existiert, nicht dass die Aufloesung stimmt.
#
# Ausnahme: die Abwesenheit der Ticket-Bloecke in post-merge.yml manifestiert
# sich ausschliesslich im Dateiinhalt — dort ist grep das angemessene Mittel,
# mit Positiv-Anker (T002356-M1).
#
# Run: tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-isolation/e3-tickets-lokal.bats

setup() {
  REPO_ROOT="${REPO_ROOT:-$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)}"
  TICKET_SH="${REPO_ROOT}/scripts/ticket.sh"
  MIGRATE="${REPO_ROOT}/scripts/sdlc/migrate-tickets.sh"
}

# ── Namespace-Aufloesung (D7) ───────────────────────────────────────────────

@test "E3: SDLC-Kontext loest auf workspace auf, nicht workspace-dev" {
  run env TICKET_CTX=k3d-mentolder-dev BRAND=mentolder \
      bash "$TICKET_SH" --resolve-ns-only get --id T000001
  [ "$status" -eq 0 ]
  [ "$output" = "NS=workspace" ]
}

@test "E3: historischer fleet-dev-Kontext behaelt sein -dev-Suffix" {
  # Positiv-Anker gegen eine Ueberkorrektur: die Regel darf nicht pauschal
  # entfernt worden sein, sonst zeigt der alte dev-Stack ins Leere.
  run env TICKET_CTX=gekko-hetzner-2-dev BRAND=mentolder \
      bash "$TICKET_SH" --resolve-ns-only get --id T000001
  [ "$status" -eq 0 ]
  [ "$output" = "NS=workspace-dev" ]
}

@test "E3/T002689: korczewski loest auf denselben SDLC-Namespace auf wie mentolder" {
  # Bis T002689 stand hier die Erwartung NS=workspace-korczewski ("korczewski
  # behaelt seinen eigenen Namespace"). Das war ein Ueberbleibsel der
  # Zwei-Cluster-Zeit: seit genau dieser E3-Umstellung liegen die SDLC-Zeilen
  # BEIDER Brands in DERSELBEN lokalen Datenbank (korczewski|36, mentolder|2138),
  # und `workspace-korczewski` existiert im k3d-Kontext gar nicht. Die
  # Erwartung fixierte damit den Fehler, den E3 selbst erzeugt hatte: jeder
  # korczewski-Aufruf brach am Pod-Lookup ab. `brand` ist ein Zeilenfilter.
  run env TICKET_CTX=k3d-mentolder-dev BRAND=korczewski \
      bash "$TICKET_SH" --resolve-ns-only get --id T000001
  [ "$status" -eq 0 ]
  [ "$output" = "NS=workspace" ]
}

# ── Default-Kontext ─────────────────────────────────────────────────────────

@test "E3: ohne TICKET_CTX adressiert der Ticket-Pfad den lokalen Cluster" {
  # Gemessen wird der Kontext, mit dem kubectl TATSAECHLICH aufgerufen wird —
  # ueber einen Stub, der ihn protokolliert. Das ist im Repo das etablierte
  # Idiom (T002224 nennt es ausdruecklich) und hier zwingend: derselbe
  # T002224-Guard setzt CTX unter BATS auf einen Sentinel, damit kein Test in
  # die Live-Datenbank schreibt. Ein Aufruf von `ticket.sh get` koennte den
  # Default deshalb gar nicht sichtbar machen.
  local stubdir="${BATS_TEST_TMPDIR}/bin"
  mkdir -p "$stubdir"
  cat > "$stubdir/kubectl" <<'STUB'
#!/usr/bin/env bash
# Protokolliert den --context-Wert und liefert sonst nichts.
while [[ $# -gt 0 ]]; do
  case "$1" in
    --context) echo "CONTEXT=$2" >> "$KUBECTL_LOG"; shift 2 ;;
    *) shift ;;
  esac
done
exit 0
STUB
  chmod +x "$stubdir/kubectl"

  KUBECTL_LOG="${BATS_TEST_TMPDIR}/kubectl.log"
  : > "$KUBECTL_LOG"

  # TICKET_TEST_DB_OK=1 hebt den Sentinel auf; der Stub faengt jeden Aufruf ab,
  # es kann also nichts an einer echten Datenbank landen.
  run env -u TICKET_CTX PATH="$stubdir:$PATH" KUBECTL_LOG="$KUBECTL_LOG" \
      TICKET_TEST_DB_OK=1 BRAND=mentolder \
      bash "$TICKET_SH" get --id T000001

  # Positiv-Anker ZUERST: der Aufloesungspfad wurde ueberhaupt betreten.
  # Ohne ihn bestuende die Negativ-Aussage auch bei leerem Protokoll (T002356-M1).
  [ -s "$KUBECTL_LOG" ]
  grep -q 'CONTEXT=k3d-mentolder-dev' "$KUBECTL_LOG"
  # Erst jetzt: fleet wurde nicht angesprochen.
  run grep -c 'CONTEXT=fleet' "$KUBECTL_LOG"
  [ "$output" = "0" ]
}

@test "E3: TICKET_CTX=fleet bleibt als Override wirksam" {
  run env TICKET_CTX=fleet BRAND=mentolder bash "$TICKET_SH" --resolve-ns-only get --id T000001
  [ "$status" -eq 0 ]
  [ "$output" = "NS=workspace" ]
}

# ── Migrationswerkzeug ──────────────────────────────────────────────────────

@test "E3: migrate-tickets dump --dry-run nennt den Ausschluss von provider_config" {
  run bash "$MIGRATE" dump --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *"--exclude-table=tickets.provider_config"* ]]
}

@test "E3: freeze ist ohne ausdrueckliche Bestaetigung gesperrt (T002722)" {
  # Der Freeze wuerde die Projektverwaltung im Kundenportal brechen. Er gehoert
  # zu E4 und darf in E3 nicht versehentlich laufen.
  run bash "$MIGRATE" freeze
  [ "$status" -ne 0 ]
  [[ "$output" == *"T002722"* ]]
}

@test "E3: freeze --dry-run zeigt das SQL trotzdem an" {
  # Positiv-Anker zum vorigen Test: die Sperre darf den Einblick nicht nehmen,
  # sonst waere sie nicht pruefbar.
  run bash "$MIGRATE" freeze --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *"REVOKE"* ]]
  [[ "$output" == *"provider_config"* ]]
}

# ── CI-Entkernung ───────────────────────────────────────────────────────────

@test "E3: post-merge.yml schreibt nicht mehr in die Ticket-Datenbank" {
  local wf="${REPO_ROOT}/.github/workflows/post-merge.yml"
  [ -f "$wf" ]
  # Positiv-Anker ZUERST (T002356-M1): der Workflow existiert noch und tut
  # weiterhin, wofuer er da ist. Ohne diesen Anker bestuende der Negativtest
  # auch bei geloeschter Datei.
  grep -q 'render-artifact:' "$wf"
  grep -q 'deploy-legacy:' "$wf"
  # Erst jetzt die Negativ-Aussage: keine ausfuehrbare Ticket-Schreibzeile mehr.
  run grep -c '^[^#]*ticket\.sh update-status' "$wf"
  [ "$output" = "0" ]
}

@test "E3: post-merge.yml hat keine unaufloesbaren needs mehr" {
  # mark-awaiting wurde entfernt; ein zurueckgebliebenes needs wuerde den
  # gesamten Workflow beim Start scheitern lassen.
  run grep -c 'needs:.*mark-awaiting' "${REPO_ROOT}/.github/workflows/post-merge.yml"
  [ "$output" = "0" ]
}

# ── Runbook ─────────────────────────────────────────────────────────────────

@test "E3: Cutover-Runbook existiert und benennt die Reihenfolge" {
  local rb="${REPO_ROOT}/docs/sdlc-stack/e3-cutover.md"
  [ -f "$rb" ]
  grep -q 'Factory anhalten' "$rb"
  grep -q 'T002722' "$rb"
}
