# p5-tests — BATS für Guard, Migration, Render und Backup (RED)

Partial von `devmesh-dev-stack` (T900118) · Rolle: tests · depends_on: keins · läuft zuerst.

Konventionen: `tests/CLAUDE.md` (eigene Datei pro Vorgang unter `tests/spec/local-dev-mesh/`,
Output-Verifikation, Positiv-Anker vor jeder Negativ-Aussage, keine nackte `!`-Pipeline,
Runner `tests/unit/lib/bats-core/bin/bats`). Das Verzeichnis legt SP-1/SP-2 an; die vier
Dateinamen hier kollidieren nicht mit `tailnet-check.bats`, `k3s-install.bats`, `preflight.bats`.

### Task 1: `ticket-devmesh-guard.bats` (1 h)

**Files:** Create `tests/spec/local-dev-mesh/ticket-devmesh-guard.bats`

```bash
#!/usr/bin/env bats
# tests/spec/local-dev-mesh/ticket-devmesh-guard.bats — T900118
# SSOT: openspec/changes/devmesh-dev-stack/specs/local-dev-mesh.md
#       Requirement "Ticket tooling refuses devmesh as a write target"
# Pruefmodus: Output-Verifikation (T002448-M4). kubectl ist ein Stub, der jeden
# Aufruf protokolliert; `kubectl config` geht an das echte kubectl mit einer
# Fixture-Kubeconfig, damit die Server-Pruefung echte Aufloesung sieht.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  FIX="$(mktemp -d)"
  REAL_KUBECTL="$(command -v kubectl)"
  export STUB_LOG="$FIX/kubectl.log"
  : > "$STUB_LOG"
  mkdir -p "$FIX/bin"
  cat > "$FIX/bin/kubectl" <<EOF
#!/usr/bin/env bash
echo "\$*" >> "$STUB_LOG"
if [[ "\${1:-}" == "config" ]]; then exec "$REAL_KUBECTL" "\$@"; fi
case " \$* " in
  *" get pod "*) echo "pod/shared-db-0" ;;
esac
exit 0
EOF
  chmod +x "$FIX/bin/kubectl"
  export PATH="$FIX/bin:$PATH"
  export KUBECONFIG="$FIX/kubeconfig.yaml"
  cat > "$KUBECONFIG" <<'YAML'
apiVersion: v1
kind: Config
contexts:
  - {name: devmesh, context: {cluster: devmesh, user: u}}
  - {name: scratch, context: {cluster: devmesh-copy, user: u}}
  - {name: lan-srv, context: {cluster: lan-srv, user: u}}
  - {name: other, context: {cluster: other, user: u}}
clusters:
  - {name: devmesh, cluster: {server: "https://gpu-metal.example.ts.net:6443"}}
  - {name: devmesh-copy, cluster: {server: "https://gpu-metal.example.ts.net:6443"}}
  - {name: lan-srv, cluster: {server: "https://10.1.0.101:6443"}}
  - {name: other, cluster: {server: "https://10.99.0.1:6443"}}
users:
  - {name: u, user: {}}
YAML
  export DEVMESH_INVENTORY="$FIX/inventory.yaml"
  cat > "$DEVMESH_INVENTORY" <<'YAML'
peers:
  - {name: gpu-metal, role: server, lan_ip: 10.1.0.101, tailnet_name: gpu-metal}
  - {name: pk-desktop, role: client, lan_ip: 10.10.0.3, tailnet_name: pk-desktop}
YAML
}

teardown() { rm -rf "$FIX"; }

guard_names_fleet() { grep 'T900118' <<<"$output" | grep -qF 'fleet'; }
no_exec_calls() { local c; c="$(grep -E '(^| )exec ' "$STUB_LOG" || true)"; [ -z "$c" ]; }

@test "Positiv-Anker: create gegen Nicht-devmesh-Context passiert den Guard" {
  run env TICKET_CTX=other bash "$REPO_ROOT/scripts/ticket.sh" create --type chore --title x --description y
  guard="$(grep 'T900118' <<<"$output" || true)"
  [ -z "$guard" ]
  grep -qF 'config view' "$STUB_LOG"
}

@test "create mit TICKET_CTX=devmesh wird verweigert, nennt fleet, schreibt nicht" {
  run env TICKET_CTX=devmesh bash "$REPO_ROOT/scripts/ticket.sh" create --type chore --title x --description y
  [ "$status" -ne 0 ]
  guard_names_fleet
  no_exec_calls
}

@test "umbenannter Context mit devmesh-API-Server wird verweigert" {
  run env TICKET_CTX=scratch bash "$REPO_ROOT/scripts/ticket.sh" create --type chore --title x --description y
  [ "$status" -ne 0 ]
  guard_names_fleet
  no_exec_calls
}

@test "Context auf die LAN-Adresse eines Inventar-Servers wird verweigert" {
  run env TICKET_CTX=lan-srv bash "$REPO_ROOT/scripts/ticket.sh" update-status --id T900115 --status done
  [ "$status" -ne 0 ]
  guard_names_fleet
}

@test "get mit TICKET_CTX=devmesh scheitert nicht am Guard und erreicht die DB-Schicht" {
  run env TICKET_CTX=devmesh bash "$REPO_ROOT/scripts/ticket.sh" get --id T900115
  guard="$(grep 'T900118' <<<"$output" || true)"
  [ -z "$guard" ]
  grep -qE '(^| )exec ' "$STUB_LOG"
}

@test "_exec_sql: SELECT laeuft, UPDATE gegen devmesh endet mit Exit 3 ohne exec" {
  cat > "$FIX/core.sh" <<'EOF'
CTX="$1"; NS=workspace
source "$REPO_ROOT/scripts/vda/ticket/_ticket-core.sh"
_exec_sql pod/shared-db-0 <<<"$2"
EOF
  run env REPO_ROOT="$REPO_ROOT" bash "$FIX/core.sh" devmesh "SELECT 1"
  [ "$status" -eq 0 ]
  grep -qE '(^| )exec ' "$STUB_LOG"
  : > "$STUB_LOG"
  run env REPO_ROOT="$REPO_ROOT" bash "$FIX/core.sh" devmesh "UPDATE tickets.tickets SET title = 'x'"
  [ "$status" -eq 3 ]
  guard_names_fleet
  no_exec_calls
}

@test "factory_psql: SELECT laeuft, INSERT gegen devmesh wird verweigert" {
  cat > "$FIX/factory.sh" <<'EOF'
export FACTORY_CTX="$1"
source "$REPO_ROOT/scripts/factory/lib.sh"
factory_resolve_data_ns
factory_psql <<<"$2"
EOF
  run env REPO_ROOT="$REPO_ROOT" bash "$FIX/factory.sh" devmesh "SELECT count(*) FROM tickets.tickets"
  [ "$status" -eq 0 ]
  grep -qE '(^| )exec ' "$STUB_LOG"
  : > "$STUB_LOG"
  run env REPO_ROOT="$REPO_ROOT" bash "$FIX/factory.sh" devmesh "INSERT INTO tickets.factory_phase_events (ticket_id) VALUES (1)"
  [ "$status" -ne 0 ]
  guard_names_fleet
  no_exec_calls
}

@test "ticket-mcp-node: runTicket create gegen devmesh wird mit fleet-Hinweis abgewiesen" {
  command -v node >/dev/null
  cd "$REPO_ROOT"
  run env TICKET_CTX=devmesh node --input-type=module -e "
    import { runTicket } from '$REPO_ROOT/scripts/ticket-mcp-node/runner.mjs';
    runTicket(['create', '--type', 'chore', '--title', 'x', '--description', 'y'])
      .then(() => { console.log('RESOLVED'); process.exit(0); },
            (e) => { console.log(e.message); process.exit(4); });"
  [ "$status" -eq 4 ]
  guard_names_fleet
}
```

### Task 2: `migrate-from-k3d.bats` (45 min)

**Files:** Create `tests/spec/local-dev-mesh/migrate-from-k3d.bats`

```bash
#!/usr/bin/env bats
# tests/spec/local-dev-mesh/migrate-from-k3d.bats — T900118
# SSOT: specs/local-dev-mesh.md, Requirement "Migration from k3d preserves data and verifies row counts"
# Pruefmodus: Output-Verifikation mit kubectl-Stub; Zeilenzahlen kommen aus Fixture-Dateien
# counts-<context>-<db>, jeder kubectl-Aufruf landet im Protokoll.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  SCRIPT="$REPO_ROOT/scripts/devmesh/migrate-from-k3d.sh"
  FIX="$(mktemp -d)"
  export STUB_DIR="$FIX" STUB_LOG="$FIX/kubectl.log"
  export DEVMESH_DUMP_DIR="$FIX/dump" DEVMESH_MIGRATE_DBS="pocket_id website"
  mkdir -p "$DEVMESH_DUMP_DIR" "$FIX/bin"
  : > "$STUB_LOG"
  cat > "$FIX/bin/kubectl" <<'EOF'
#!/usr/bin/env bash
echo "$*" >> "$STUB_LOG"
ctx="$(sed -nE 's/.*--context[= ]([^ ]+).*/\1/p' <<<"$*")"
db="$(sed -nE 's/.* -d ([^ ]+).*/\1/p' <<<"$*")"
case " $* " in
  *" config get-contexts "*) printf 'k3d-mentolder-dev\ndevmesh\n' ;;
  *" get pod "*)             echo "pod/shared-db-0" ;;
  *" get secret "*)          cat "$STUB_DIR/enckey-$ctx" ;;
  *" exec "*)                cat "$STUB_DIR/counts-$ctx-$db" ;;
esac
EOF
  chmod +x "$FIX/bin/kubectl"
  export PATH="$FIX/bin:$PATH"
  printf 'public.users|3\npublic.oidc_clients|20\n' > "$DEVMESH_DUMP_DIR/pocket_id.counts"
  printf 'tickets.tickets|388\n' > "$DEVMESH_DUMP_DIR/website.counts"
  cp "$DEVMESH_DUMP_DIR/pocket_id.counts" "$FIX/counts-devmesh-pocket_id"
}

teardown() { rm -rf "$FIX"; }

@test "verify: gleiche Zeilenzahlen enden mit Exit 0" {
  cp "$DEVMESH_DUMP_DIR/website.counts" "$FIX/counts-devmesh-website"
  run bash "$SCRIPT" verify
  [ "$status" -eq 0 ]
  grep -F 'ok' <<<"$output" | grep -qF 'website.tickets.tickets'
}

@test "verify: abweichende Tabelle endet mit Exit 1, nennt sie und fasst die Quelle nicht an" {
  printf 'tickets.tickets|387\n' > "$FIX/counts-devmesh-website"
  run bash "$SCRIPT" verify
  grep -F 'ok' <<<"$output" | grep -qF 'pocket_id.public.users'
  [ "$status" -eq 1 ]
  grep -F 'ABWEICHUNG' <<<"$output" | grep -qF 'website.tickets.tickets'
  src_calls="$(grep -F -- '--context k3d-mentolder-dev' "$STUB_LOG" || true)"
  [ -z "$src_calls" ]
}

@test "preflight: gleicher Pocket-ID-Key besteht, abweichender endet mit Exit 1" {
  echo "a2V5LWE=" > "$FIX/enckey-k3d-mentolder-dev"
  echo "a2V5LWE=" > "$FIX/enckey-devmesh"
  run bash "$SCRIPT" preflight
  [ "$status" -eq 0 ]
  echo "a2V5LWI=" > "$FIX/enckey-devmesh"
  run bash "$SCRIPT" preflight
  [ "$status" -eq 1 ]
  grep -qF 'POCKET_ID_ENCRYPTION_KEY' <<<"$output"
}

@test "restore gegen fleet wird vor jedem kubectl-Aufruf verweigert" {
  run env DEVMESH_DST_CTX=fleet bash "$SCRIPT" restore
  [ "$status" -eq 1 ]
  grep -qF 'verweigert' <<<"$output"
  [ ! -s "$STUB_LOG" ]
}
```

### Task 3: `dev-local-render.bats` (45 min)

**Files:** Create `tests/spec/local-dev-mesh/dev-local-render.bats`

```bash
#!/usr/bin/env bats
# tests/spec/local-dev-mesh/dev-local-render.bats — T900118
# SSOT: specs/local-dev-mesh.md — Profile core/full, "Environment resolution targets devmesh",
#       "GPU inference is reached through a static endpoint"
# Pruefmodus: Ausfuehrung von scripts/devmesh/render-stack.sh und env-resolve.sh; bewertet
# wird das gerenderte Manifest (yq), nicht der Quelltext.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  RENDER="$REPO_ROOT/scripts/devmesh/render-stack.sh"
  FIX="$(mktemp -d)"
  export DEVMESH_INVENTORY="$FIX/inventory.yaml"
  printf 'gpu_endpoint:\n  peer: pk-desktop\n  address: 100.101.102.103\n  port: 18235\n' > "$DEVMESH_INVENTORY"
}

teardown() { rm -rf "$FIX"; }

render() { bash "$RENDER" "$1" > "$FIX/$1.yaml" 2> "$FIX/$1.err" || { cat "$FIX/$1.err"; return 1; }; }
deploys() { yq ea -r '[select(.kind == "Deployment") | .metadata.name] | .[]' "$FIX/$1.yaml"; }

@test "env-resolve dev liefert ENV_CONTEXT=devmesh" {
  run bash -c 'source "$1/scripts/env-resolve.sh" dev "$1/environments" && echo "ENV_CONTEXT=$ENV_CONTEXT"' _ "$REPO_ROOT"
  [ "$status" -eq 0 ]
  grep -qx 'ENV_CONTEXT=devmesh' <<<"$output"
}

@test "Profil core enthaelt die Console und keine schweren Dienste" {
  render core
  names="$(deploys core)"
  grep -qx 'sdlc-console' <<<"$names"
  grep -qx 'shared-db' <<<"$names"
  heavy="$(grep -xE 'nextcloud|collabora|spreed-signaling|vaultwarden' <<<"$names" || true)"
  [ -z "$heavy" ]
}

@test "Profil full enthaelt Nextcloud, Collabora, Talk und Vaultwarden" {
  render full
  names="$(deploys full)"
  grep -qx 'sdlc-console' <<<"$names"
  for d in nextcloud collabora spreed-signaling vaultwarden; do grep -qx "$d" <<<"$names"; done
}

@test "core: EndpointSlice traegt Inventar-Adresse und Port als Zahl, Hosts sind aufgeloest" {
  render core
  addr="$(yq ea -r 'select(.kind == "EndpointSlice" and .metadata.name == "llm-gateway-host") | .endpoints[0].addresses[0]' "$FIX/core.yaml")"
  [ "$addr" = "100.101.102.103" ]
  tag="$(yq ea -r 'select(.kind == "EndpointSlice" and .metadata.name == "llm-gateway-host") | .ports[0].port | tag' "$FIX/core.yaml")"
  [ "$tag" = "!!int" ]
  hosts="$(yq ea -r 'select(.kind == "Ingress" and .metadata.name == "devmesh-core") | .spec.rules[].host' "$FIX/core.yaml")"
  grep -qx 'web.devmesh.mentolder.de' <<<"$hosts"
  left="$(grep -oE '(^|[^$])\$\{(DEVMESH_DOMAIN|GPU_ENDPOINT_ADDRESS|GPU_ENDPOINT_PORT|POCKET_ID_DOMAIN)\}' "$FIX/core.yaml" || true)"
  [ -z "$left" ]
}

@test "gpu_endpoint ausserhalb 100.64.0.0/10 bricht mit Exit 2 ab" {
  render core
  yq -i '.gpu_endpoint.address = "10.10.0.3"' "$DEVMESH_INVENTORY"
  run bash "$RENDER" core
  [ "$status" -eq 2 ]
  grep -qF 'gpu_endpoint' <<<"$output"
}
```

### Task 4: `db-backup-retention.bats` (30 min)

**Files:** Create `tests/spec/local-dev-mesh/db-backup-retention.bats`

```bash
#!/usr/bin/env bats
# tests/spec/local-dev-mesh/db-backup-retention.bats — T900118
# SSOT: specs/local-dev-mesh.md, Requirement "The devmesh database is backed up daily"
# Pruefmodus: Ausfuehrung von scripts/devmesh/db-backup.sh gegen ein Temp-Verzeichnis,
# pg_dumpall als Stub.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  SCRIPT="$REPO_ROOT/scripts/devmesh/db-backup.sh"
  FIX="$(mktemp -d)"; D="$FIX/backup"; mkdir -p "$D" "$FIX/bin"
}

teardown() { rm -rf "$FIX"; }

seed() { local i; for i in $(seq -w 1 "$1"); do : > "$D/shared-db-202001${i}T033000Z.sql.gz"; done; }
count() { find "$D" -maxdepth 1 -name 'shared-db-*.sql.gz' | wc -l; }

@test "15 Dumps: Pruning behaelt 14, der aelteste faellt weg" {
  seed 15
  run env BACKUP_DIR="$D" RETAIN=14 bash "$SCRIPT" --prune-only
  [ "$status" -eq 0 ]
  [ -e "$D/shared-db-20200115T033000Z.sql.gz" ]
  [ "$(count)" -eq 14 ]
  [ ! -e "$D/shared-db-20200101T033000Z.sql.gz" ]
}

@test "voller Lauf schreibt einen neuen Dump und haelt 14" {
  seed 14
  printf '#!/usr/bin/env bash\necho "-- dump"\n' > "$FIX/bin/pg_dumpall"; chmod +x "$FIX/bin/pg_dumpall"
  run env PATH="$FIX/bin:$PATH" BACKUP_DIR="$D" RETAIN=14 bash "$SCRIPT"
  [ "$status" -eq 0 ]
  newest="$(find "$D" -maxdepth 1 -name 'shared-db-*.sql.gz' -printf '%f\n' | sort | tail -1)"
  gzip -dc "$D/$newest" | grep -qF -- '-- dump'
  [ "$(count)" -eq 14 ]
}

@test "scheitert pg_dumpall, bleibt kein Teil-Dump liegen und nichts wird geloescht" {
  seed 15
  printf '#!/usr/bin/env bash\nexit 1\n' > "$FIX/bin/pg_dumpall"; chmod +x "$FIX/bin/pg_dumpall"
  run env PATH="$FIX/bin:$PATH" BACKUP_DIR="$D" RETAIN=14 bash "$SCRIPT"
  [ "$status" -ne 0 ]
  [ "$(count)" -eq 15 ]
  part="$(find "$D" -name '*.part' || true)"
  [ -z "$part" ]
}
```

### Task 5: RED-Lauf (10 min)

- [ ] **Failing-Test-Step (RED).** Alle vier Dateien laufen, bevor p1–p4 implementiert sind.
  Erwartet: jede Datei meldet `not ok`. Positiv-Anker, die schon heute grün sein können
  (z. B. „create gegen Nicht-devmesh-Context"), dürfen grün sein. Rot sein müssen: jeder
  devmesh-Verweigerungstest, `ENV_CONTEXT=devmesh`, alle Render- und Backup-Tests, alle
  Migrationstests (Skripte fehlen).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-dev-mesh/ticket-devmesh-guard.bats \
  tests/spec/local-dev-mesh/migrate-from-k3d.bats \
  tests/spec/local-dev-mesh/dev-local-render.bats \
  tests/spec/local-dev-mesh/db-backup-retention.bats
# expected: FAIL (red — Guard, Migrations-, Render- und Backup-Skript fehlen)
```

Ein Verweigerungstest, der hier grün ist, ist ein Befund am Test (tests/CLAUDE.md, Spielart 3),
kein „schon erfüllt": vor p4 korrigieren.

### Task 6: Test-Inventar (10 min)

```bash
task test:inventory
git diff --stat components/website/src/data/test-inventory.json   # vier neue Dateien gelistet
```
