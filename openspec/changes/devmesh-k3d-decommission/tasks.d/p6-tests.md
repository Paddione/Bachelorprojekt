# p6 — Tests: Guards, Umstellungen, Löschungen (tests)

_Ticket: T900120_ · Rolle `tests` · keine Abhängigkeit (RED zuerst)

Konventionen: `tests/CLAUDE.md` (eigene Datei je Vorgang unter `tests/spec/<spec>/`,
Positiv-Anker im selben Test, keine nackte `!`-Pipeline, Runner
`tests/unit/lib/bats-core/bin/bats`). Kein Test enthält das Context-Literal selbst; das Muster
wird aus zwei Teilstrings zusammengesetzt.

Context-Zuordnung in Tests: Live-DB-Tests zeigen per Default auf `devmesh` (Entwicklungsdaten,
nie Prod). Über `scripts/ticket.sh` schreibende Fixtures skippen dort, weil der SP-3-Guard
Ticket-Writes auf devmesh verweigert. Stub-basierte Tests nutzen neutrale Namen oder `fleet`.

### Task 6.1 — Neue Guards schreiben und RED nachweisen (≤60 min)

Datei (neu) `tests/spec/local-dev-mesh/no-k3d-context.bats`:

```bash
#!/usr/bin/env bats
# tests/spec/local-dev-mesh/no-k3d-context.bats — T900120
# PRUEFMODUS: Querschnittstest ueber getrackte Dateien (git grep). Die Aussage
# "kein aktiver Verweis" manifestiert sich nur im Dateibestand (tests/CLAUDE.md, Ausnahme).
# Das Suchmuster wird zusammengesetzt, damit diese Datei sich nicht selbst findet.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  PAT="k3d-mentolder""-dev"
}

_active_hits() {
  local ex=(
    ':!openspec/changes'                        # Change-Akten inkl. archive/ und devmesh-*
    ':!docs/superpowers/plans'
    ':!docs/superpowers/specs/archive'
    ':!docs/adr'
    ':!k3d/docs-content-built'                  # generiert aus docs/ und docs/adr/
    ':!scripts/migrations'                      # unveraenderliche Messprotokolle
    ':!tests/fixtures/mishap-dedupe-korpus.json' # Korpus echter Tickettexte
  )
  # Bis zur Archivierung dieses Changes tragen die SSOT-Specs noch die alten
  # Requirements; seine Deltas ersetzen sie beim Archivieren.
  if [ -d "$REPO_ROOT/openspec/changes/devmesh-k3d-decommission" ]; then
    ex+=(':!openspec/specs')
  fi
  git -C "$REPO_ROOT" grep -l -F -e "$PAT" -- . "${ex[@]}" || true
}

@test "search finds the pattern in an excluded path (positive anchor)" {
  run git -C "$REPO_ROOT" grep -l -F -e "$PAT" -- docs/adr
  [ "$status" -eq 0 ]
  [ -n "$output" ]
}

@test "no active reference to the k3d dev context remains" {
  local anchor hits
  anchor="$(git -C "$REPO_ROOT" grep -l -F -e "$PAT" -- docs/adr || true)"
  [ -n "$anchor" ]
  hits="$(_active_hits)"
  [ -z "$hits" ] || { echo "aktive Verweise:"; echo "$hits"; return 1; }
}
```

Datei (neu) `tests/spec/local-dev-mesh/factory-ctx-default.bats`:

```bash
#!/usr/bin/env bats
# tests/spec/local-dev-mesh/factory-ctx-default.bats — T900120
# PRUEFMODUS: command output verification — lib.sh wird gesourct, der Wert ausgegeben.

setup() { REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"; }

@test "explicit FACTORY_CTX wins (positive anchor)" {
  run env FACTORY_CTX=lab-cluster bash -c "source '$REPO_ROOT/scripts/factory/lib.sh'; printf 'CTX=%s\n' \"\$FACTORY_CTX\""
  [ "$status" -eq 0 ]
  echo "$output" | grep -qx 'CTX=lab-cluster'
}

@test "lib.sh without FACTORY_CTX resolves to fleet" {
  run env -u FACTORY_CTX bash -c "source '$REPO_ROOT/scripts/factory/lib.sh'; printf 'CTX=%s\n' \"\$FACTORY_CTX\""
  [ "$status" -eq 0 ]
  echo "$output" | grep -qx 'CTX=fleet'
}
```

Datei (neu) `tests/spec/local-dev-mesh/k3d-acceptance-gate.bats`:

```bash
#!/usr/bin/env bats
# tests/spec/local-dev-mesh/k3d-acceptance-gate.bats — T900120
# PRUEFMODUS: command output verification mit gestubbtem kubectl/ssh.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  ACCEPT="$REPO_ROOT/scripts/devmesh/acceptance.sh"
  TEARDOWN="$REPO_ROOT/scripts/devmesh/k3d-teardown.sh"
  STUB="$BATS_TEST_TMPDIR/bin"; mkdir -p "$STUB"
  export SSH_LOG="$BATS_TEST_TMPDIR/ssh.log"; : > "$SSH_LOG"
  cat > "$STUB/kubectl" <<'EOF'
#!/usr/bin/env bash
case "$*" in *pg_dump*) printf '%s' "${DUMP_CONTENT:-}" ;; esac
exit 0
EOF
  cat > "$STUB/ssh" <<'EOF'
#!/usr/bin/env bash
echo "$*" >> "$SSH_LOG"
exit 0
EOF
  chmod +x "$STUB/kubectl" "$STUB/ssh"
  export PATH="$STUB:$PATH" DEVMESH_BACKUP_ROOT="$BATS_TEST_TMPDIR/backups"
  export DEVMESH_HEALTH_CMD=true DEVMESH_COMPARE_CMD=true
}

@test "acceptance passes with health, comparison and a non-empty dump (positive anchor)" {
  run env DUMP_CONTENT=PGDMP bash "$ACCEPT"
  [ "$status" -eq 0 ]
  [ -n "$(find "$DEVMESH_BACKUP_ROOT" -name ACCEPTANCE_OK)" ]
}

@test "acceptance fails on an empty dump and writes no marker" {
  run env DUMP_CONTENT= bash "$ACCEPT"
  [ "$status" -ne 0 ]
  [ -z "$(find "$DEVMESH_BACKUP_ROOT" -name ACCEPTANCE_OK 2>/dev/null)" ]
}

@test "acceptance fails when the migration comparison fails" {
  run env DUMP_CONTENT=PGDMP DEVMESH_COMPARE_CMD=false bash "$ACCEPT"
  [ "$status" -ne 0 ]
}

@test "teardown after a passed gate deletes the cluster (positive anchor)" {
  run env DUMP_CONTENT=PGDMP bash "$TEARDOWN"
  [ "$status" -eq 0 ]
  grep -qF 'k3d cluster delete mentolder-dev' "$SSH_LOG"
}

@test "teardown without a fresh dump is refused and deletes nothing" {
  run env DUMP_CONTENT= bash "$TEARDOWN"
  [ "$status" -ne 0 ]
  [ -z "$(grep -F 'cluster delete' "$SSH_LOG" || true)" ]
}
```

RED-Nachweis vor p1–p5 (Implementierung fehlt: Skripte fehlen, Default `k3d-…`, aktive Treffer):

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-dev-mesh/no-k3d-context.bats tests/spec/local-dev-mesh/factory-ctx-default.bats tests/spec/local-dev-mesh/k3d-acceptance-gate.bats
# expected: FAIL (je Datei mindestens ein "not ok"; die Positiv-Anker von no-k3d-context und factory-ctx-default sind "ok")
```

### Task 6.2 — SDLC-Isolation-Tests auf devmesh, Kubelet-Guard löschen (≤60 min)

Dateien: `tests/spec/sdlc-isolation/e2-local-stack.bats`, `sdlc-up-command.bats`,
`llm-up-health.bats`, `e3-tickets-lokal.bats`, `e3-backup.bats`, `e3-poller.bats`; gelöscht
`tests/spec/sdlc-isolation/kubelet-cert-guard.bats` (Requirements REMOVED im Delta).

```bash
del_test() {  # <datei> <exakter Testname> — entfernt den @test-Block samt folgender Leerzeile
  awk -v name="$2" '
    index($0, "@test \"" name "\"") == 1 {skip=1; next}
    skip && /^}/ {skip=0; drop=1; next}
    skip {next}
    drop && /^$/ {drop=0; next}
    {drop=0; print}' "$1" > "$1.tmp" && mv "$1.tmp" "$1"
}
D=tests/spec/sdlc-isolation
git rm "$D/kubelet-cert-guard.bats"

del_test "$D/e2-local-stack.bats" "E2: Cluster config names mentolder-dev"
del_test "$D/e2-local-stack.bats" "E2 DoD: Console responds 200 on sdlc.localhost"
del_test "$D/e2-local-stack.bats" "E2 DoD: Auth without mesh — login redirect to local Pocket ID"
sed -i 's/^  kubectl get nodes --request-timeout=3s &>\/dev\/null$/  kubectl --context devmesh get nodes --request-timeout=3s \&>\/dev\/null/; s/k3d-mentolder-dev/devmesh/g' "$D/e2-local-stack.bats"

del_test "$D/sdlc-up-command.bats" "sdlc:up dry-run calls cluster:create before deploy"
del_test "$D/sdlc-up-command.bats" "sdlc:up dry-run calls deploy before proxy:start"
del_test "$D/sdlc-up-command.bats" "sdlc:down dry-run calls proxy:stop before cluster:delete"
sed -i 's/k3d-mentolder-dev/devmesh/g' "$D/sdlc-up-command.bats"
cat >> "$D/sdlc-up-command.bats" <<'EOF'

@test "sdlc:up dry-run checks the rollout before proxy:start and creates no cluster" {
  run $TASK --dry sdlc:sdlc:up
  ROLLOUT_LINE=$(echo "$output" | grep -n 'rollout status' | head -1 | cut -d: -f1)
  PROXY_LINE=$(echo "$output" | grep -n 'llm:proxy:start' | head -1 | cut -d: -f1)
  [ -n "$ROLLOUT_LINE" ]
  [ -n "$PROXY_LINE" ]
  [ "$ROLLOUT_LINE" -lt "$PROXY_LINE" ]
  hits="$(echo "$output" | grep -nE 'k3d cluster|cluster:create' || true)"
  [ -z "$hits" ]
}

@test "sdlc:down dry-run stops the proxy and deletes no cluster" {
  run $TASK --dry sdlc:sdlc:down
  echo "$output" | grep -q 'llm:proxy:stop'
  hits="$(echo "$output" | grep -nE 'k3d cluster|cluster:delete' || true)"
  [ -z "$hits" ]
}
EOF

del_test "$D/llm-up-health.bats" "sdlc:down dry-run calls llm-up.sh down before proxy:stop before cluster:delete"
sed -i 's/k3d-mentolder-dev/devmesh/g' "$D/llm-up-health.bats"
cat >> "$D/llm-up-health.bats" <<'EOF'

@test "sdlc:down dry-run calls llm-up.sh down before proxy:stop" {
  run $TASK --dry sdlc:sdlc:down
  LOADOUT_LINE=$(echo "$output" | grep -n 'llm-up.sh down' | head -1 | cut -d: -f1)
  STOP_LINE=$(echo "$output" | grep -n 'llm:proxy:stop' | head -1 | cut -d: -f1)
  [ -n "$LOADOUT_LINE" ]
  [ -n "$STOP_LINE" ]
  [ "$LOADOUT_LINE" -lt "$STOP_LINE" ]
}
EOF

sed -i 's/TICKET_CTX=k3d-mentolder-dev/TICKET_CTX=devmesh/g; s/CONTEXT=k3d-mentolder-dev/CONTEXT=devmesh/; s/erwartete dieser Test hier k3d-mentolder-dev und/erwartete dieser Test hier den lokalen k3d-Context und/' "$D/e3-tickets-lokal.bats"
sed -i 's/\[\[ "\$output" == \*"k3d-mentolder-dev"\* \]\]/[[ "$output" == *"devmesh"* ]]/' "$D/e3-backup.bats"
sed -i 's/FACTORY_CTX=k3d-mentolder-dev bash "\$POLLER"/FACTORY_CTX=fleet bash "$POLLER"/' "$D/e3-poller.bats"
grep -c 'k3d-mentolder-dev\|sdlc:cluster:' "$D"/*.bats | grep -v ':0$' || echo clean
for f in "$D"/*.bats; do tests/unit/lib/bats-core/bin/bats --count "$f" >/dev/null; done
```

### Task 6.3 — DB-Guards und Factory-/Ticket-Live-Tests (≤60 min)

Dateien: `tests/spec/db-guard/kubeconfig-drift-guard.bats`, `tests/spec/db-guard/db-identity-guard.bats`,
`tests/lib/factory-test-fixtures.sh`, `tests/spec/software-factory/_sf_common.bash`,
`tests/spec/software-factory/{merged-dispatch-gate,queue-test-data-filter,orphan-slot-reap,factory-status-lane-status-field,retry-limit,conflict-db-triage}.bats`,
`tests/spec/factory-watchdog/merged-ticket-close.bats`, `tests/spec/ticket-mcp/{phase-events-at-column,triage-projection}.bats`,
`tests/spec/ticket-system/{list-test-data-filter,list-status-comma-list,backfill-id-sequence,areas-csv-trim}.bats`,
`tests/spec/e2e-test-infrastructure/purge-test-data-missing-table.bats`, `tests/spec/local-llm-proxy.bats`

```bash
# Drift-Guard: neutraler Fixture-Name (ein devmesh-Name koennte den SP-3-Guard ausloesen)
sed -i 's/^# Hintergrund T015008: Der Context-Name `k3d-mentolder-dev` löste nach einem$/# Hintergrund T015008: Der Name des damaligen lokalen k3d-Contexts löste nach einem/; s/k3d-mentolder-dev/lab-cluster/g' tests/spec/db-guard/kubeconfig-drift-guard.bats
sed -i "s/CTX='k3d-mentolder-dev'/CTX='fleet'/g" tests/spec/db-guard/db-identity-guard.bats

sed -i 's/FACTORY_CTX:-k3d-mentolder-dev/FACTORY_CTX:-devmesh/g' \
  tests/lib/factory-test-fixtures.sh tests/spec/software-factory/_sf_common.bash \
  tests/spec/software-factory/merged-dispatch-gate.bats tests/spec/software-factory/queue-test-data-filter.bats \
  tests/spec/software-factory/orphan-slot-reap.bats tests/spec/software-factory/factory-status-lane-status-field.bats \
  tests/spec/software-factory/retry-limit.bats tests/spec/software-factory/conflict-db-triage.bats \
  tests/spec/factory-watchdog/merged-ticket-close.bats tests/spec/ticket-mcp/phase-events-at-column.bats \
  tests/spec/ticket-mcp/triage-projection.bats tests/spec/ticket-system/list-test-data-filter.bats \
  tests/spec/ticket-system/list-status-comma-list.bats tests/spec/e2e-test-infrastructure/purge-test-data-missing-table.bats \
  tests/spec/local-llm-proxy.bats
sed -i 's/^    k3d-mentolder-dev|k3d-korczewski-dev) : ;;$/    devmesh|k3d-korczewski-dev) : ;;/' tests/spec/software-factory/orphan-slot-reap.bats

# Fixtures: Test-Default fuer alle Factory-Skripte, die lib.sh sourcen; Skip vor Ticket-Writes auf devmesh
sed -i 's|^_FIXTURE_REPO_ROOT="\$(cd "\$(dirname "\${BASH_SOURCE\[0\]}")/../.." \&\& pwd)"$|&\nexport FACTORY_CTX="${FACTORY_CTX:-devmesh}"   # [T900120] Tests schreiben nie nach fleet|' tests/lib/factory-test-fixtures.sh
for fn in seed_test_feature seed_real_feature; do
  sed -i "/^${fn}() {\$/,/^}\$/ s/^  local ctx=\"\\\${FACTORY_CTX:-devmesh}\"\$/&\n  [[ \"\$ctx\" != \"devmesh\" ]] || skip \"devmesh verweigert Ticket-Writes (SP-3-Guard) — FACTORY_CTX auf eine beschreibbare Test-DB setzen\"/" tests/lib/factory-test-fixtures.sh
done
sed -i 's|^# ── File-level variables |export FACTORY_CTX="${FACTORY_CTX:-devmesh}"   # [T900120] Tests schreiben nie nach fleet\n\n&|' tests/spec/software-factory/_sf_common.bash

# backfill-id / areas-csv-trim: Ziel ueber FACTORY_CTX, devmesh = kein Schreibziel
for f in tests/spec/ticket-system/backfill-id-sequence.bats tests/spec/ticket-system/areas-csv-trim.bats; do
  sed -i 's/^  CTX="k3d-mentolder-dev"$/  CTX="${FACTORY_CTX:-devmesh}"/' "$f"
  sed -i 's/^cluster_running() {$/&\n  [[ "$CTX" != "devmesh" ]] || return 1   # [T900120] SP-3-Guard: keine Ticket-Writes auf devmesh/' "$f"
  sed -i '/cluster_running/ s/skip "\([^"]*\)"/skip "\1 (CTX=$CTX; devmesh verweigert Ticket-Writes)"/' "$f"
done

grep -n 'skip "devmesh verweigert' tests/lib/factory-test-fixtures.sh | wc -l        # 2 (Positiv-Anker der Einfuegung)
grep -n 'export FACTORY_CTX=' tests/lib/factory-test-fixtures.sh tests/spec/software-factory/_sf_common.bash   # je 1
bash -n tests/lib/factory-test-fixtures.sh && bash -n tests/spec/software-factory/_sf_common.bash
tests/unit/lib/bats-core/bin/bats tests/spec/db-guard/
```

### Task 6.4 — Übrige Testdateien und der wsl-exit-nachzug-Guard (≤30 min)

Dateien: `tests/spec/openspec-pgvector/{context-retrieve-cli,context-retrieve-recall,context-retrieve-fallback}.bats`,
`tests/spec/openspec-embedding/dynamic-port-T003077.bats`, `tests/spec/local-llm-proxy/host-listener-auth.bats`,
`tests/spec/software-factory/wsl-exit-nachzug.bats`

```bash
sed -i 's/kubectl --context k3d-mentolder-dev /kubectl --context "${OPENSPEC_DB_CTX:-fleet}" /g' tests/spec/openspec-pgvector/context-retrieve-cli.bats tests/spec/openspec-pgvector/context-retrieve-recall.bats tests/spec/openspec-pgvector/context-retrieve-fallback.bats
sed -i 's/# `kubectl --context k3d-mentolder-dev port-forward -n workspace svc\/shared-db$/# `kubectl --context fleet port-forward -n workspace svc\/shared-db/' tests/spec/openspec-embedding/dynamic-port-T003077.bats
sed -i 's/\${LLM_PROXY_K3D_NETWORK:-k3d-mentolder-dev}/${LLM_PROXY_K3D_NETWORK:-}/' tests/spec/local-llm-proxy/host-listener-auth.bats
```

`tests/spec/software-factory/wsl-exit-nachzug.bats`, Test 1 — Edit-Tool:

alt:
```bash
  run grep -c 'k3d-mentolder-dev\|k3d-korczewski-dev' "$f"
```
neu:
```bash
  run grep -c "k3d-mentolder""-dev\|k3d-korczewski-dev" "$f"
```

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/wsl-exit-nachzug.bats
```

### Task 6.5 — GREEN und Inventar (≤30 min, nach p1–p5 Teil A)

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-dev-mesh/no-k3d-context.bats tests/spec/local-dev-mesh/factory-ctx-default.bats tests/spec/local-dev-mesh/k3d-acceptance-gate.bats
tests/unit/lib/bats-core/bin/bats -r tests/spec/sdlc-isolation* tests/spec/db-guard
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/wsl-exit-nachzug.bats tests/spec/mcp-gateway/watchdog-tunnel-liveness.bats tests/spec/network-address-plan/networks-registry.bats
# expected: PASS (Live-DB-Faelle ohne erreichbaren Cluster: skip, nicht fail)
task test:inventory
git diff --stat components/website/src/data/test-inventory.json
```
