#!/usr/bin/env bash
# llm-stack-measure.sh — einzige Messquelle für die Zielfamilie G-LLM01..G-LLM05 [T002442]
#
# Betriebszustand des lokalen LLM-Stacks. Jedes Subkommando gibt GENAU EINEN Wert auf
# stdout aus: eine nicht-negative Ganzzahl oder `n/a`. Exit 0 auch bei `n/a` — der
# Aufrufer unterscheidet über den WERT, nicht über den Status. Nur ein unbekanntes
# Subkommando beendet mit Exit 2.
#
#   server-availability  G-LLM01  exclusiveGroups ohne erreichbares Mitglied + gruppenlose
#                                 Loadout-Ports ohne Listener
#   proxy-readiness      G-LLM02  degradierte Backends laut /health; bei ready:false der
#                                 Wert von checked
#   model-drift          G-LLM03  antwortende Loadout-Ports, deren /v1/models-ID für diesen
#                                 Port nicht geführt ist
#   autostart-coverage   G-LLM04  deklarierte LLM-Unit-Dateien ohne enabled-Zustand
#   dead-endpoints       G-LLM05  lokale Endpunkte der Backend-Registry ohne Listener
#
# POSITIV-ANKER (T002356-M1): Jedes Subkommando prüft ZUERST seine Messgrundlage und gibt
# `n/a` aus, wenn sie fehlt. Eine nicht durchgeführte Messung darf niemals als `0`
# erscheinen — `scripts/health-goals-check.sh` zählt `n/a` als übersprungen, nicht als
# erreicht. Genau dieser Fehler (leere Liste ⇒ 0 ⇒ trivial grün) war der Anlass für T002442.
#
# GEMEINSAMER HOST-ANKER (server-availability, model-drift, dead-endpoints): /livez des
# llm-proxy. Antwortet er nicht, ist die lokale LLM-Seite als Ganzes aus und die Messung
# meldet `n/a` statt einer Fehlerzahl. Bewusst /livez und nicht /health: /health beantwortet
# Readiness und meldet 503, sobald ein Prio-1-Backend tot ist — als Host-Anker gelesen würde
# ein degradierter Proxy die drei Ziele fälschlich stummschalten (T002281).
#
# KEIN `except: pass` ÜBER DEN GANZEN MESSKÖRPER: Ein Parse- oder Formfehler führt zu `n/a`,
# ein leeres Ergebnis nach erfolgreichem Parsen zu `0` — beide Fälle bleiben getrennt. Der
# Bestandsbefehl vermischte sie und deckte damit seinen eigenen AttributeError zu.
#
# Umgebungsvariablen — Overrides für Tests und Produktionsvorgaben:
#   LLM_PROXY_URL              llm-proxy-Basis-URL        (Vorgabe: http://127.0.0.1:18235)
#   LLM_MEASURE_LOADOUTS       Loadout-Registry-JSON      (Vorgabe: scripts/llm/loadouts.json)
#   LLM_MEASURE_BACKENDS_CMD   Kommando, das "name<TAB>base_url" ausgibt (Vorgabe:
#                              factory_psql-Abfrage auf tickets.llm_proxy_backends, enabled=true)
#   LLM_MEASURE_MCP_REGISTRY   MCP-Registry-Datei         (Vorgabe: docs/agent-guide/registry/mcp.yaml)
#   LLM_MEASURE_UNIT_DIRS      Unit-Verzeichnisse (":"-sep.) (Vorgabe: scripts/llm:scripts/llm-proxy)
#   LLM_MEASURE_UNIT_STATE_CMD Kommando, das für einen Unit-Namen enabled|disabled ausgibt
#                              (Vorgabe: systemctl --user is-enabled)

set -uo pipefail

LLM_PROXY_URL="${LLM_PROXY_URL:-http://127.0.0.1:18235}"
LOADOUTS="${LLM_MEASURE_LOADOUTS:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/llm/loadouts.json}"
MCP_REGISTRY="${LLM_MEASURE_MCP_REGISTRY:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/docs/agent-guide/registry/mcp.yaml}"
UNIT_DIRS="${LLM_MEASURE_UNIT_DIRS:-scripts/llm:scripts/llm-proxy}"

na() { printf 'n/a\n'; exit 0; }

# ── Gemeinsame Anker ──────────────────────────────────────────────────────────

# Host-Anker: /livez des llm-proxy muss antworten. Rückgabe 1, wenn nicht.
_host_live() {
  curl -s -m 5 -o /dev/null -w '%{http_code}' "$LLM_PROXY_URL/livez" 2>/dev/null | grep -q '^200$'
}

# ── G-LLM01 — Modellserver-Verfügbarkeit ─────────────────────────────────────
cmd_server_availability() {
  _host_live || na
  python3 - "$LOADOUTS" <<'PY' || na
import json, sys, urllib.request
path = sys.argv[1]
try:
    with open(path) as f:
        data = json.load(f)
except Exception:
    print('n/a'); sys.exit(0)
loadouts = data.get('loadouts') if isinstance(data, dict) else None
if not isinstance(loadouts, list) or not loadouts:
    print('n/a'); sys.exit(0)
# Messgrundlage: mindestens ein Eintrag mit Port.
ports = [l for l in loadouts if isinstance(l, dict) and l.get('port')]
if not ports:
    print('n/a'); sys.exit(0)

def alive(port):
    try:
        req = urllib.request.Request(f'http://127.0.0.1:{port}/health')
        return urllib.request.urlopen(req, timeout=5).status == 200
    except Exception:
        return False

# Gruppen: verfügbar, wenn mindestens ein Mitglied lebt. Gruppiert nach exclusiveGroup.
groups = {}
for l in ports:
    g = l.get('exclusiveGroup')
    groups.setdefault(g, []).append(l)

dead = 0
for g, members in groups.items():
    if g is None:
        # Gruppenlos: einzeln pro Port zählen.
        for m in members:
            if not alive(m['port']):
                dead += 1
    else:
        if not any(alive(m['port']) for m in members):
            dead += 1
print(dead)
PY
}

# ── G-LLM02 — llm-proxy-Bereitschaft ─────────────────────────────────────────
cmd_proxy_readiness() {
  python3 - "$LLM_PROXY_URL" <<'PY' || na
import json, sys, urllib.request
url = sys.argv[1]
try:
    req = urllib.request.Request(url + '/health')
    resp = urllib.request.urlopen(req, timeout=5)
    data = json.loads(resp.read())
except Exception:
    print('n/a'); sys.exit(0)
# Form-Anker: `ready`-Feld UND `checked`-Zähler ≥ 1 müssen vorhanden sein.
if not isinstance(data, dict):
    print('n/a'); sys.exit(0)
if 'ready' not in data:
    print('n/a'); sys.exit(0)
checked = data.get('checked')
if not isinstance(checked, int) or checked < 1:
    print('n/a'); sys.exit(0)
if data.get('ready') is False:
    # Nicht bereit: alle geprüften Backends können nicht dienen.
    print(checked); sys.exit(0)
degraded = data.get('degraded')
if not isinstance(degraded, list):
    print('n/a'); sys.exit(0)
print(len(degraded))
PY
}

# ── G-LLM03 — Konfig-gegen-Laufzeit-Drift (Modell-ID) ────────────────────────
cmd_model_drift() {
  _host_live || na
  python3 - "$LOADOUTS" <<'PY' || na
import json, sys, urllib.request
path = sys.argv[1]
try:
    with open(path) as f:
        data = json.load(f)
except Exception:
    print('n/a'); sys.exit(0)
loadouts = data.get('loadouts') if isinstance(data, dict) else None
if not isinstance(loadouts, list) or not loadouts:
    print('n/a'); sys.exit(0)
ports = [l for l in loadouts if isinstance(l, dict) and l.get('port')]
if not ports:
    print('n/a'); sys.exit(0)

# Pro Port die Menge der geführten Slugs und Modell-Dateinamen (ein Port kann mehrere
# Slugs tragen, z.B. 8091: gemma-factory, gemma-multiagent, gemma26-factory).
expected = {}
for l in ports:
    p = l['port']
    s = expected.setdefault(p, set())
    if l.get('slug'):
        s.add(l['slug'])
    model = l.get('model') or ''
    s.add(model.rsplit('/', 1)[-1])

def reported_id(port):
    try:
        req = urllib.request.Request(f'http://127.0.0.1:{port}/v1/models')
        resp = urllib.request.urlopen(req, timeout=5)
        d = json.loads(resp.read())
        ids = d.get('data') if isinstance(d, dict) else None
        if not isinstance(ids, list):
            return None
        return [i.get('id') for i in ids if isinstance(i, dict) and i.get('id')]
    except Exception:
        return None

drift = 0
for port, exp in expected.items():
    ids = reported_id(port)
    if ids is None:
        # Port antwortet nicht auf /v1/models — kein Drift-Fall, sondern Verfügbarkeit.
        continue
    for mid in ids:
        if mid not in exp:
            drift += 1
print(drift)
PY
}

# ── G-LLM04 — Autostart-Abdeckung ────────────────────────────────────────────
cmd_autostart_coverage() {
  local dirs units n u state
  IFS=':' read -r -a dirs <<< "$UNIT_DIRS"
  units=""
  for d in "${dirs[@]}"; do
    [ -d "$d" ] || continue
    for f in "$d"/*.service; do
      [ -f "$f" ] || continue
      units="$units $f"
    done
  done
  # Messgrundlage: mindestens eine deklarierte Unit-Datei.
  [ -n "$units" ] || na
  n=0
  for f in $units; do
    u="$(basename "$f")"
    if [ -n "${LLM_MEASURE_UNIT_STATE_CMD:-}" ]; then
      state="$($LLM_MEASURE_UNIT_STATE_CMD "$u" 2>/dev/null)"
    else
      state="$(systemctl --user is-enabled "$u" 2>/dev/null)"
    fi
    [ "$state" = "enabled" ] || n=$((n + 1))
  done
  echo "$n"
}

# ── G-LLM05 — Tote lokale Endpunkt-Verweise ──────────────────────────────────
cmd_dead_endpoints() {
  _host_live || na
  local backends mcp_ports
  if [ -n "${LLM_MEASURE_BACKENDS_CMD:-}" ]; then
    backends="$($LLM_MEASURE_BACKENDS_CMD 2>/dev/null)" || na
  else
    backends="$(factory_psql_backends 2>/dev/null)" || na
  fi
  [ -n "$backends" ] || na
  # MCP-Registry-Ports für die Familiengrenze (G-IF01 führt diese Fälle).
  mcp_ports="$(python3 - "$MCP_REGISTRY" <<'PY' 2>/dev/null || true
import re, sys
try:
    txt = open(sys.argv[1]).read()
except Exception:
    sys.exit(0)
ports = set()
for m in re.finditer(r'https?://(?:127\.0\.0\.1|localhost):(\d+)', txt):
    ports.add(int(m.group(1)))
print(' '.join(str(p) for p in ports))
PY
)"
  local n=0 line name url port
  while IFS=$'\t' read -r name url; do
    [ -n "$url" ] || continue
    case "$url" in
      http://127.0.0.1:*|http://localhost:*) ;;
      *) continue ;;  # nur lokale Endpunkte; Cluster-DNS gehört G-OPS01
    esac
    port="${url#http://127.0.0.1:}"; port="${port#http://localhost:}"
    port="${port%%/*}"
    case " $mcp_ports " in
      *" $port "*) continue ;;  # Familiengrenze: MCP-Registry-Endpunkt gehört G-IF01
    esac
    if ! curl -s -m 3 -o /dev/null "http://127.0.0.1:$port/" 2>/dev/null; then
      n=$((n + 1))
    fi
  done <<< "$backends"
  echo "$n"
}

# Backend-Registry in Produktion: factory_psql-Abfrage auf tickets.llm_proxy_backends.
factory_psql_backends() {
  local pod
  pod="$(kubectl get pod -n "${FACTORY_NS:-workspace}" --context "${FACTORY_CTX:-fleet}" \
    -l 'app in (shared-db, shared-db-dev)' --field-selector status.phase=Running \
    -o jsonpath='{.items[*].metadata.name}' 2>/dev/null | awk '{print $1}')"
  [ -n "$pod" ] || return 1
  kubectl exec -i "$pod" -n "${FACTORY_NS:-workspace}" --context "${FACTORY_CTX:-fleet}" -c postgres -- \
    psql -U website -d website -qtA -c \
    "SELECT name||E'\t'||base_url FROM tickets.llm_proxy_backends WHERE enabled = true" 2>/dev/null
}

case "${1:-}" in
  server-availability) cmd_server_availability ;;
  proxy-readiness)     cmd_proxy_readiness ;;
  model-drift)         cmd_model_drift ;;
  autostart-coverage)  cmd_autostart_coverage ;;
  dead-endpoints)      cmd_dead_endpoints ;;
  -h|--help)
    sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'
    ;;
  *)
    echo "llm-stack-measure.sh: unbekanntes Subkommando '${1:-}'" >&2
    echo "erwartet: server-availability|proxy-readiness|model-drift|autostart-coverage|dead-endpoints" >&2
    exit 2
    ;;
esac
