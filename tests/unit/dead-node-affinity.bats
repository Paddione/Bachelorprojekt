#!/usr/bin/env bats
# tests/unit/dead-node-affinity.bats
# SSOT: openspec/changes/deploy-dead-node-affinity/specs/fleet-operations.md
# T002699: tote Deploy-Konfiguration im mentolder-Auslieferungspfad.
#
# Pruefmodus: Ausfuehrung (T002448-M4) — `kubectl kustomize` wird ausgefuehrt und
# die GEBAUTE Ausgabe geprueft, nicht die Overlay-Quellen. Ein Scheduling-Constraint
# kann auf jeder Schicht der Wrapper-Kette entstehen; nur das Ergebnis zeigt, was
# den Cluster erreicht.
#
# WARUM tests/unit/ statt tests/spec/fleet-operations/ (Abweichung von T002416):
# Diese Datei braucht `kubectl kustomize`. Der Shard-Job, der tests/spec/ sweept,
# installiert kein kubectl — dort waere sie dauerhaft rot. Sie laeuft deshalb im
# Job `test-manifests` (der einzige mit kubectl, .github/workflows/ci.yml) und
# steht in tests/unit/.coverage-allowlist, damit der Offline-Gate sie ueberspringt.
# Praezedenzfall in derselben Allowlist: newsletter-scheduled-publish.

setup_file() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  export REPO_ROOT

  if ! command -v kubectl >/dev/null 2>&1; then
    echo "FATAL: kubectl fehlt — diese Datei gehoert in den test-manifests-Job." >&2
    return 1
  fi

  # Vier Overlays einmal bauen statt je Test. mentolder-jobs und platform werden
  # fuer den Ueberlebens-Vergleich in Block 2 gebraucht.
  for ov in prod-mentolder prod-fleet/mentolder prod-fleet/mentolder-jobs \
            prod-fleet/platform prod-fleet/korczewski; do
    out="${BATS_FILE_TMPDIR}/$(echo "$ov" | tr / _).yaml"
    if ! kubectl kustomize "${REPO_ROOT}/${ov}" --load-restrictor=LoadRestrictionsNone > "$out" 2>"${out}.err"; then
      echo "FATAL: kubectl kustomize $ov fehlgeschlagen:" >&2
      head -20 "${out}.err" >&2
      return 1
    fi
  done
}

# Zaehlt Ressourcen im gebauten Output. Dient ueberall als Positiv-Anker:
# ein leerer oder fehlgeschlagener Build darf nie als "sauber" durchgehen.
_kind_count() {
  grep -c '^kind:' "$1" || true
}

# PyYAML stolpert sonst ueber die Prometheus-Operator-CRD alertmanagerconfigs:
# sie listet '=' als gueltigen matchType, und unquotiert ist '=' der YAML-Value-Tag.
_PY_PRELUDE="
import yaml
yaml.SafeLoader.add_constructor('tag:yaml.org,2002:value', lambda l, n: l.construct_scalar(n))
def ids(p):
    s = set()
    for d in yaml.safe_load_all(open(p)):
        if isinstance(d, dict) and d.get('kind'):
            s.add((d['kind'], (d.get('metadata') or {}).get('name')))
    return s
"

@test "T002699: gebaute Brand-Manifeste nennen keinen stillgelegten Knoten" {
  local dead=(k3s-1 k3s-2 k3s-3 k3w-1 k3w-2 k3w-3)
  local failed=0

  for brand in prod-fleet_mentolder prod-fleet_korczewski; do
    local build="${BATS_FILE_TMPDIR}/${brand}.yaml"

    # Positiv-Anker: der Build hat ueberhaupt Ressourcen geliefert.
    local n; n="$(_kind_count "$build")"
    [ "$n" -gt 0 ] || { echo "FAIL: $brand baut leer ($n Ressourcen) — Vergleich waere wertlos"; return 1; }

    # Negativ-Aussage: keiner der stillgelegten Hostnamen kommt als Wert vor.
    for node in "${dead[@]}"; do
      local hits; hits="$(grep -c -- "- ${node}\$" "$build" || true)"
      if [ "$hits" -ne 0 ]; then
        echo "FAIL: $brand nennt den stillgelegten Knoten '$node' ${hits}x im gebauten Output"
        failed=1
      fi
    done
  done

  [ "$failed" -eq 0 ]
}

@test "T002699: keine Ressource wird erzeugt, nur um von allen Konsumenten verworfen zu werden" {
  local base="${BATS_FILE_TMPDIR}/prod-mentolder.yaml"
  local w1="${BATS_FILE_TMPDIR}/prod-fleet_mentolder.yaml"
  local w2="${BATS_FILE_TMPDIR}/prod-fleet_mentolder-jobs.yaml"
  local w3="${BATS_FILE_TMPDIR}/prod-fleet_platform.yaml"

  run python3 -c "
${_PY_PRELUDE}
base = ids('${base}')
# Die Vergleichsmenge umfasst DREI Konsumenten, nicht nur den Brand-Wrapper:
#  - mentolder-jobs uebernimmt alle Jobs (T002207),
#  - platform besitzt die Cluster-Singletons (ClusterIssuer, IngressClass,
#    tls-sync ClusterRole/Binding), die fleet-common im Brand-Overlay loescht.
# Ohne platform meldete dieser Test vier legitime Ressourcen als tot.
union = ids('${w1}') | ids('${w2}') | ids('${w3}')

# Positiv-Anker: beide Mengen sind gefuellt.
if not base or not union:
    print(f'ANKER-FAIL: base={len(base)} union={len(union)} — leere Menge, Vergleich wertlos')
    raise SystemExit(1)

lost = sorted(base - union)
if lost:
    print(f'{len(lost)} Ressource(n) werden erzeugt und von jedem Konsumenten verworfen:')
    for k, n in lost:
        print(f'  {k}/{n}')
    raise SystemExit(1)
print(f'OK: alle {len(base)} Basis-Ressourcen ueberleben in mindestens einem Konsumenten')
"
  [ "$status" -eq 0 ] || { echo "$output"; return 1; }
}

@test "T002699: whisper behaelt seine Fleet-Platzierung" {
  local build="${BATS_FILE_TMPDIR}/prod-fleet_mentolder.yaml"

  run python3 -c "
${_PY_PRELUDE}
fleet_cps = {'pk-hetzner-4', 'pk-hetzner-6', 'pk-hetzner-8'}
dep = None
for d in yaml.safe_load_all(open('${build}')):
    if isinstance(d, dict) and d.get('kind') == 'Deployment' \
       and (d.get('metadata') or {}).get('name') == 'whisper':
        dep = d
        break

# Positiv-Anker: das Deployment ist ueberhaupt im Build. Unterscheidet
# 'Deployment fehlt' von 'Deployment da, Affinitaet weg' — beides Fehler,
# aber nicht derselbe.
if dep is None:
    print('ANKER-FAIL: whisper-Deployment fehlt im gebauten mentolder-Output')
    raise SystemExit(1)

terms = (((dep.get('spec') or {}).get('template') or {}).get('spec') or {}) \\
    .get('affinity', {}).get('nodeAffinity', {}) \\
    .get('requiredDuringSchedulingIgnoredDuringExecution', {}) \\
    .get('nodeSelectorTerms', [])

values = set()
for t in terms:
    for expr in t.get('matchExpressions', []):
        if expr.get('key') == 'kubernetes.io/hostname' and expr.get('operator') == 'In':
            values |= set(expr.get('values', []))

if not (values & fleet_cps):
    print(f'FAIL: whisper verlangt keinen Fleet-CP-Knoten. Gefundene In-Werte: {sorted(values) or \"(keine)\"}')
    raise SystemExit(1)
print(f'OK: whisper verlangt {sorted(values & fleet_cps)}')
"
  [ "$status" -eq 0 ] || { echo "$output"; return 1; }
}
