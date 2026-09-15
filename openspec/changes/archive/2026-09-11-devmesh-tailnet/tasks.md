---
title: "devmesh-tailnet — Implementation Plan"
ticket_id: T900116
domains: [infra, test]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# devmesh-tailnet — Implementation Plan

_Ticket: T900116_ · Programm: T900115 (ADR-008, Nachtrag 2026-09-11) · Nachfolger: T900117 (SP-2)

Ziel: Der Soll-Zustand des Entwickler-Tailnets (Peers, Tags, ACL) liegt im Repo und ist
maschinell prüfbar. `scripts/devmesh/tailnet-check.sh` meldet je devmesh-Server `direct` oder
`relay` und trennt Befund (Exit 1) von fehlender Vorbedingung (Exit 2). Die Live-Schritte
(Tailscale auf den Hosts, Tags, ACL, Abnahme) sind als Operator-Task 6 markiert und blockieren
den PR nicht.

Reihenfolge: Repo-seitige Tasks 1–5 zuerst, Operator-Task 6, Verify-Task 7.

## File Structure

| Datei | Status | Zweck |
|---|---|---|
| `devmesh/tailnet-policy.hujson` | neu | ACL-Soll: tagOwners, hosts-Alias `gpu-host`, `tag:devclient` → `tag:devmesh` tcp 22/443/6443, `tag:devmesh` ↔ `tag:devmesh`, genau eine Ausnahme `tag:devmesh` → `gpu-host:<gpu_endpoint.port>` |
| `devmesh/inventory.yaml` | neu | Peer-Inventar: `gpu_endpoint` (top level) und je Peer `name`, `role`, `tag`, `lan_ip`, `tailnet_name` |
| `scripts/devmesh/tailnet-check.sh` | neu | Prüfskript, Exit 0/1/2 |
| `tests/spec/local-dev-mesh/tailnet-policy.bats` | neu | Policy-Guard + Auth-Key-Guard |
| `tests/spec/local-dev-mesh/tailnet-check.bats` | neu | Skriptverhalten mit gestubbter Tailscale-CLI + Inventar-Szenario |
| `tests/spec/local-dev-mesh/devmesh-taskfile.bats` | neu | Task-Verdrahtung `devmesh:tailnet:check` |
| `taskfiles/Taskfile.devmesh.yml` | neu | Namespace `devmesh:` mit `tailnet:check` |
| `Taskfile.yml` | geändert | include `devmesh` |
| `docs/runbooks/devmesh-tailnet.md` | neu | Operator-Runbook (Beitritt, Tags, ACL, Abnahme) |
| `docs/agent-guide/registry/networks.yaml` | geändert | Eintrag `tailscale` beschreibt Rollen statt Geräte-IPs |
| `docs/agent-guide/maps/networks-map.md` | generiert | via `task networks:map` |
| `docs/legacy-html/verarbeitungsverzeichnis.html` | geändert | Auftragsverarbeiter Tailscale Inc. (Design D1) |
| `components/website/src/data/test-inventory.json` | generiert | via `task test:inventory` |

### S1-Budget (gemessen 2026-09-11)

```bash
# Stand: Branch feature/local-k3s-dev-mesh-T900115 @ adb9d25b5
for f in Taskfile.yml docs/agent-guide/registry/networks.yaml docs/agent-guide/maps/networks-map.md docs/legacy-html/verarbeitungsverzeichnis.html; do
  printf '%s | wc=%s | baseline=%s\n' "$f" "$(wc -l < "$f")" \
    "$(jq -r --arg k "S1:$f" '.[$k].metric // "nicht-baselined"' docs/code-quality/baseline.json)"
done
yq '.s1.limits' docs/code-quality/gates.yaml
```

| Datei | Ist (`wc -l`) | Baseline | Wirksame Schwelle | Budget |
|---|---|---|---|---|
| `Taskfile.yml` | 5597 | nicht-baselined | keine (`.yml` nicht in `s1.limits`) | nicht gated, +6 Zeilen |
| `docs/agent-guide/registry/networks.yaml` | 188 | nicht-baselined | keine (`.yaml` nicht gated) | nicht gated, ±4 Zeilen |
| `docs/agent-guide/maps/networks-map.md` | 47 | nicht-baselined | keine (`.md` nicht gated) | generiert |
| `docs/legacy-html/verarbeitungsverzeichnis.html` | 413 | nicht-baselined | keine (`.html` nicht gated) | nicht gated, +6 Zeilen |
| `scripts/devmesh/tailnet-check.sh` (neu) | 0 | nicht-baselined | `.sh` = 800 | erwartet ca. 190 Zeilen, Reserve über 600 |

Keine Datei liegt nahe an ihrer Schwelle, ein Split ist nicht nötig. S3 (Brand-Domains) ist nicht
berührt: kein Code unter `prod*/`, `fleet/` oder `components/website/src/`. S4: `scripts/*.sh`
ist wurzelgebunden und erfasst `scripts/devmesh/` nicht. Das Skript wird trotzdem aus Taskfile
und Runbook referenziert.

### Entscheidung: `taskfiles/Taskfile.devmesh.yml` schon in SP-1

Die Datei wird hier angelegt und in `Taskfile.yml` eingebunden. Der Namespace `devmesh:` ist in
ADR-008 bereits festgelegt (`task devmesh:deploy`, SP-3). SP-2 ergänzt deshalb nur Tasks in einer
bestehenden Datei, statt die Includes erneut anzufassen. Das Runbook bekommt einen stabilen
Einstieg (`task devmesh:tailnet:check`) statt eines Skriptpfads. Kosten: sechs Include-Zeilen und
eine Datei mit einem Task.

### Abgrenzung Clients

`tailnet-check.sh` pingt jeden Inventar-Eintrag mit `role: server` (Delta-Spec: „every inventory
entry with `role: server`"). Clients stehen für Tags und ACL im Inventar. Ein ausgeschalteter
Laptop ist kein Befund. Exit 0 heißt: jeder Server antwortet.

## Task 1: Policy-Soll, Inventar und Auth-Key-Guard (RED → GREEN)

**Files:** `tests/spec/local-dev-mesh/tailnet-policy.bats` (neu), `devmesh/tailnet-policy.hujson` (neu), `devmesh/inventory.yaml` (neu)

- [ ] **Step 1.1: Test schreiben.** Datei `tests/spec/local-dev-mesh/tailnet-policy.bats`:

```bash
#!/usr/bin/env bats
# tests/spec/local-dev-mesh/tailnet-policy.bats
# T900116: Tailnet-ACL-Soll (devmesh/tailnet-policy.hujson) und Auth-Key-Freiheit des Repos.
#
# Pruefmodus: Konfigurationsparse. Das Ergebnis manifestiert sich ausschliesslich in der
# versionierten Policy-Datei (Ausnahme laut tests/CLAUDE.md, Test-Resultats-Konvention):
# eingespielt wird sie vom Operator in der Admin-Konsole, eine Laufzeit im Repo gibt es nicht.
# Der Auth-Key-Guard ist ein Querschnittstest ueber git grep.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  POLICY="${REPO_ROOT}/devmesh/tailnet-policy.hujson"
  INVENTORY="${REPO_ROOT}/devmesh/inventory.yaml"
  command -v python3 >/dev/null 2>&1 || skip "python3 not installed"
  python3 -c 'import yaml' >/dev/null 2>&1 || skip "PyYAML not installed"
}

# Normalisiert HuJSON (ganzzeilige //-Kommentare, Trailing Commas) zu JSON und gibt eine
# Kennzahlenzeile aus:
#   acls=<n> grants=<n> bad=<n> ports=<p,...> mesh=<0|1> exc=<n> excdst=<d,...> gpuport=<p> alias=<0|1>
#   bad     = Ziele tag:devclient oder Wildcard (*)
#   ports   = Ports, die tag:devclient auf tag:devmesh erreicht
#   mesh    = 1, wenn tag:devmesh -> tag:devmesh:* existiert
#   exc     = Regeln mit Quelle tag:devmesh und mindestens einem Ziel ausserhalb tag:devmesh
#   excdst  = alle Ziele dieser Regeln ausserhalb tag:devmesh
#   gpuport = gpu_endpoint.port aus devmesh/inventory.yaml
#   alias   = 1, wenn hosts.gpu-host definiert ist
policy_facts() {
  python3 - "$POLICY" "$INVENTORY" <<'PY'
import json, re, sys, yaml
inv = yaml.safe_load(open(sys.argv[2])) or {}
gpu_port = str((inv.get("gpu_endpoint") or {}).get("port") or "-")
raw = open(sys.argv[1]).read()
lines = [l for l in raw.splitlines() if not l.lstrip().startswith("//")]
policy = json.loads(re.sub(r",(\s*[}\]])", r"\1", "\n".join(lines)))
acls = policy.get("acls") or []
grants = policy.get("grants") or []
bad = sum(1 for a in acls for d in a.get("dst", [])
          if d.startswith("tag:devclient") or d.startswith("*"))
ports = set()
for a in acls:
    if "tag:devclient" in a.get("src", []):
        for d in a.get("dst", []):
            if d.startswith("tag:devmesh:"):
                ports.update(d.split(":", 2)[2].split(","))
mesh = any("tag:devmesh" in a.get("src", []) and "tag:devmesh:*" in a.get("dst", [])
           for a in acls)
exc_rules = [a for a in acls if "tag:devmesh" in a.get("src", [])
             and any(not d.startswith("tag:devmesh") for d in a.get("dst", []))]
exc_dst = [d for a in exc_rules for d in a.get("dst", []) if not d.startswith("tag:devmesh")]
alias = int("gpu-host" in (policy.get("hosts") or {}))
print(f"acls={len(acls)} grants={len(grants)} bad={bad} ports={','.join(sorted(ports))} mesh={int(mesh)}"
      f" exc={len(exc_rules)} excdst={','.join(exc_dst) or '-'} gpuport={gpu_port} alias={alias}")
PY
}

@test "T900116: Policy gibt tag:devclient Zugang zu tag:devmesh auf 22, 443 und 6443" {
  [ -f "$POLICY" ] || { echo "MISSING: $POLICY"; return 1; }
  run policy_facts
  [ "$status" -eq 0 ] || { echo "Policy nicht parsebar: $output"; return 1; }
  local ports
  ports="$(printf '%s\n' "$output" | sed -nE 's/.*ports=([^ ]*).*/\1/p')"
  for p in 22 443 6443; do
    [[ ",${ports}," == *",${p},"* ]] || { echo "Port $p fehlt fuer tag:devclient -> tag:devmesh: $output"; return 1; }
  done
  printf '%s\n' "$output" | grep -qF 'mesh=1' \
    || { echo "keine Regel tag:devmesh -> tag:devmesh:*: $output"; return 1; }
}

@test "T900116: GPU-Endpunkt ist die einzige Ausnahme von tag:devmesh in einen Client" {
  run policy_facts
  [ "$status" -eq 0 ] || { echo "Policy oder Inventar nicht parsebar: $output"; return 1; }
  # Positiv-Anker: Inventar nennt einen GPU-Port, Policy definiert den Alias gpu-host.
  printf '%s\n' "$output" | grep -qE 'gpuport=[0-9]+' || { echo "gpu_endpoint.port fehlt im Inventar: $output"; return 1; }
  printf '%s\n' "$output" | grep -qF 'alias=1' || { echo "hosts.gpu-host fehlt in der Policy: $output"; return 1; }
  local gpuport
  gpuport="$(printf '%s\n' "$output" | sed -nE 's/.*gpuport=([0-9]+).*/\1/p')"
  # Genau eine Regel, genau ein Ziel: gpu-host auf dem Inventar-Port.
  printf '%s\n' "$output" | grep -qF 'exc=1 ' || { echo "erwartet genau eine Ausnahme-Regel: $output"; return 1; }
  printf '%s\n' "$output" | grep -qF "excdst=gpu-host:${gpuport} " \
    || { echo "Ausnahme-Ziel ist nicht gpu-host:${gpuport}: $output"; return 1; }
}

@test "T900116: Policy enthaelt keine Regel mit Ziel tag:devclient" {
  run policy_facts
  [ "$status" -eq 0 ] || { echo "Policy nicht parsebar: $output"; return 1; }
  # Positiv-Anker: es gibt Regeln, und die gueltige Client-Regel existiert.
  printf '%s\n' "$output" | grep -qE 'acls=[1-9]' || { echo "keine acls: $output"; return 1; }
  printf '%s\n' "$output" | grep -qE 'ports=[0-9]' || { echo "keine Client-Regel: $output"; return 1; }
  # Negativ-Aussage: kein Ziel tag:devclient, kein Wildcard-Ziel, keine grants am Guard vorbei.
  printf '%s\n' "$output" | grep -qF 'bad=0' || { echo "Regel mit Ziel tag:devclient oder *: $output"; return 1; }
  printf '%s\n' "$output" | grep -qF 'grants=0' || { echo "grants umgehen den Guard: $output"; return 1; }
}

@test "T900116: kein Tailscale-Auth-Key in versionierten Dateien" {
  local prefix="tskey" pattern fake hits
  pattern="${prefix}-(auth|api|client|scim|webhook)-[A-Za-z0-9]{6,}-[A-Za-z0-9]{16,}"
  # Positiv-Anker: das Muster erkennt einen zur Laufzeit gebauten synthetischen Key.
  fake="${prefix}-auth-kAbCdE1CNTRL-$(printf 'x%.0s' {1..24})"
  printf '%s\n' "$fake" | grep -qE "$pattern" || { echo "Muster erkennt synthetischen Key nicht"; return 1; }
  hits="$(cd "$REPO_ROOT" && git grep -lE "$pattern" -- . ':!environments/.secrets/' || true)"
  [ -z "$hits" ] || { echo "Auth-Key-Muster gefunden in: $hits"; return 1; }
}
```

- [ ] **Step 1.2: RED.** Test ausführen, Policy und Inventar existieren noch nicht.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-dev-mesh/tailnet-policy.bats
# expected: FAIL — Tests 1 bis 3 rot (MISSING devmesh/tailnet-policy.hujson bzw. Parse-Fehler,
# darunter der GPU-Ausnahme-Test). Test 4 ist schon gruen: er bewacht einen Zustand
# (kein Key im Repo), keine neue Funktion.
```

- [ ] **Step 1.2b: RED für die GPU-Ausnahme gezielt.** Nach Step 1.3 (Inventar) und vor
  Step 1.4 die Policy zunächst **ohne** `hosts`-Block und ohne die `gpu-host`-Regel anlegen, dann:

```bash
tests/unit/lib/bats-core/bin/bats -f 'GPU-Endpunkt' tests/spec/local-dev-mesh/tailnet-policy.bats
# expected: FAIL — "hosts.gpu-host fehlt in der Policy" (exc=0). Danach Step 1.4 vollstaendig.
```

- [ ] **Step 1.3: Inventar anlegen.** Datei `devmesh/inventory.yaml`:

```yaml
# devmesh/inventory.yaml — SSOT der devmesh-Peers im Tailnet (T900116, ADR-008)
#
# gpu_endpoint  GPU-Inferenz auf dem Windows-Arbeitsplatz; einziger erlaubter Pfad von
#               tag:devmesh in einen Client (devmesh/tailnet-policy.hujson, Alias gpu-host).
#               Port 1234 ist der bestehende LLM-Endpunkt.
# role: server  -> tag: "tag:devmesh"   (k3s-Hosts, SP-2 ergaenzt die k3s-Felder)
# role: client  -> tag: "tag:devclient" (Arbeitsplaetze; Tailscale laeuft im Windows-Host,
#                                         WSL sieht das Tailnet ueber networkingMode = mirrored)
# lan_ip        feste Heimnetz-Adresse; null fuer Clients mit DHCP
# tailnet_name  Geraetename im Tailnet (bei Servern per `tailscale up --hostname` gesetzt)
#
# Gelesen von scripts/devmesh/tailnet-check.sh (pingt jeden Eintrag mit role: server)
# und vom Policy-Guard tests/spec/local-dev-mesh/tailnet-policy.bats (gpu_endpoint.port).
# ws-ubuntu-1 (10.0.33.1) tritt erst in SP-5 (T900120) bei.
# Auth-Keys gehoeren NIE in diese Datei.
gpu_endpoint:
  host: pk-desktop
  port: 1234
peers:
  - name: gpu-metal
    role: server
    tag: "tag:devmesh"
    lan_ip: 10.1.0.101
    tailnet_name: gpu-metal
  - name: gpu-cluster
    role: server
    tag: "tag:devmesh"
    lan_ip: 10.10.10.2
    tailnet_name: gpu-cluster
  - name: gpu-cluster2
    role: server
    tag: "tag:devmesh"
    lan_ip: 10.10.10.3
    tailnet_name: gpu-cluster2
  - name: pk-desktop
    role: client
    tag: "tag:devclient"
    lan_ip: 10.10.0.3
    tailnet_name: pk-desktop
  - name: pk-l-1
    role: client
    tag: "tag:devclient"
    lan_ip: null
    tailnet_name: pk-l-1
  - name: pk-tablet
    role: client
    tag: "tag:devclient"
    lan_ip: null
    tailnet_name: pk-tablet
```

- [ ] **Step 1.4: Policy anlegen.** Datei `devmesh/tailnet-policy.hujson` (Kommentare nur als
  ganze Zeilen, weil der Guard so normalisiert). Der Port der `gpu-host`-Regel ist
  `gpu_endpoint.port` aus dem Inventar:

```hujson
// devmesh/tailnet-policy.hujson — Soll-Fassung der Tailnet-ACL fuer devmesh (T900116, ADR-008)
// Eingespielt vom Operator in der Admin-Konsole (Access controls), siehe
// docs/runbooks/devmesh-tailnet.md. Guard: tests/spec/local-dev-mesh/tailnet-policy.bats.
// Format-Regel fuer den Guard: Kommentare nur als ganze Zeilen, keine grants.
{
	"tagOwners": {
		"tag:devmesh":   ["autogroup:admin"],
		"tag:devclient": ["autogroup:admin"],
	},
	"hosts": {
		// Tailnet-Adresse von pk-desktop (gpu_endpoint.host in devmesh/inventory.yaml).
		"gpu-host": "100.102.71.114",
	},
	"acls": [
		// Dev-Clients erreichen die devmesh-Server auf SSH, HTTPS (Ingress) und k3s-API.
		{"action": "accept", "src": ["tag:devclient"], "dst": ["tag:devmesh:22,443,6443"]},
		// devmesh-Server untereinander vollstaendig.
		{"action": "accept", "src": ["tag:devmesh"], "dst": ["tag:devmesh:*"]},
		// Einzige Ausnahme in einen Client: GPU-Inferenz auf gpu_endpoint.port (ADR-008 Nachtrag, Punkt 1).
		{"action": "accept", "src": ["tag:devmesh"], "dst": ["gpu-host:1234"]},
		// Bewusst keine Regel mit Ziel tag:devclient oder *: kein allgemeiner Pfad in die Arbeitsplaetze.
	],
}
```

- [ ] **Step 1.5: GREEN.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-dev-mesh/tailnet-policy.bats
# expected: 4/4 ok
```

- [ ] **Step 1.6: Commit.** `feat(infra): devmesh-Tailnet-Policy, Inventar und Auth-Key-Guard [T900116]`

## Task 2: `tailnet-check.sh` für jeden Server (RED → GREEN)

**Files:** `tests/spec/local-dev-mesh/tailnet-check.bats` (neu), `scripts/devmesh/tailnet-check.sh` (neu). Liest `devmesh/inventory.yaml` aus Task 1.

- [ ] **Step 2.1: Test schreiben.** Datei `tests/spec/local-dev-mesh/tailnet-check.bats`:

```bash
#!/usr/bin/env bats
# tests/spec/local-dev-mesh/tailnet-check.bats
# T900116: scripts/devmesh/tailnet-check.sh — Pfadmeldung direct/relay und die Trennung
# Befund (Exit 1) / Vorbedingung (Exit 2); Inventar-Szenario ueber --list.
#
# Pruefmodus: Ausfuehrung. Die Tailscale-CLI ist per TAILSCALE_CLI durch einen Stub ersetzt,
# das Inventar ist synthetisch (DEVMESH_INVENTORY). Kein Test beruehrt das echte Tailnet.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  SCRIPT="${REPO_ROOT}/scripts/devmesh/tailnet-check.sh"
  TMPDIR="$(mktemp -d)"
  command -v python3 >/dev/null 2>&1 || skip "python3 not installed"
  python3 -c 'import yaml' >/dev/null 2>&1 || skip "PyYAML not installed"

  cat > "$TMPDIR/inventory.yaml" <<'EOF'
peers:
  - name: srv-a
    role: server
    tag: "tag:devmesh"
    lan_ip: 10.1.0.201
    tailnet_name: srv-a
  - name: srv-b
    role: server
    tag: "tag:devmesh"
    lan_ip: 10.10.10.201
    tailnet_name: srv-b
  - name: cli-a
    role: client
    tag: "tag:devclient"
    lan_ip: null
    tailnet_name: cli-a
EOF

  # Stub der Tailscale-CLI. Steuerung ueber Umgebungsvariablen:
  #   STUB_STATE  BackendState fuer `status --json` (Default Running)
  #   STUB_RELAY  leerzeichengetrennte Namen, die nur ueber DERP antworten
  #   STUB_DOWN   leerzeichengetrennte Namen, die gar nicht antworten
  #   STUB_CRLF   1 = Ausgabe mit CRLF wie die Windows-CLI
  # Ein DERP-only-Ping endet wie die echte CLI mit Exit 1 ("direct connection not established").
  cat > "$TMPDIR/tailscale" <<'STUB'
#!/usr/bin/env bash
echo "$*" >> "$STUB_LOG"
eol=$'\n'; [[ "${STUB_CRLF:-0}" == 1 ]] && eol=$'\r\n'
case "$1" in
  status)
    printf '{"BackendState": "%s"}%s' "${STUB_STATE:-Running}" "$eol"
    exit 0 ;;
  ping)
    target="${*: -1}"
    if [[ " ${STUB_DOWN:-} " == *" $target "* ]]; then
      printf 'timeout waiting for ping reply%s' "$eol"; exit 1
    fi
    if [[ " ${STUB_RELAY:-} " == *" $target "* ]]; then
      printf 'pong from %s (100.64.0.9) via DERP(fra) in 41ms%s' "$target" "$eol"
      printf 'direct connection not established%s' "$eol"; exit 1
    fi
    printf 'pong from %s (100.64.0.9) via 10.1.0.201:41641 in 2ms%s' "$target" "$eol"
    exit 0 ;;
esac
exit 64
STUB
  chmod +x "$TMPDIR/tailscale"
  export STUB_LOG="$TMPDIR/calls.log"
  : > "$STUB_LOG"
  export DEVMESH_INVENTORY="$TMPDIR/inventory.yaml"
  export TAILSCALE_CLI="$TMPDIR/tailscale"
}

teardown() {
  rm -rf "$TMPDIR"
}

@test "T900116: alle Server direkt erreichbar -> Exit 0, Clients werden nicht gepingt" {
  run bash "$SCRIPT"
  [ "$status" -eq 0 ] || { echo "exit=$status output=$output"; return 1; }
  # Positiv-Anker: beide Server wurden tatsaechlich gepingt.
  grep -qE '^ping .*srv-a$' "$STUB_LOG" || { echo "srv-a nie gepingt"; cat "$STUB_LOG"; return 1; }
  grep -qE '^ping .*srv-b$' "$STUB_LOG" || { echo "srv-b nie gepingt"; cat "$STUB_LOG"; return 1; }
  printf '%s\n' "$output" | grep -F 'srv-a' | grep -qF 'direct' || { echo "srv-a nicht direct: $output"; return 1; }
  local client_pings
  client_pings="$(grep -E '^ping .*cli-a$' "$STUB_LOG" || true)"
  [ -z "$client_pings" ] || { echo "Client wurde gepingt: $client_pings"; return 1; }
}

@test "T900116: Server nur ueber DERP erreichbar -> relay und Exit 0 trotz Ping-Exit 1" {
  STUB_RELAY="srv-b" run bash "$SCRIPT"
  [ "$status" -eq 0 ] || { echo "exit=$status output=$output"; return 1; }
  printf '%s\n' "$output" | grep -F 'srv-b' | grep -qF 'relay' || { echo "srv-b nicht relay: $output"; return 1; }
  printf '%s\n' "$output" | grep -F 'srv-a' | grep -qF 'direct' || { echo "srv-a nicht direct: $output"; return 1; }
}

@test "T900116: ein Server antwortet nicht -> Exit 1 und nennt ihn" {
  STUB_DOWN="srv-b" run bash "$SCRIPT"
  [ "$status" -eq 1 ] || { echo "exit=$status, erwartet 1. output=$output"; return 1; }
  printf '%s\n' "$output" | grep -F 'srv-b' | grep -qF 'unerreichbar' || { echo "srv-b nicht genannt: $output"; return 1; }
  # Positiv-Anker: der andere Server wurde weiterhin geprueft (Schleife bricht nicht ab).
  printf '%s\n' "$output" | grep -F 'srv-a' | grep -qF 'direct' || { echo "srv-a fehlt: $output"; return 1; }
}

@test "T900116: Dienst im Zustand NoState -> Exit 2, kein Peer als unerreichbar gemeldet" {
  STUB_STATE="NoState" run bash "$SCRIPT"
  [ "$status" -eq 2 ] || { echo "exit=$status, erwartet 2. output=$output"; return 1; }
  # Positiv-Anker: der Zustand wurde tatsaechlich abgefragt und wird genannt.
  grep -q '^status' "$STUB_LOG" || { echo "status nie abgefragt"; return 1; }
  printf '%s\n' "$output" | grep -qF 'NoState' || { echo "Zustand nicht genannt: $output"; return 1; }
  local pings peer_lines
  pings="$(grep '^ping' "$STUB_LOG" || true)"
  [ -z "$pings" ] || { echo "trotz NoState gepingt: $pings"; return 1; }
  peer_lines="$(printf '%s\n' "$output" | grep -F 'srv-' || true)"
  [ -z "$peer_lines" ] || { echo "Peer statt Dienstzustand gemeldet: $peer_lines"; return 1; }
}

@test "T900116: Tailscale-CLI fehlt -> Exit 2" {
  TAILSCALE_CLI="$TMPDIR/gibt-es-nicht" run bash "$SCRIPT"
  [ "$status" -eq 2 ] || { echo "exit=$status, erwartet 2. output=$output"; return 1; }
  printf '%s\n' "$output" | grep -qF 'Tailscale-CLI' || { echo "fehlende CLI nicht genannt: $output"; return 1; }
}

@test "T900116: CRLF-Ausgabe der Windows-CLI wird korrekt gelesen" {
  STUB_CRLF=1 STUB_RELAY="srv-b" run bash "$SCRIPT"
  [ "$status" -eq 0 ] || { echo "exit=$status output=$output"; return 1; }
  printf '%s\n' "$output" | grep -F 'srv-a' | grep -qF 'direct' || { echo "srv-a nicht direct: $output"; return 1; }
  printf '%s\n' "$output" | grep -F 'srv-b' | grep -qF 'relay' || { echo "srv-b nicht relay: $output"; return 1; }
}

@test "T900116: Server mit Client-Tag -> Inventar ungueltig, Exit 2 ohne Ping" {
  cat > "$TMPDIR/bad.yaml" <<'EOF'
peers:
  - name: srv-x
    role: server
    tag: "tag:devclient"
    lan_ip: 10.1.0.202
    tailnet_name: srv-x
EOF
  run bash "$SCRIPT" --inventory "$TMPDIR/bad.yaml"
  [ "$status" -eq 2 ] || { echo "exit=$status, erwartet 2. output=$output"; return 1; }
  printf '%s\n' "$output" | grep -F 'srv-x' | grep -qF 'tag:devmesh' || { echo "Tag-Fehler nicht benannt: $output"; return 1; }
  local pings
  pings="$(grep '^ping' "$STUB_LOG" || true)"
  [ -z "$pings" ] || { echo "trotz ungueltigem Inventar gepingt: $pings"; return 1; }
}

@test "T900116: echtes Inventar — Server tragen tag:devmesh, Clients tag:devclient" {
  run bash "$SCRIPT" --inventory "${REPO_ROOT}/devmesh/inventory.yaml" --list
  [ "$status" -eq 0 ] || { echo "exit=$status output=$output"; return 1; }
  local servers clients wrong
  servers="$(printf '%s\n' "$output" | awk -F'\t' '$2=="server"' | wc -l)"
  clients="$(printf '%s\n' "$output" | awk -F'\t' '$2=="client"' | wc -l)"
  # Positiv-Anker: das Inventar liefert ueberhaupt Server und Clients.
  [ "$servers" -ge 1 ] && [ "$clients" -ge 1 ] || { echo "servers=$servers clients=$clients: $output"; return 1; }
  wrong="$(printf '%s\n' "$output" | awk -F'\t' '($2=="server" && $3!="tag:devmesh") || ($2=="client" && $3!="tag:devclient")')"
  [ -z "$wrong" ] || { echo "falscher Tag: $wrong"; return 1; }
  # --list braucht keine Tailscale-CLI.
  [ ! -s "$STUB_LOG" ] || { echo "--list rief die CLI auf"; cat "$STUB_LOG"; return 1; }
}
```

- [ ] **Step 2.2: RED.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-dev-mesh/tailnet-check.bats
# expected: FAIL — 8/8 rot (scripts/devmesh/tailnet-check.sh fehlt, bash endet mit Exit 127).
```

- [ ] **Step 2.3: Skript anlegen.** Datei `scripts/devmesh/tailnet-check.sh`, danach
  `chmod +x scripts/devmesh/tailnet-check.sh`:

```bash
#!/usr/bin/env bash
# scripts/devmesh/tailnet-check.sh — T900116 (SP-1, ADR-008)
# Prueft, ob jeder devmesh-Server aus devmesh/inventory.yaml ueber das Tailnet
# antwortet, und meldet je Server den Pfad: direct (LAN/NAT-Traversal) oder relay (DERP).
#
# Usage:
#   tailnet-check.sh [--inventory <pfad>] [--list] [--help]
#
# Exit 0  jeder Server antwortet (direct oder relay)
# Exit 1  mindestens ein Server antwortet nicht (Befund, namentlich genannt)
# Exit 2  Vorbedingung fehlt: python3/PyYAML, Inventar ungueltig, Tailscale-CLI fehlt
#         oder Dienst nicht im Zustand Running. Ein gestoppter Dienst ist kein
#         "alle Peers weg" (Design D5, Muster scripts/sdlc/kubelet-cert-check.sh).
#
# Gepingt werden nur Eintraege mit role: server. Clients stehen fuer Tags und ACL im
# Inventar; ein ausgeschalteter Laptop ist kein Befund.
#
# Der Exit-Code von `tailscale ping` wird bewusst NICHT ausgewertet: mit dem Default
# --until-direct endet ein Ping, der nur ueber DERP antwortet, mit "direct connection
# not established" und Exit != 0, obwohl der Peer erreichbar ist. Massgeblich sind die
# "pong from"-Zeilen ("via DERP(...)" = relay, "via <ip>:<port>" = direct).
#
# CLI-Aufloesung (Design D2): TAILSCALE_CLI > Linux-CLI im PATH > Windows-CLI unter
# /mnt/c/Program Files/Tailscale/tailscale.exe (WSL mit mirrored networking).
# Die Windows-CLI schreibt CRLF; jede CLI-Ausgabe laeuft durch tr -d '\r'.
#
# Overrides: DEVMESH_INVENTORY, TAILSCALE_CLI, TAILNET_PING_COUNT (Default 5),
#            TAILNET_PING_TIMEOUT (Default 3s).
# Aufruf ueber Taskfile: task devmesh:tailnet:check. Runbook: docs/runbooks/devmesh-tailnet.md
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
INVENTORY="${DEVMESH_INVENTORY:-${PROJECT_DIR}/devmesh/inventory.yaml}"
PING_COUNT="${TAILNET_PING_COUNT:-5}"
PING_TIMEOUT="${TAILNET_PING_TIMEOUT:-3s}"
WIN_CLI="/mnt/c/Program Files/Tailscale/tailscale.exe"
LIST_ONLY=0

usage() {
  cat <<'EOF'
Usage: tailnet-check.sh [--inventory <pfad>] [--list] [--help]

  --inventory <pfad>  Peer-Inventar (Default: devmesh/inventory.yaml)
  --list              Inventar validieren und ausgeben, ohne Tailscale-CLI
  --help              Diese Hilfe
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --inventory) INVENTORY="${2:?--inventory braucht einen Pfad}"; shift 2 ;;
    --list)      LIST_ONLY=1; shift ;;
    --help)      usage; exit 0 ;;
    *)           echo "Unbekanntes Argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

# ── Vorbedingung: Inventar lesbar und gueltig ──────────────────────────────────
if ! command -v python3 >/dev/null 2>&1 || ! python3 -c 'import yaml' >/dev/null 2>&1; then
  echo "Vorbedingung fehlt: python3 mit PyYAML" >&2
  exit 2
fi
if [[ ! -f "$INVENTORY" ]]; then
  echo "Vorbedingung fehlt: Inventar nicht gefunden: $INVENTORY" >&2
  exit 2
fi

# Eine Zeile je Peer: name<TAB>role<TAB>tag<TAB>lan_ip<TAB>tailnet_name. Leere Werte
# werden als "-" ausgegeben, weil read mit IFS=<TAB> aufeinanderfolgende Tabs
# zusammenzieht und die Felder sonst verrutschen.
if ! PEERS="$(python3 - "$INVENTORY" <<'PY'
import sys, yaml

path = sys.argv[1]
with open(path) as f:
    data = yaml.safe_load(f) or {}

expected_tag = {"server": "tag:devmesh", "client": "tag:devclient"}
fields = ("name", "role", "tag", "lan_ip", "tailnet_name")
errors, seen = [], set()
peers = data.get("peers") or []
if not peers:
    errors.append("keine Eintraege unter 'peers'")
for i, p in enumerate(peers):
    if not isinstance(p, dict):
        errors.append(f"#{i}: Eintrag ist keine Abbildung")
        continue
    name = p.get("name") or f"#{i}"
    for key in fields:
        if key not in p:
            errors.append(f"{name}: Feld '{key}' fehlt")
    role = p.get("role")
    if role not in expected_tag:
        errors.append(f"{name}: role '{role}' ist weder server noch client")
    elif p.get("tag") != expected_tag[role]:
        errors.append(f"{name}: role {role} verlangt tag {expected_tag[role]}, gefunden {p.get('tag')}")
    if role == "server" and not p.get("lan_ip"):
        errors.append(f"{name}: Server braucht eine lan_ip")
    if not p.get("tailnet_name"):
        errors.append(f"{name}: tailnet_name ist leer")
    if name in seen:
        errors.append(f"{name}: doppelter Name")
    seen.add(name)

if errors:
    for e in errors:
        print(f"Inventar ungueltig ({path}): {e}", file=sys.stderr)
    sys.exit(2)

for p in peers:
    print("\t".join(str(p.get(k) or "-") for k in fields))
PY
)"; then
  exit 2
fi

if [[ "$LIST_ONLY" -eq 1 ]]; then
  printf '%s\n' "$PEERS"
  exit 0
fi

# ── Vorbedingung: Tailscale-CLI und Dienstzustand ─────────────────────────────
if [[ -n "${TAILSCALE_CLI:-}" ]]; then
  CLI="$TAILSCALE_CLI"
elif command -v tailscale >/dev/null 2>&1; then
  CLI="$(command -v tailscale)"
else
  CLI="$WIN_CLI"
fi
if [[ ! -x "$CLI" ]]; then
  echo "Vorbedingung fehlt: Tailscale-CLI nicht gefunden (geprueft: ${CLI})" >&2
  exit 2
fi

status_out="$("$CLI" status --json </dev/null 2>&1 | tr -d '\r' || true)"
state="$(printf '%s' "$status_out" | python3 -c '
import json, sys
try:
    print(json.load(sys.stdin).get("BackendState", ""))
except Exception:
    print("")
')"
if [[ "$state" != "Running" ]]; then
  echo "Vorbedingung fehlt: Tailscale-Dienst im Zustand '${state:-unbekannt}', erwartet 'Running' — kein Peer geprueft." >&2
  if [[ -z "$state" ]]; then
    echo "Ausgabe von 'tailscale status --json': ${status_out:0:300}" >&2
  fi
  exit 2
fi

# ── Pruefung ───────────────────────────────────────────────────────────────────
classify() {  # stdin: Ausgabe von tailscale ping -> direct | relay | unreachable
  awk '
    /^pong from / { if ($0 ~ / via DERP\(/) relay = 1; else direct = 1 }
    END { if (direct) print "direct"; else if (relay) print "relay"; else print "unreachable" }
  '
}

UNREACHABLE=()
CHECKED=0
# fd 3 statt stdin und </dev/null am Ping: die Windows-CLI laeuft ueber WSL-Interop und
# darf die Peer-Liste nicht als stdin verschlucken (Muster aus scripts/wg-mesh-sync.sh).
while IFS=$'\t' read -r -u 3 name role _tag lan_ip tailnet_name; do
  [[ "$role" == "server" ]] || continue
  CHECKED=$((CHECKED + 1))
  ping_out="$("$CLI" ping --c "$PING_COUNT" --timeout "$PING_TIMEOUT" "$tailnet_name" </dev/null 2>&1 | tr -d '\r' || true)"
  route="$(printf '%s\n' "$ping_out" | classify)"
  if [[ "$route" == "direct" || "$route" == "relay" ]]; then
    echo "OK   ${name} (${tailnet_name}, LAN ${lan_ip}): ${route}"
  else
    echo "FAIL ${name} (${tailnet_name}, LAN ${lan_ip}): unerreichbar — $(printf '%s\n' "$ping_out" | tail -1)"
    UNREACHABLE+=("$name")
  fi
done 3<<<"$PEERS"

if [[ "$CHECKED" -eq 0 ]]; then
  echo "Vorbedingung fehlt: Inventar enthaelt keinen Eintrag mit role: server" >&2
  exit 2
fi
if [[ ${#UNREACHABLE[@]} -gt 0 ]]; then
  echo "tailnet-check: ${#UNREACHABLE[@]} von ${CHECKED} Server(n) unerreichbar: ${UNREACHABLE[*]}" >&2
  exit 1
fi
echo "tailnet-check: alle ${CHECKED} Server erreichbar."
exit 0
```

- [ ] **Step 2.4: GREEN.**

```bash
chmod +x scripts/devmesh/tailnet-check.sh
tests/unit/lib/bats-core/bin/bats tests/spec/local-dev-mesh/tailnet-check.bats
# expected: 8/8 ok
bash scripts/devmesh/tailnet-check.sh --list
# expected: 6 Zeilen, drei davon role server mit tag:devmesh; Exit 0
```

- [ ] **Step 2.5: Commit.** `feat(infra): tailnet-check.sh prueft jeden devmesh-Server [T900116]`

## Task 3: Taskfile-Namespace `devmesh:` (RED → GREEN)

**Files:** `tests/spec/local-dev-mesh/devmesh-taskfile.bats` (neu), `taskfiles/Taskfile.devmesh.yml` (neu), `Taskfile.yml` (Include)

- [ ] **Step 3.1: Test schreiben.** Datei `tests/spec/local-dev-mesh/devmesh-taskfile.bats`:

```bash
#!/usr/bin/env bats
# tests/spec/local-dev-mesh/devmesh-taskfile.bats
# T900116: task devmesh:tailnet:check ist eingebunden und startet tailnet-check.sh.
#
# Pruefmodus: Ausfuehrung von `task --list` und `task --dry`. Geprueft wird formatfrei
# (grep -F ohne Anker), nicht die Darstellung der Task-Liste (tests/CLAUDE.md, T002716).

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  command -v task >/dev/null 2>&1 || skip "task not installed"
}

@test "T900116: task --list fuehrt devmesh:tailnet:check" {
  run bash -c "cd '$REPO_ROOT' && task --list 2>&1"
  [ "$status" -eq 0 ] || { echo "task --list exit=$status: $output"; return 1; }
  printf '%s\n' "$output" | grep -qF 'devmesh:tailnet:check' \
    || { echo "devmesh:tailnet:check fehlt in task --list"; return 1; }
}

@test "T900116: devmesh:tailnet:check ruft scripts/devmesh/tailnet-check.sh ueber bash auf" {
  run bash -c "cd '$REPO_ROOT' && task --dry devmesh:tailnet:check 2>&1"
  [ "$status" -eq 0 ] || { echo "task --dry exit=$status: $output"; return 1; }
  printf '%s\n' "$output" | grep -qF 'bash scripts/devmesh/tailnet-check.sh' \
    || { echo "Task startet das Skript nicht: $output"; return 1; }
}
```

- [ ] **Step 3.2: RED.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-dev-mesh/devmesh-taskfile.bats
# expected: FAIL — beide Tests rot (Namespace devmesh existiert noch nicht).
```

- [ ] **Step 3.3: Taskfile anlegen.** Datei `taskfiles/Taskfile.devmesh.yml`:

```yaml
# taskfiles/Taskfile.devmesh.yml
# ─────────────────────────────────────────────────────────────────────────────
# devmesh — lokaler k3s-Dev-Cluster auf Bare-Metal im Heimnetz (ADR-008).
# SP-1 (T900116): Tailnet-Erreichbarkeit der devmesh-Server.
# SP-2 (T900117) ergaenzt die Cluster-Tasks in diesem Namespace.
#
# Usage:
#   task devmesh:tailnet:check              # Exit 0 alle Server erreichbar, 1 Befund, 2 Vorbedingung
#   task devmesh:tailnet:check -- --list    # Inventar validieren und ausgeben, ohne Tailscale-CLI
#
# Runbook: docs/runbooks/devmesh-tailnet.md
# ─────────────────────────────────────────────────────────────────────────────
version: "3"

tasks:
  tailnet:check:
    desc: "devmesh: jeden Inventar-Server per tailscale ping pruefen und direct/relay melden (Exit 1 = Server unerreichbar, 2 = Vorbedingung fehlt)"
    cmds:
      - bash scripts/devmesh/tailnet-check.sh {{.CLI_ARGS}}
```

- [ ] **Step 3.4: Include eintragen.** In `Taskfile.yml` direkt nach dem `devcluster`-Block
  (Edit-Anker: die drei Zeilen `devcluster:` / `taskfile: ./taskfiles/Taskfile.devcluster.yml` /
  `dir: .`) einfügen:

```yaml
  # devmesh — lokaler k3s-Dev-Cluster auf Bare-Metal (ADR-008). SP-1 (T900116) bringt
  # die Tailnet-Pruefung, SP-2 (T900117) die Cluster-Tasks.
  # See Taskfile.devmesh.yml + docs/runbooks/devmesh-tailnet.md.
  devmesh:
    taskfile: ./taskfiles/Taskfile.devmesh.yml
    dir: .
```

- [ ] **Step 3.5: GREEN + Nachbar-Guards.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-dev-mesh/devmesh-taskfile.bats
# expected: 2/2 ok
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/taskfiles-dir-convention.bats tests/spec/ci-cd/taskfile-shebang-portability.bats
# expected: alle ok (Include zeigt nach taskfiles/, Skript wird ueber bash gestartet)
```

- [ ] **Step 3.6: Commit.** `feat(infra): Taskfile-Namespace devmesh mit tailnet:check [T900116]`

## Task 4: Operator-Runbook

**Files:** `docs/runbooks/devmesh-tailnet.md` (neu)

- [ ] **Step 4.1: Runbook anlegen.** Vollständiger Inhalt von `docs/runbooks/devmesh-tailnet.md`:

~~~markdown
# Runbook: devmesh-Tailnet (SP-1)

Bringt die devmesh-Server und die Dev-Clients ins Tailnet `p.korczewski` und prüft die
Erreichbarkeit. Enthält **keine** Credentials. Auth-Keys werden nie ins Repo geschrieben.

Soll-Zustand im Repo:

- `devmesh/inventory.yaml` — Peers mit Rolle, Tag, LAN-Adresse und Tailnet-Namen
- `devmesh/tailnet-policy.hujson` — ACL-Soll (Guard: `tests/spec/local-dev-mesh/tailnet-policy.bats`)
- `scripts/devmesh/tailnet-check.sh` — Prüfung, Aufruf `task devmesh:tailnet:check`

Entscheidungen: ADR-008 (Nachtrag 2026-09-11), `openspec/changes/devmesh-tailnet/design.md`.

## Rollen

| Rolle | Tag | Geräte | Zugriff |
|---|---|---|---|
| Server | `tag:devmesh` | gpu-metal (10.1.0.101), gpu-cluster (10.10.10.2), gpu-cluster2 (10.10.10.3) | untereinander vollständig |
| Client | `tag:devclient` | pk-desktop, pk-l-1, pk-tablet | auf Server tcp 22, 443, 6443 |

Kein allgemeiner Pfad von `tag:devmesh` nach `tag:devclient`. Einzige Ausnahme ist die GPU-Inferenz:
`tag:devmesh` → `gpu-host` (pk-desktop) auf `gpu_endpoint.port` aus dem Inventar (heute 1234).
`ws-ubuntu-1` tritt erst in SP-5 (T900120) bei.
k3s-Knotenverkehr läuft über das LAN, nicht über das Tailnet (SP-2).

## Vorbedingungen

1. SSH als `patrick` mit `~/.ssh/patrick_ed25519` auf alle drei Server:

   ```bash
   for h in 10.1.0.101 10.10.10.2 10.10.10.3; do
     ssh -i ~/.ssh/patrick_ed25519 -o BatchMode=yes -o ConnectTimeout=8 patrick@"$h" true \
       && echo "OK $h" || echo "FEHLT $h"
   done
   ```

   Jede Zeile muss `OK` zeigen. Fehlt eine, zuerst den SSH-Bootstrap erledigen.

2. Tailscale läuft auf PK-Desktop:

   ```bash
   "/mnt/c/Program Files/Tailscale/tailscale.exe" status --json | tr -d '\r' \
     | python3 -c 'import json,sys; print(json.load(sys.stdin)["BackendState"])'
   ```

   Erwartet: `Running`. Bei `NoState` oder `Stopped` den Tailscale-Dienst in Windows starten.

3. Admin-Rechte in der Tailscale-Admin-Konsole.

## Schritt 1: Tags in der Live-Policy anlegen

Admin-Konsole → Access controls. Den `tagOwners`-Block aus `devmesh/tailnet-policy.hujson`
übernehmen, die bestehenden `acls` **unverändert lassen**, speichern. Ohne `tagOwners` lassen sich
keine getaggten Auth-Keys erzeugen.

## Schritt 2: Server beitreten

Pro Server einen Auth-Key erzeugen (Settings → Keys → Generate auth key): Reusable aus,
Ephemeral aus, Pre-approved an, Tag `tag:devmesh`, Ablauf 1 Tag. Dann auf PK-Desktop (WSL):

```bash
host=10.1.0.101; name=gpu-metal     # danach 10.10.10.2/gpu-cluster, 10.10.10.3/gpu-cluster2
ssh -t -i ~/.ssh/patrick_ed25519 patrick@"$host" 'curl -fsSL https://tailscale.com/install.sh | sh'

umask 077; keyfile="$(mktemp -p /dev/shm ts-authkey.XXXXXX)"
read -rsp "Auth-Key fuer ${name}: " TS_KEY; echo
printf '%s' "$TS_KEY" > "$keyfile"; unset TS_KEY
scp -i ~/.ssh/patrick_ed25519 "$keyfile" patrick@"$host":.ts-authkey; rm -f "$keyfile"
ssh -t -i ~/.ssh/patrick_ed25519 patrick@"$host" \
  "chmod 600 ~/.ts-authkey; sudo tailscale up --auth-key=file:\$HOME/.ts-authkey --advertise-tags=tag:devmesh --hostname=${name}; rc=\$?; rm -f ~/.ts-authkey; exit \$rc"
```

`--hostname` setzt den Tailnet-Namen auf den Wert aus `devmesh/inventory.yaml`. Der Key liegt nur
in `/dev/shm` und kurz im Home des Servers, nie in einer Kommandozeile. Nach dem dritten Beitritt
unter Settings → Keys prüfen, dass kein Auth-Key mehr aktiv ist, und übrige widerrufen.

## Schritt 3: Clients taggen

- **PK-Desktop:** Admin-Konsole → Machines → `pk-desktop` → Edit ACL tags → `tag:devclient`.
- **PK-L-1, PK-Tablet:** Tailscale für Windows installieren und anmelden. In Machines den Namen auf
  `pk-l-1` bzw. `pk-tablet` setzen (Wert aus dem Inventar) und `tag:devclient` vergeben. In der
  WSL-Distro prüfen, dass das Tailnet sichtbar ist:

  ```bash
  grep -i networkingMode /mnt/c/Users/*/.wslconfig    # networkingMode = mirrored
  ```

Tailscale nicht zusätzlich in der WSL-Distro installieren (Design D2).

## Schritt 4: Erreichbarkeit prüfen

```bash
task devmesh:tailnet:check
```

| Exit | Bedeutung | Handlung |
|---|---|---|
| 0 | jeder Server antwortet, je Zeile `direct` oder `relay` | zu Hause müssen alle drei `direct` sein |
| 1 | mindestens ein Server antwortet nicht, er wird genannt | Server an? `ping -c1 <lan_ip>` im LAN, auf dem Server `tailscale status` |
| 2 | Vorbedingung fehlt (CLI, Dienst nicht `Running`, Inventar ungültig) | Meldung lesen, kein Server-Befund |

Abnahme zu Hause auf PK-Desktop: alle drei Server `direct`, Exit 0. Abnahme unterwegs: PK-L-1 über
einen Mobilfunk-Hotspot, alle Server `direct` oder `relay`, Exit 0. Meldet ein Server zu Hause
`relay`, blockiert vermutlich eine Firewall UDP 41641: `tailscale.exe netcheck`.

## Schritt 5: ACL einspielen

Die Repo-Policy erlaubt nur devmesh-Pfade und die `gpu-host`-Ausnahme. Sie ersetzt die Live-`acls`
erst nach einer Prüfung, weil heute andere Wege über das Tailnet laufen können. Bekannt sind
Zugriffe von Geräten außerhalb devmesh auf `pk-desktop`: LLM-Endpunkt `:1234` und
Brainstorm-Bridge `:47600`.

```bash
git grep -n "100\.102\.71\.114"      # Konsumenten der Tailnet-Adresse von pk-desktop
```

1. Live-Policy in der Admin-Konsole kopieren und mit `devmesh/tailnet-policy.hujson` vergleichen.
2. Enthält die Live-Policy Regeln außerhalb der devmesh-Pfade (z. B. den Default `*` → `*:*`) und
   nutzt ein Gerät außerhalb von devmesh (z. B. `pk-hetzner-8`) das Tailnet aktiv, **nicht
   ersetzen**. Stattdessen einen Folge-Change anlegen, der Spec und Policy um eine enge Regel
   ergänzt.
3. Sonst die Live-Policy durch den Inhalt der Repo-Datei ersetzen, speichern und Schritt 4
   wiederholen.

## Schritt 6: Heimrouter

FritzBox → Internet → Freigaben → Portfreigaben. Es darf keine Freigabe auf 10.1.0.101,
10.10.10.2 oder 10.10.10.3 zeigen. Tailscale baut nur ausgehende Verbindungen auf
(Requirement „Remote access to the SDLC surface only through the tailnet, without an inbound
port" in `openspec/specs/sdlc-isolation.md`).

## Datenschutz

Tailscale Inc. sieht Metadaten (Gerätenamen, öffentliche Schlüssel, Verbindungszeitpunkte), keine
Inhalte. Eintrag als Auftragsverarbeiter: `docs/legacy-html/verarbeitungsverzeichnis.html`.
Selbst gehostete Koordination (Headscale) bleibt Ausbaupfad.
~~~

- [ ] **Step 4.2: Referenzen prüfen.**

```bash
grep -c 'tailnet-check.sh\|devmesh:tailnet:check' docs/runbooks/devmesh-tailnet.md
# expected: Zahl > 0
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/docs-content-guards.bats
# expected: alle ok
```

- [ ] **Step 4.3: Commit.** `docs(infra): Runbook devmesh-Tailnet [T900116]`

## Task 5: Netzwerk-Registry und Verarbeitungsverzeichnis

**Files:** `docs/agent-guide/registry/networks.yaml`, `docs/agent-guide/maps/networks-map.md` (generiert), `docs/legacy-html/verarbeitungsverzeichnis.html`

- [ ] **Step 5.1: Registry-Eintrag `tailscale` ersetzen.** In
  `docs/agent-guide/registry/networks.yaml` den kompletten Eintrag `- id: tailscale` (bis vor
  `- id: docker-bridge-default`) ersetzen durch:

```yaml
  - id: tailscale
    cidr: 100.64.0.0/10
    owner: Tailnet (p.korczewski)
    purpose: >-
      NAT-durchdringendes Overlay für den Zugriff auf devmesh (ADR-008): Server mit
      tag:devmesh, Dev-Clients mit tag:devclient
    status: active
    source: >-
      Tailscale-Dienst auf den Geräten; Soll-Zustand devmesh/inventory.yaml und
      devmesh/tailnet-policy.hujson, Prüfung task devmesh:tailnet:check
    notes: >-
      Der einzige Bereich, der ohne eigenes Zutun kollisionsfrei bleibt — Tailscale
      benutzt den für Carrier-Grade-NAT reservierten Block, den sonst niemand vergibt.
      Einzelne Geräte-Adressen stehen bewusst nicht hier, weil sie sich bei einer
      Neuregistrierung ändern. k3s-Knotenverkehr läuft nicht über das Tailnet, sondern
      direkt über home-lan.
```

- [ ] **Step 5.2: Registry prüfen und Karte erzeugen.**

```bash
task networks:check
# expected: Exit 0
task networks:map
git diff --stat docs/agent-guide/maps/networks-map.md
# expected: Zeile fuer 100.64.0.0/10 nennt tag:devmesh/tag:devclient statt Geraete-IPs
```

- [ ] **Step 5.3: Auftragsverarbeiter eintragen.** In
  `docs/legacy-html/verarbeitungsverzeichnis.html` in der Tabelle unter `<h2 id="auftragsverarbeiter">`
  nach der `</tr>` der Anthropic-Zeile und vor `</tbody></table>` einfügen:

```html
<tr>
<td><strong>Tailscale Inc.</strong></td>
<td>Kanada / USA</td>
<td>Koordination des Entwickler-Tailnets für den lokalen Dev-Cluster devmesh (Gerätenamen, öffentliche WireGuard-Schlüssel, Verbindungszeitpunkte; keine Nutzinhalte, keine Kundendaten)</td>
<td>EU-Standardvertragsklauseln (SCC) gem. Art. 46 Abs. 2 lit. c DSGVO im Tailscale-Auftragsverarbeitungsvertrag</td>
</tr>
```

  `k3d/docs-content-built/` wird nicht neu gebaut. Der Docs-Build läuft über
  `.github/workflows/build-docs.yml` (Trigger `docs/**`).

- [ ] **Step 5.4: Commit.** `docs(infra): Tailnet-Registry nach Rollen, Tailscale als Auftragsverarbeiter [T900116]`

## Task 6: Operator-/Live-Abnahme (nicht vom Agenten ausgeführt)

**Status:** Operator-Task. Er blockiert weder Task 7 noch den PR. Der ausführende Agent führt
keinen dieser Schritte aus, er meldet den Stand im PR-Text.

**Vorbedingung (hart):** Die SSH-Probe aus `docs/runbooks/devmesh-tailnet.md` → „Vorbedingungen"
meldet für 10.1.0.101, 10.10.10.2 und 10.10.10.3 jeweils `OK`. Heute ist der SSH-Bootstrap als
`patrick` mit `~/.ssh/patrick_ed25519` **nicht** eingerichtet. Solange eine Zeile `FEHLT` zeigt,
bleibt dieser Task offen.

- [ ] **Step 6.1:** Runbook Schritt 1 (tagOwners live), Schritt 2 (Server beitreten) für
  gpu-metal, gpu-cluster und gpu-cluster2. ws-ubuntu-1 **nicht**.
- [ ] **Step 6.2:** Runbook Schritt 3: pk-desktop, pk-l-1 und pk-tablet mit `tag:devclient`.
- [ ] **Step 6.3:** Abnahme zu Hause auf PK-Desktop. Befehl und Ausgabe als Ticket-Kommentar an
  T900116 (Mess-Konvention):

```bash
git rev-parse --short HEAD
task devmesh:tailnet:check; echo "exit=$?"
# expected: drei Zeilen "OK ... : direct", exit=0
```

- [ ] **Step 6.4:** Abnahme unterwegs auf PK-L-1 (Mobilfunk-Hotspot), gleicher Befehl.
  Erwartet: jede Zeile `direct` oder `relay`, `exit=0`.
- [ ] **Step 6.5:** Runbook Schritt 5 (ACL einspielen mit Prüfung). Stoppt die Prüfung dort, wird
  das als Befund an T900116 kommentiert und nicht eingespielt.
- [ ] **Step 6.6:** Runbook Schritt 6: FritzBox ohne Portfreigabe auf die drei Server.
  Screenshot-freie Notiz als Ticket-Kommentar.

## Task 7: Verifikation

**Files:** keine neuen, generierte Artefakte (`components/website/src/data/test-inventory.json`, `docs/agent-guide/maps/networks-map.md`)

Voraussetzung: GNU `parallel` ist installiert. Sonst meldet `task test:changed`
„Executed 0 instead of expected N" ohne Testlauf (tests/CLAUDE.md, T900093).

- [ ] **Step 7.1: Neue Tests vollständig.**

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/local-dev-mesh
# expected: 14/14 ok (4 Policy, 8 Check, 2 Taskfile)
```

- [ ] **Step 7.2: Test-Inventar.**

```bash
task test:inventory
git diff --stat components/website/src/data/test-inventory.json
# expected: neue Eintraege mit category local-dev-mesh
```

- [ ] **Step 7.3: Pflicht-Gates.**

```bash
task test:changed
task freshness:regenerate
task freshness:check
task networks:check
bash scripts/openspec.sh validate
# expected: alle Exit 0
```

- [ ] **Step 7.4: Commit der generierten Artefakte.** `chore(infra): Test-Inventar und Netzwerkkarte regeneriert [T900116]`

## Offene Punkte

- **R1 (gelöst)** ADR-008 Nachtrag Punkt 1 (GPU-Inferenz über die Tailnet-Adresse von PK-Desktop)
  ist in Spec und Policy abgebildet: Alias `gpu-host`, genau eine Regel `tag:devmesh` →
  `gpu-host:<gpu_endpoint.port>`, bewacht vom GPU-Ausnahme-Test in Task 1.
- **R2** Ein Ersetzen der Live-ACL durch die Repo-Policy kann bestehende Tailnet-Wege von Geräten
  außerhalb devmesh kappen (pk-hetzner-8 → LLM-Endpunkt `:1234`, Brainstorm-Bridge `:47600`).
  Runbook Schritt 5 prüft das vor dem Einspielen.
- **R3** Merge schließt T900116 (Merge = Abschluss), Task 6 kann dann noch offen sein. Entweder
  den SSH-Bootstrap vor `dev-flow-execute` erledigen oder die Live-Abnahme als eigenes Ticket führen.
