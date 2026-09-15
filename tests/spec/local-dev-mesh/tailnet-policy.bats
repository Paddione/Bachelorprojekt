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
