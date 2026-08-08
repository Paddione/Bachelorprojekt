#!/usr/bin/env bats
# tests/spec/sdlc-isolation/e3-poller.bats
# SSOT: openspec/changes/e3-sdlc-tickets-lokal/tasks.md (T002626)
#
# PRUEFMODUS: command output verification [T002448-M4]. Der Poller wird mit
# gestubbten Aussenschnittstellen (gh, kubectl) AUSGEFUEHRT; geprueft wird, was
# er tut — nicht, was in seinem Quelltext steht.
#
# Run: tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-isolation/e3-poller.bats

setup() {
  REPO_ROOT="${REPO_ROOT:-$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)}"
  POLLER="${REPO_ROOT}/scripts/factory/github-poller.sh"
  STUBDIR="${BATS_TEST_TMPDIR}/bin"
  SQL_LOG="${BATS_TEST_TMPDIR}/sql.log"
  mkdir -p "$STUBDIR"
  : > "$SQL_LOG"

  # gh-Stub: liefert zwei PRs im erwarteten TSV-Format.
  cat > "$STUBDIR/gh" <<'STUB'
#!/usr/bin/env bash
printf '4242\tOPEN\tfeat(x): etwas [T000042]\tfeature/x-T000042\t[]\n'
printf '4243\tMERGED\tfix(y): anderes [T000043]\tfix/y-T000043\t[]\n'
STUB
  chmod +x "$STUBDIR/gh"

  # kubectl-Stub: protokolliert das SQL von stdin, antwortet sonst leer.
  cat > "$STUBDIR/kubectl" <<'STUB'
#!/usr/bin/env bash
for a in "$@"; do
  if [[ "$a" == "exec" ]]; then cat >> "$SQL_LOG"; echo "" ; exit 0; fi
done
# `kubectl get pod -o name` muss einen Pod liefern, sonst bricht _pgpod ab.
case "$*" in
  *"get pod"*) echo "pod/shared-db-stub" ;;
esac
exit 0
STUB
  chmod +x "$STUBDIR/kubectl"
}

run_poller() {
  run env PATH="$STUBDIR:$PATH" SQL_LOG="$SQL_LOG" BRAND=mentolder \
      FACTORY_CTX=k3d-mentolder-dev bash "$POLLER" "$@"
}

# ── Idempotenz ──────────────────────────────────────────────────────────────

@test "E3-Poller: PR-Schreibvorgaenge sind idempotent (ON CONFLICT)" {
  run_poller --task prs
  # Positiv-Anker: es wurde ueberhaupt geschrieben. Ohne ihn bestuende die
  # Aussage "enthaelt ON CONFLICT" auch bei leerem Protokoll (T002356-M1).
  [ -s "$SQL_LOG" ]
  grep -q 'INSERT INTO tickets.pr_status' "$SQL_LOG"
  # Erst jetzt die eigentliche Zusage: at-least-once darf keine Duplikate erzeugen.
  grep -q 'ON CONFLICT (pr_number) DO UPDATE' "$SQL_LOG"
}

@test "E3-Poller: derselbe Lauf zweimal erzeugt dieselben Anweisungen" {
  run_poller --task prs
  local first; first=$(grep -c 'INSERT INTO tickets.pr_status' "$SQL_LOG")
  : > "$SQL_LOG"
  run_poller --task prs
  local second; second=$(grep -c 'INSERT INTO tickets.pr_status' "$SQL_LOG")
  [ "$first" -gt 0 ]
  [ "$first" = "$second" ]
}

# ── Cursor-Disziplin ────────────────────────────────────────────────────────

@test "E3-Poller: Cursor wird NACH dem Schreiben gesetzt, nicht davor" {
  run_poller --task prs
  local ins cur
  ins=$(grep -n 'INSERT INTO tickets.pr_status' "$SQL_LOG" | head -1 | cut -d: -f1)
  cur=$(grep -n 'INSERT INTO tickets.poller_cursor' "$SQL_LOG" | head -1 | cut -d: -f1)
  # Positiv-Anker: beide Anweisungen kamen ueberhaupt vor.
  [ -n "$ins" ]
  [ -n "$cur" ]
  # Die Reihenfolge ist die Zusage aus design.md D3: ein Cursor, der vor dem
  # Schreiben vorrueckt, verliert genau die Ereignisse, die die DoD schuetzt.
  [ "$ins" -lt "$cur" ]
}

@test "E3-Poller: gescheiterte gh-Abfrage laesst den Cursor stehen" {
  # gh-Stub, der fehlschlaegt.
  cat > "$STUBDIR/gh" <<'STUB'
#!/usr/bin/env bash
echo "HTTP 504" >&2
exit 1
STUB
  chmod +x "$STUBDIR/gh"
  : > "$SQL_LOG"

  run_poller --task prs
  [ "$status" -ne 0 ]
  # Kein Cursor-Vorrueckn bei Fehler — sonst gilt ein nie verarbeitetes
  # Ereignis als erledigt.
  run grep -c 'INSERT INTO tickets.poller_cursor' "$SQL_LOG"
  [ "$output" = "0" ]
}

# ── Ticket-Zuordnung ────────────────────────────────────────────────────────

@test "E3-Poller: Ticket-ID wird aus dem PR-Titel gezogen" {
  run_poller --task prs
  grep -q "'T000042'" "$SQL_LOG"
  grep -q "'T000043'" "$SQL_LOG"
}

# ── Schema ──────────────────────────────────────────────────────────────────

@test "E3-Poller: legt seine Tabellen idempotent an" {
  run_poller --task prs
  grep -q 'CREATE TABLE IF NOT EXISTS tickets.poller_cursor' "$SQL_LOG"
  grep -q 'CREATE TABLE IF NOT EXISTS tickets.pr_status' "$SQL_LOG"
}

@test "E3-Poller: schreibt NICHT in tickets.pr_events" {
  # pr_events traegt Release-Notes-Semantik (merged_at NOT NULL) und ist kein
  # Zustandsspeicher fuer offene PRs.
  run_poller --task prs
  [ -s "$SQL_LOG" ]                      # Positiv-Anker
  run grep -c 'INSERT INTO tickets.pr_events' "$SQL_LOG"
  [ "$output" = "0" ]
}

# ── systemd-Units ───────────────────────────────────────────────────────────

@test "E3-Poller: Timer holt nach einer Auszeit nach" {
  local timer="${REPO_ROOT}/scripts/factory/sdlc-github-poller.timer"
  [ -f "$timer" ]
  # Ohne Persistent bliebe jeder Lauf aus, dessen Zeitpunkt in eine
  # Ausschaltphase fiel — der haeufige Fall auf einer Workstation.
  grep -q 'Persistent=true' "$timer"
}
