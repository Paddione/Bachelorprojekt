#!/usr/bin/env bash
# health-goals-measure.sh — Mess-Helfer fuer scripts/health-goals-check.sh (T900380)
#
# Ausgelagerte Funktionsdefinitionen des Ampel-Reports. Der Report selbst (row-,
# want() und die Mess-Aufrufe) bleibt in health-goals-check.sh; hier steht nur,
# WIE gemessen wird. Grund: die S1-Ratchet in docs/code-quality/baseline.json
# haelt den Checker bei 813 Zeilen, und jedes neue Ziel kostet dort zwingend eine
# row()-Zeile. Messlogik gehoert nicht in diese Budget.
#
# Wird per `source` in dieselbe Shell geladen — die Helfer teilen sich damit FAST,
# QUIET, ONLY und die unten gesetzten Namespace-Variablen mit dem Checker. Es sind
# ausschliesslich Definitionen und Variablen-Vorgaben, keine Ausfuehrung.
#
# Aufrufer: scripts/health-goals-check.sh (source, Zeile nach dem Flag-Parsing).
# Nicht eigenstaendig ausfuehrbar und nicht testbar ohne den Checker.

# ── DB-Mess-Helfer (read-only; SKIP bei --fast oder wenn Cluster/Pod nicht erreichbar) ──
DB_NS="${HG_DB_NS:-workspace}"; DB_CTX="${HG_DB_CTX:-fleet}"; PGPOD=""
_db_pod() {
  [ -n "$PGPOD" ] && { echo "$PGPOD"; return 0; }
  command -v kubectl >/dev/null 2>&1 || return 1
  PGPOD=$(kubectl get pod -n "$DB_NS" --context "$DB_CTX" --request-timeout=5s \
            -l app=shared-db -o name 2>/dev/null | head -1)
  [ -n "$PGPOD" ] && { echo "$PGPOD"; return 0; } || return 1
}
db_scalar() {
  [ "$FAST" = 1 ] && { echo "-"; return; }
  local pod; pod=$(_db_pod) || { echo "-"; return; }
  local out
  out=$(kubectl exec "$pod" -n "$DB_NS" --context "$DB_CTX" --request-timeout=15s \
          -c postgres -- psql -U website -d website -tAc "$1" 2>/dev/null) || { echo "-"; return; }
  out=$(printf '%s' "$out" | tr -d '[:space:]')
  [[ "$out" =~ ^[0-9]+$ ]] && echo "$out" || echo "-"
}
db_backup_age_h() {
  [ "$FAST" = 1 ] && { echo "-"; return; }
  command -v kubectl >/dev/null 2>&1 || { echo "-"; return; }
  local ts epoch now
  ts=$(kubectl get jobs -n "$DB_NS" --context "$DB_CTX" --request-timeout=5s \
         -o jsonpath='{range .items[?(@.status.succeeded==1)]}{.metadata.name}{" "}{.status.completionTime}{"\n"}{end}' 2>/dev/null \
       | grep -E '^db-backup' | awk '{print $2}' | sort | tail -1)
  [ -n "$ts" ] || { echo "-"; return; }
  epoch=$(date -u -d "$ts" +%s 2>/dev/null) || { echo "-"; return; }
  now=$(date -u +%s)
  echo $(( (now - epoch) / 3600 ))
}
restore_verify_age_d() { # G-DB11 — Alter des recovery-verify-status-Stempels in Tagen
  [ "$FAST" = 1 ] && { echo "-"; return; }
  command -v kubectl >/dev/null 2>&1 || { echo "-"; return; }
  local ts epoch
  ts=$(kubectl get configmap recovery-verify-status -n "$DB_NS" --context "$DB_CTX" \
         --request-timeout=5s -o jsonpath='{.data.last_success}' 2>/dev/null)
  [ -n "$ts" ] || { echo "-"; return; }
  epoch=$(date -u -d "$ts" +%s 2>/dev/null) || { echo "-"; return; }
  echo $(( ($(date -u +%s) - epoch) / 86400 ))
}

# ── Cluster-Runtime-Mess-Helfer (read-only; SKIP bei --fast oder Cluster unerreichbar) ──
OPS_CTX="${HG_OPS_CTX:-fleet}"; OPS_NS_LIST="${HG_OPS_NS:-workspace workspace-korczewski}"
ops_kubectl_count() { # $1=not_ready|restarts_24h — zählt über alle OPS-Namespaces
  [ "$FAST" = 1 ] && { echo "-"; return; }
  command -v kubectl >/dev/null 2>&1 || { echo "-"; return; }
  python3 - "$1" "$OPS_CTX" $OPS_NS_LIST <<'PY' 2>/dev/null || echo "-"
import json,subprocess,sys,datetime
mode,ctx=sys.argv[1],sys.argv[2]
now=datetime.datetime.now(datetime.timezone.utc); n=0
for ns in sys.argv[3:]:
    if ns == "workspace-korczewski" and subprocess.run(
        ["kubectl","get","kustomization","flux-korczewski","-n","flux-system","--context",ctx,"--request-timeout=5s","-o","jsonpath={.spec.suspend}"],
        capture_output=True,text=True).stdout.strip().lower() == "true": continue
    d=json.loads(subprocess.check_output(
        ["kubectl","get","pods","-n",ns,"--context",ctx,"--request-timeout=10s","-o","json"],
        stderr=subprocess.DEVNULL))
    for p in d["items"]:
        ph=p["status"].get("phase")
        cs=p["status"].get("containerStatuses",[])
        if mode=="not_ready":
            # Mishap-Rollup T012445 (#8): Job-Pods sind historische Debris, keine
            # Live-Degradation — ein durchgelaufener Cron-Job hinterlaesst Failed/
            # NotReady-Pods, die den G-OPS01-Zielwert dauerhaft aufblaehten.
            owners=p["metadata"].get("ownerReferences") or []
            if any(o.get("kind")=="Job" for o in owners): continue
            if ph=="Succeeded": continue
            if ph!="Running" or any(not c.get("ready") for c in cs): n+=1
        else:
            for c in cs:
                t=c.get("lastState",{}).get("terminated",{}).get("finishedAt")
                if t and (now-datetime.datetime.fromisoformat(t.replace('Z','+00:00'))).total_seconds()<86400: n+=1
print(n)
PY
}
tls_min_days() { # G-OPS03 — min. Restlaufzeit über beide Brand-Frontends, 1 Retry pro Host
  [ "$FAST" = 1 ] && { echo "-"; return; }
  command -v openssl >/dev/null 2>&1 || { echo "-"; return; }
  local d exp days try min=""
  for d in ${HG_TLS_HOSTS:-web.mentolder.de web.korczewski.de}; do
    exp=""
    for try in 1 2; do # Retry: Multi-A-Record-Setups antworten transient nicht (2026-07-22)
      exp=$(echo | timeout 10 openssl s_client -servername "$d" -connect "$d":443 2>/dev/null \
              | openssl x509 -enddate -noout 2>/dev/null | cut -d= -f2)
      [ -n "$exp" ] && break
    done
    [ -n "$exp" ] || { echo "-"; return; }
    days=$(( ($(date -d "$exp" +%s) - $(date +%s)) / 86400 ))
    if [ -z "$min" ] || [ "$days" -lt "$min" ]; then min=$days; fi
  done
  echo "${min:--}"
}
e2e_success_rate() { # G-E2E01 — %-Erfolgsrate der letzten 14 e2e.yml-Läufe
  [ "$FAST" = 1 ] && { echo "-"; return; }
  command -v gh >/dev/null 2>&1 || { echo "-"; return; }
  local out; out=$(gh run list --workflow e2e.yml --limit 14 --json conclusion 2>/dev/null)
  [ -n "$out" ] || { echo "-"; return; }
  echo "$out" | python3 -c "
import json,sys
r=[x['conclusion'] for x in json.load(sys.stdin) if x.get('conclusion')]
print(round(100*sum(1 for c in r if c=='success')/len(r)) if r else '-')" 2>/dev/null || echo "-"
}
runtime_measure() { # fail-closed helper; fixture paths can be injected by tests/CI
  [ "$FAST" = 1 ] && { echo "-"; return; }
  # Bash expandiert ALLE Woerter einer Anweisung, BEVOR `local` die Variablen
  # anlegt. Weder `local a=… b="${a}…"` noch `local a=… b="${!a}"` ist daher
  # moeglich: der Verweis sieht die eigene Zuweisung nicht und bricht unter
  # `set -u` mit "unbound variable" bzw. "invalid indirect expansion" ab — die
  # Messung liefert dann still nichts und das Ziel meldet "unerfuellt" (das
  # Muster aus T013916, hier real aufgetreten: T900380). Drei Anweisungen, jede
  # liest nur bereits Zugewiesenes.
  local mode="$1" args=() suffix input_var input
  suffix="${1//-/_}"; input_var="HG_${suffix^^}_INPUT"; input="${!input_var:-}"
  [ -n "$input" ] && args=(--input "$input")
  python3 scripts/lib/runtime-health-measure.py "$mode" "${args[@]}" 2>/dev/null || echo "-"
}
# ── LLM-Helfer (T002442: LLM-Stack-Betrieb) ──
# (die row-Aufrufe der G-LLM-Ziele stehen im Checker)
# Die Messlogik lebt ausschliesslich in scripts/lib/llm-stack-measure.sh — vorher standen
# dieselben Python-Bloecke doppelt (hier und in .claude/lib/goals.md) und drifteten auseinander
# (G-LLM02 las data.get('providers', []), real existiert nur 'degraded'). Beide Stellen rufen
# jetzt nur noch dieses Skript auf.
#
# Das Skript meldet `n/a`, wenn die Messgrundlage fehlt; `row` erwartet dafuer `-` und zaehlt
# den Fall als uebersprungen statt als erreicht. llm_measure uebersetzt das wie wt_measure.
llm_measure() { # <subcommand>
  local v
  v="$(bash scripts/lib/llm-stack-measure.sh "$1" 2>/dev/null)" || { echo "-"; return; }
  case "$v" in
    ''|*[!0-9]*) echo "-" ;;
    *)           echo "$v" ;;
  esac
}
# ── Worktree-Helfer (T002443: Worktree- und Session-Hygiene) ──
# (die row-Aufrufe der G-WT-Ziele stehen im Checker)
# Die Messlogik lebt ausschliesslich in scripts/lib/wt-hygiene-measure.sh. Vorher standen
# dieselben Befehle doppelt — hier und als Shell-Block in .claude/lib/goals.md — und drifteten
# auseinander. Beide Stellen rufen jetzt nur noch dieses Skript auf.
#
# Das Skript meldet `n/a`, wenn die Messgrundlage fehlt; `row` erwartet dafuer `-` und zaehlt
# den Fall als uebersprungen statt als erreicht. Genau diese Uebersetzung leistet wt_measure —
# ein leerer oder nicht-numerischer Wert darf NIE als 0 durchgehen.
wt_measure() { # <subcommand>
  local v
  v="$(bash scripts/lib/wt-hygiene-measure.sh "$1" 2>/dev/null)" || { echo "-"; return; }
  case "$v" in
    ''|*[!0-9]*) echo "-" ;;
    *)           echo "$v" ;;
  esac
}
# --- Helfer: gh-abhängige Messungen ------------------------------------------
# gh ist netzabhängig und kann hängen. Ohne Binary, ohne Auth oder bei Timeout gibt
# es SKIP statt einer Zahl.
_gh_ready() { command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; }
gh_json() { # <timeout-s> <gh-args…> — leer bei jedem Fehlschlag
  local t="$1"; shift
  _gh_ready || return 1
  timeout "$t" gh "$@" 2>/dev/null || return 1
}

# Erfolgsrate eines Workflows in % über die letzten N abgeschlossenen Läufe.
wf_success_rate() { # <workflow> <limit>
  [ "$FAST" = 1 ] && { echo "-"; return; }
  local out; out=$(gh_json 60 run list --workflow "$1" --branch main --limit "$2" \
    --json conclusion) || { echo "-"; return; }
  python3 -c "
import json,sys
try: r=[x['conclusion'] for x in json.loads(sys.argv[1]) if x.get('conclusion')]
except Exception: print('-'); raise SystemExit
print(round(100*sum(1 for c in r if c=='success')/len(r)) if r else '-')
" "$out" 2>/dev/null || echo "-"
}

# --- Helfer: Shallow-Clone-Guard für die DORA-Ziele ---------------------------
# Auf einem Shallow Clone (CI-Default) liefert git log ein abgeschnittenes Fenster.
# Eine Deployment-Frequenz aus 20 statt 200 Commits ist nicht "niedrig", sie ist
# falsch — deshalb SKIP statt einer irreführenden Zahl.
_git_full_history() { [ "$(git rev-parse --is-shallow-repository 2>/dev/null)" = "false" ]; }

dora_count() { # <since> <grep-pattern|-> — Commits auf main im Zeitfenster
  _git_full_history || { echo "-"; return; }
  local since="$1" pat="${2:--}"
  if [ "$pat" = "-" ]; then
    git log --since="$since" --first-parent --oneline main 2>/dev/null | wc -l | tr -d ' '
  else
    git log --since="$since" --first-parent --format='%s' main 2>/dev/null \
      | grep -ciE "$pat" || true
  fi
}

# --- Helfer: Kubernetes-Manifest-Audit (offline, gegen k3d/*.yaml) ------------
k8s_audit() { # <limits|readiness|security> — Deployments, denen das Feld fehlt
  python3 - "$1" <<'PY' 2>/dev/null || echo "-"
import glob, sys, yaml
what = sys.argv[1]
missing = 0
for path in sorted(glob.glob('k3d/*.yaml')):
    try:
        with open(path) as fh:
            docs = list(yaml.safe_load_all(fh))
    except Exception:
        # Ein unparsbares Manifest darf nicht als "alles in Ordnung" durchgehen.
        # Es zaehlt als Fund, damit der Fehler sichtbar wird statt zu verschwinden.
        missing += 1
        continue
    for d in docs:
        if not isinstance(d, dict) or d.get('kind') != 'Deployment':
            continue
        spec = (d.get('spec') or {}).get('template', {}).get('spec', {}) or {}
        containers = spec.get('containers') or []
        if not containers:
            missing += 1
            continue
        for c in containers:
            if what == 'limits':
                if not (c.get('resources') or {}).get('limits'):
                    missing += 1; break
            elif what == 'readiness':
                if not c.get('readinessProbe'):
                    missing += 1; break
            elif what == 'security':
                if not c.get('securityContext') and not spec.get('securityContext'):
                    missing += 1; break
print(missing)
PY
}

# --- Helfer: Exit-Code eines Kommandos als Messwert ---------------------------
# Fehlt das Werkzeug, ist der Exit-Code keine Aussage ueber das Repo — dann SKIP.
exit_code_of() { # <cmd> [args…]
  command -v "$1" >/dev/null 2>&1 || { echo "-"; return; }
  "$@" >/dev/null 2>&1; echo $?
}
exit_code_of_script() { # <script-pfad> [args…]
  [ -f "$1" ] || { echo "-"; return; }
  bash "$@" >/dev/null 2>&1; echo $?
}
# pnpm-Messung: Ausgabe ERFASSEN, dann parsen — der Exit-Code von pnpm taugt nicht
# als Fehlersignal. `pnpm outdated` endet mit gefundenen Paketen als Exit 1, unter
# `set -o pipefail` (oben) haengte der frühere Fallback-Zweig deshalb ein zweites
# Token an den bereits korrekten Wert ("3\n-") [T002648].
# Fehlendes node_modules ist legitim nicht messbar ('-', so laeuft der CI-Job).
# Ein gescheiterter Parser ist es NICHT: er meldet den Wert 99 und faellt damit
# auf, statt sich als "nichts gefunden" auszugeben.
pnpm_measure() {
  local helper="$1"; shift
  [ -d components/website/node_modules ] || { echo '-'; return; }
  local out
  out="$(cd components/website && timeout 180 pnpm "$@" 2>/dev/null)" || true
  [ -n "$out" ] || { echo '-'; return; }
  python3 "$helper" <<<"$out" || echo 99
}
