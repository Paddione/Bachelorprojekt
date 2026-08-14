#!/usr/bin/env bats
#
# SSOT: openspec/specs/mishap-rollup.md
# Ticket: T004893 — Container-Erkennung gegen die REALE DB verifizieren.
#
# Hintergrund: Am 2026-08-14 07:50 legte `ticket.sh rollup-container` ein
# Duplikat (T004752) an, obwohl der offene Container T003533 existierte —
# dieser stand auf status=blocked, und die damalige positive Status-Allowlist
# (`status IN ('triage','backlog','planning','plan_staged','in_progress')`)
# schloss blocked aus. Der Root-Cause-Fix (T004898, auf main) ersetzte die
# Allowlist durch `status NOT IN ('done','archived')`.
#
# PRUEFMODUS (T002448-M4): Command-Output-Verifikation gegen die LIVE-Datenbank.
# `ticket.sh rollup-container` wird AUSGEFUEHRT; ein kubectl-Passthrough-Wrapper
# (repo-Idiom, erweitert um exec-Durchreichung) protokolliert das an die DB
# emittierte SQL, reicht den Aufruf aber an das echte kubectl durch — der Befehl
# antwortet mit echten DB-Daten (aktuell: genau ein offener Container T005030).
#
# Externe Abhaengigkeit (T002820 — Guard in der Rotphase): laufender Cluster mit
# ticket-DB. Fehlt er (z.B. CI), skippt der Test: er misst dann keine
# Runner-Ausstattung, sondern bleibt fuer den lokalen k3d-Lauf scharf.
#
# Real-DB-Opt-in [T002224]: Der Fail-closed-BATS-Guard in _ticket-core.sh
# repointet CTX unter BATS auf den Sentinell-Kontext bats-no-cluster-t002224,
# damit Mock-lose Tests nie in der Live-DB schreiben. TICKET_TEST_DB_OK=1 ist
# der dokumentierte Opt-in fuer echte DB-Zugriffe — er wird hier erst NACH den
# Verfuegbarkeits-Guards gesetzt, damit ein Cluster-loser Lauf (CI) skippt,
# bevor er opt-in kann.

ROLLUP_TITLE='Mishap Rollup — fortlaufende Sammlung'

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
}

cluster_available() {
  kubectl --context "${TICKET_CTX:-k3d-mentolder-dev}" get nodes --request-timeout=3s >/dev/null 2>&1
}

# Eigenstaendiger Read-Pfad (NICHT rollup-container): JSON-Liste via ticket.sh
# list, gefiltert auf offene Rollup-Container. Die Erwartung darf nicht aus der
# getesteten Funktion abgeleitet sein.
open_container_ids() {
  bash "$REPO_ROOT/scripts/ticket.sh" list --brand mentolder --limit 200 2>/dev/null \
    | jq -r '.[] | select(.title == "Mishap Rollup — fortlaufende Sammlung") |
             select(.status != "done" and .status != "archived") | .external_id'
}

@test "T004893: rollup-container findet den offenen Container gegen die reale DB und legt kein Duplikat an" {
  # ── Rotphasen-Guards (T002820) — externe Abhaengigkeit absichern ─────────
  if ! cluster_available; then
    skip "no live cluster reachable (kubectl get nodes failed)"
  fi
  # Opt-in erst nach dem Cluster-Guard [T002224]
  export TICKET_TEST_DB_OK=1
  if ! bash "$REPO_ROOT/scripts/ticket.sh" list --brand mentolder --limit 1 >/dev/null 2>&1; then
    skip "ticket-DB nicht erreichbar (ticket.sh list failed)"
  fi

  local before_count before_id
  before_count="$(open_container_ids | grep -c . || true)"
  if [[ "$before_count" != "1" ]]; then
    skip "Produktions-Invariante nicht erfuellt: ${before_count:-0} offene Rollup-Container statt genau 1 (Test wuerde den Anlege-Pfad ausloesen)"
  fi
  before_id="$(open_container_ids)"

  # ── kubectl-Passthrough-Wrapper: SQL protokollieren, echten Aufruf durchreichen ──
  local mockdir cap real_kubectl
  mockdir="$(mktemp -d)"
  cap="$mockdir/captured.sql"
  real_kubectl="$(command -v kubectl)"
  cat > "$mockdir/kubectl" <<MOCKEOF
#!/usr/bin/env bash
# ARGS loggen (SQL via \`psql -c <SQL>\`), stdin loggen (Heredoc-SQL), dann an
# das echte kubectl durchreichen — stdin bleibt als Datei verfuegbar.
echo "ARGS: \$*" >> "\$CAP"
if [[ ! -t 0 ]]; then
  stdin_file="\$(mktemp)"
  cat > "\$stdin_file"
  echo "STDIN: \$(cat "\$stdin_file")" >> "\$CAP"
  exec "$real_kubectl" "\$@" < "\$stdin_file"
fi
exec "$real_kubectl" "\$@"
MOCKEOF
  chmod +x "$mockdir/kubectl"

  # ── Positiv-Anker (T002356-M1): Befehl laeuft, Output nicht leer ──────────
  PATH="$mockdir:$PATH" CAP="$cap" \
    run bash "$REPO_ROOT/scripts/ticket.sh" rollup-container --brand mentolder

  [ "$status" -eq 0 ]
  [ -n "$output" ]

  # Aussage A: der einzige offene Container (reale DB) wird zurueckgegeben —
  # kein Create-Pfad, kein Diagnostik-Text.
  [ "$output" = "$before_id" ]
  [[ "$output" != *"kein offener Container"* ]]

  # Aussage C (der historische Defekt): das emittierte Such-Praedikat schliesst
  # NUR geschlossene Status aus (blocked-Container bleiben sichtbar) und ist
  # KEINE positive Allowlist. Diese Assertion war gegen den prae-T004898-Stand
  # (9f3e271ed) ROT: dort wurde `status IN ('triage',...)` emittiert.
  [ "$(grep -c "status NOT IN ('done','archived')" "$cap")" -ge 1 ]
  [ "$(grep -c "status IN (" "$cap")" -eq 0 ]

  # Aussage B: nach dem Lauf existiert weiterhin genau ein offener Container —
  # der Lauf hat kein Duplikat angelegt.
  local after_count
  after_count="$(open_container_ids | grep -c . || true)"
  [ "$after_count" = "1" ]

  rm -rf "$mockdir"
}
