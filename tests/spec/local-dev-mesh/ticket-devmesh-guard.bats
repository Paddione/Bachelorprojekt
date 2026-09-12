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
  run env TICKET_MCP_REPO_ROOT="$REPO_ROOT" REPO_ROOT="$REPO_ROOT" TICKET_CTX=devmesh KUBECONFIG="$KUBECONFIG" PATH="$PATH" node --input-type=module -e "
    import { runTicket } from '$REPO_ROOT/scripts/ticket-mcp-node/runner.mjs';
    try {
      await runTicket(['create', '--type', 'chore', '--title', 'x', '--description', 'y']);
      console.log('RESOLVED');
      process.exit(0);
    } catch (e) {
      console.error(e.message);
      process.exit(4);
    }"
  [ "$status" -eq 4 ]
  guard_names_fleet
}
