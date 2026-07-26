#!/usr/bin/env bash
# health-goals-check.sh — Ampel-Report für die reproduzierbaren Ziele aus .claude/lib/goals.md
#
# Prüft die als "Reproduzierbar: ✅" markierten Health-Ziele gegen ihre Targets und gibt
# einen Ampel-Report aus. Zwei Klassen:
#   GATE   — Policy-/Halte-Ziele, die grün sein MÜSSEN (Verstoß ⇒ exit 1)
#   TARGET — Reduktionsziele "in Arbeit" (zeigen Fortschritt; exit 1 nur mit --strict)
#
# Nicht abgedeckt: die als "Reproduzierbar: eingeschränkt" markierten Ziele (Shallow-Clone-
# DORA, netz-/datumsabhängige Audits, gleitende CI-Fenster, Tool-Setup-/Cluster-Checks).
# Siehe .claude/lib/goals.md → "Mess-Disziplin".
#
# Usage: bash scripts/health-goals-check.sh [--strict] [--fast] [--quiet] [--only=ID,ID]
#   --strict   auch verfehlte TARGETs ⇒ exit 1
#   --fast     überspringt langsame Checks (task env:validate, kustomize-Parse)
#   --quiet    nur die Zusammenfassung
#   --only=…   nur die genannten Ziel-IDs prüfen (kommagetrennt, z.B. --only=G-RH01,G-CQ02)
#
# HG_VALUES_FILE=<path>  wenn gesetzt, hängt jede gemessene (nicht übersprungene) Zeile als
#                        "<id> <actual> <cmp> <target>" an <path> an — Rohdaten für
#                        scripts/health-goals-update.sh, ohne dieses Skripts Report-Verhalten
#                        zu ändern.
set -uo pipefail

cd "$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "kein git-Repo" >&2; exit 2; }

STRICT=0; FAST=0; QUIET=0; ONLY=""
for a in "$@"; do case "$a" in
  --strict) STRICT=1 ;;
  --fast)   FAST=1 ;;
  --quiet)  QUIET=1 ;;
  --only=*) ONLY=",${a#*=}," ;;
  -h|--help) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
  *) echo "unbekanntes Flag: $a" >&2; exit 2 ;;
esac; done

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  C_G=$'\e[32m'; C_Y=$'\e[33m'; C_R=$'\e[31m'; C_D=$'\e[2m'; C_B=$'\e[1m'; C_X=$'\e[0m'
else C_G=; C_Y=; C_R=; C_D=; C_B=; C_X=; fi

PASS=0; OPEN=0; GATEFAIL=0; SKIP=0

# row <kind> <id> <actual> <cmp> <target> <desc...>
#   kind: gate | target ; cmp: le | ge | eq ; actual="-" ⇒ SKIP (nicht messbar)
row() {
  local kind="$1" id="$2" actual="$3" cmp="$4" target="$5"; shift 5; local desc="$*"
  if [ -n "$ONLY" ] && [[ "$ONLY" != *",$id,"* ]]; then return; fi
  local ok status icon
  if [ "$actual" = "-" ]; then
    SKIP=$((SKIP+1)); status="${C_D}SKIP${C_X}"; icon="·"
    [ "$QUIET" = 0 ] && printf "  %s %-9s %s%-22s%s %s\n" "$icon" "$id" "$C_D" "n/a" "$C_X" "$desc (nicht messbar)"
    return
  fi
  case "$cmp" in
    le) [ "$actual" -le "$target" ] && ok=1 || ok=0 ;;
    ge) [ "$actual" -ge "$target" ] && ok=1 || ok=0 ;;
    eq) [ "$actual" -eq "$target" ] && ok=1 || ok=0 ;;
    *)  ok=0 ;;
  esac
  [ -n "${HG_VALUES_FILE:-}" ] && printf '%s %s %s %s\n' "$id" "$actual" "$cmp" "$target" >> "$HG_VALUES_FILE"
  local cmpsym; case "$cmp" in le) cmpsym="≤" ;; ge) cmpsym="≥" ;; eq) cmpsym="=" ;; esac
  local valstr; valstr=$(printf "%s (Ziel %s%s)" "$actual" "$cmpsym" "$target")
  if [ "$ok" = 1 ]; then
    PASS=$((PASS+1)); icon="${C_G}✅${C_X}"
  elif [ "$kind" = gate ]; then
    GATEFAIL=$((GATEFAIL+1)); icon="${C_R}🔴${C_X}"
  else
    OPEN=$((OPEN+1)); icon="${C_Y}🟡${C_X}"
  fi
  [ "$QUIET" = 0 ] && printf "  %b %-9s %-22s %s\n" "$icon" "$id" "$valstr" "$desc"
}

# ── Mess-Helfer (alle read-only) ───────────────────────────────────────────────
n_baseline_gate() { # $1=S1|S2|S3|S4|ALL
  python3 - "$1" <<'PY' 2>/dev/null || echo "-"
import json,sys
g=sys.argv[1]; d=json.load(open('docs/code-quality/baseline.json'))
print(len(d) if g=='ALL' else sum(1 for v in d.values() if v.get('gate')==g))
PY
}
count() { grep -rEn "$1" $2 --include="*.ts" --include="*.svelte" --include="*.astro" 2>/dev/null | grep -v 'goals-data\.ts' | wc -l | tr -d ' '; }
mcp_servers() { python3 - "$1" <<'PY' 2>/dev/null || true
import json,re,sys
s=open(sys.argv[1]).read(); s=re.sub(r'^\s*//.*$','',s,flags=re.M); s=re.sub(r',(\s*[}\]])',r'\1',s)
d=json.loads(s); k='mcpServers' if 'mcpServers' in d else 'mcp'
print('\n'.join(sorted(d.get(k,{}).keys())))
PY
}

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
    d=json.loads(subprocess.check_output(
        ["kubectl","get","pods","-n",ns,"--context",ctx,"--request-timeout=10s","-o","json"],
        stderr=subprocess.DEVNULL))
    for p in d["items"]:
        ph=p["status"].get("phase")
        cs=p["status"].get("containerStatuses",[])
        if mode=="not_ready":
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

[ "$QUIET" = 0 ] && printf "%sRepository-Health — reproduzierbare Ziele (.claude/lib/goals.md)%s\n\n" "$C_B" "$C_X"

# ── GATES (müssen grün sein) ───────────────────────────────────────────────────
[ "$QUIET" = 0 ] && printf "%sGATES (Policy/Halten)%s\n" "$C_B" "$C_X"

row gate G-RH02 "$(count '@ts-ignore|@ts-expect-error' website/src)" eq 0 "TypeScript-Suppressionen"
row gate G-TEST02 "$(grep -rnE '\.only\b' website/src mentolder-web/src --include='*.test.ts' --include='*.test.tsx' --include='*.test.svelte' 2>/dev/null | wc -l | tr -d ' ')" eq 0 "Vitest .only (Suiten-Killer)"
# Target ≤4 deckt die bekannten Tooling-/Format-False-Positives ab (z.B. XXX-XXX Session-Code);
# ein echt neuer FIXME/HACK/XXX schiebt über die Schwelle → rot (kein Netto-Zuwachs).
row gate G-CQ04 "$(grep -rnE '\b(FIXME|HACK|XXX)\b' --include='*.ts' --include='*.svelte' --include='*.astro' --include='*.sh' --include='*.js' --include='*.mjs' website/src scripts tests k3d brett/src 2>/dev/null | grep -vE 'node_modules|/dist/|plan-lint.sh|plan-qa-check.sh' | wc -l | tr -d ' ')" le 4 "FIXME/HACK/XXX (kein Netto-Zuwachs)"
row gate G-DEP04 "$(c=0; for p in website/package.json brett/package.json mentolder-web/package.json mediaviewer-widget/package.json VideoVault/package.json studio-server/package.json; do [ -f "$p" ] || continue; v=$(python3 -c "import json;print((json.load(open('$p')).get('engines') or {}).get('node','MISSING'))" 2>/dev/null); [ "$v" != ">=22.13.0" ] && c=$((c+1)); done; echo $c)" eq 0 "package.json ohne engines>=22.13"
row gate G-SEC01 "$(grep -rn 'password.*=.*[^$]' k3d/*.yaml 2>/dev/null | grep -iv 'secretKeyRef\|configMapKeyRef\|valueFrom\|KEYCLOAK_ADMIN_PASSWORD\|_PASSWORD}\|getenv(' | grep -iv '^\s*#' | wc -l | tr -d ' ')" eq 0 "Hardcoded Secrets in k3d/*.yaml"
row gate G-GIT02 "$(git log --format=%s --no-merges -30 origin/main 2>/dev/null | grep -vcE '^(feat|fix|chore|docs|refactor|test|ci|build|perf|style)(\(|!|:)')" eq 0 "Non-conventional Commits (letzte 30, ohne Merge)"
if [ "$FAST" = 0 ] && command -v task >/dev/null 2>&1; then
  timeout 90 task env:validate:all >/dev/null 2>&1; row gate G-CFG01 "$?" eq 0 "env:validate:all (Schema-Drift)"
else row gate G-CFG01 "-" eq 0 "env:validate:all (--fast übersprungen)"; fi

row gate G-AGENTIC02 "$(
  python3 - <<'PY'
import re,glob,os
def norm(t):
    t=re.sub(r'\([^)]*\)','',t); t=t.replace('`','').replace('"','').replace("'","")
    return t.strip().rstrip('.').strip().lower()
def toks(s): return {norm(x) for x in s.split(',') if norm(x)}
def fm(p):
    f=re.search(r'^---\n(.*?)\n---',open(p).read(),re.S).group(1)
    d=re.search(r'description:\s*>?\s*(.*?)(?:\n[a-z_]+:|\Z)',f,re.S).group(1)
    d=' '.join(l.strip() for l in d.splitlines())
    m=re.search(r'[Tt]riggers on:\s*(.*)',d); return toks(m.group(1)) if m else set()
rows={}; seg=False
for line in open('AGENTS.md').read().splitlines():
    if re.match(r'^<summary>Claude Code Domain Agents',line): seg=True; continue
    if seg and re.match(r'^</details>',line): break
    if seg:
        m=re.match(r'\|(.*?)\|\s*`(bachelorprojekt-[a-z]+)`\s*\|\s*$',line)
        if m: rows[m.group(2)]=toks(m.group(1))
print(sum(1 for p in glob.glob('.claude/agents/*.md')
          if fm(p).symmetric_difference(rows.get(os.path.basename(p)[:-3],set()))))
PY
)" eq 0 "Agent-Routing-Tabelle ↔ Agent-Frontmatter-Drift"
row gate G-AGENTIC03 "$(
  c=0; for f in .claude/agents/*.md; do b=$(basename "$f" .md)
    nm=$(awk 'BEGIN{f=0}/^---$/{f++;next} f==1&&/^name:/{sub(/^name:[ ]*/,"");print;exit}' "$f")
    hd=$(awk 'BEGIN{f=0}/^---$/{f++;next} f==1&&/^description:/{print 1;exit}' "$f")
    { [ "$nm" = "$b" ] && [ -n "$hd" ]; } || c=$((c+1)); done; echo $c
)" eq 0 "Agent-Frontmatter (name=Dateiname + description)"
row gate G-AGENTIC04 "$(
  blk="$(awk '/^  test:changed:/{f=1} f&&/^  [a-z][a-z0-9-]*:/&&!/test:changed:/{exit} f' Taskfile.yml)"
  m=0
  echo "$blk" | grep -qE '\.claude/agents/' || m=$((m+1))
  echo "$blk" | grep -q  'AGENTS'           || m=$((m+1))
  echo "$blk" | grep -q  'agent-library'    || m=$((m+1))
  echo $m
)" eq 0 "test:changed Agents-Bucket-Erreichbarkeit"
row gate G-AGENTIC05 "$(
  files=$(ls .claude/agents/*.md | xargs -n1 basename | sed 's/\.md$//;s/^bachelorprojekt-//' | sort -u)
  routing=$(grep -oE "'bachelorprojekt-[a-z]+'" scripts/code-quality/validate.mjs | tr -d "'" | sed 's/^bachelorprojekt-//' | sort -u)
  registry=$(grep -oE '^- id: agent-[a-z]+' docs/agent-guide/registry/tools.yaml | sed 's/^- id: agent-//' | sort -u)
  echo $(( $(comm -3 <(echo "$files") <(echo "$routing") | grep -c .) + $(comm -3 <(echo "$files") <(echo "$registry") | grep -c .) ))
)" eq 0 "6-Agenten agent↔routing↔registry Cross-Reference"
row gate G-AGENTIC06 "$(
  claimed=$(grep -oE '[0-9]+ project-local skills' .claude/skills/OVERVIEW.md | head -1 | grep -oE '^[0-9]+')
  # nur getrackte SKILL.md zählen — lokal via market-cli installierte Skills sind
  # nicht projekt-relevant und dürfen das Gate nicht kippen (Präzedenz T001783)
  real=$(git ls-files -- .claude/skills | grep -c '/SKILL\.md$')
  echo $(( claimed>real ? claimed-real : real-claimed ))
)" eq 0 "OVERVIEW.md Skill-Zähler vs real (Drift, nur getrackte)"
row gate G-AGENTIC07 "$(
  c=0
  for f in $(git ls-files -- .claude/skills | grep '/SKILL\.md$'); do
    d=$(echo "$f" | sed 's#.claude/skills/##;s#/SKILL.md##'); base=$(basename "$d")
    awk 'BEGIN{f=0}/^---$/{f++;next} f==1&&/^description:/{print 1;exit}' "$f" | grep -q 1 || continue
    n=$( { grep -rl -- "$base" CLAUDE.md AGENTS.md .claude/skills/OVERVIEW.md 2>/dev/null
           grep -rl --include=SKILL.md -- "$base" .claude/skills 2>/dev/null | grep -v "$d/SKILL.md"; } | sort -u | wc -l)
    [ "$n" -eq 0 ] && c=$((c+1))
  done; echo $c
)" eq 0 "Verwaiste aktive Skills (keine Referenzquelle, nur getrackte)"
row gate G-AGENTIC08 "$(
  # Lookbehind verhindert False Positives, wenn "scripts/…" Teil eines längeren,
  # existierenden Pfads ist (z.B. .claude/skills/<name>/scripts/foo.py)
  c=0
  for p in $(grep -rhoP '(?<![A-Za-z0-9_./-])scripts/[A-Za-z0-9_./-]+\.(sh|mjs|py)' .claude/skills --include=SKILL.md | sort -u); do
    [ -f "$p" ] || c=$((c+1)); done; echo $c
)" eq 0 "Tote Script-Pfade in SKILL.md"
row gate G-AGENTIC11 "$(
  claimed=$(grep 'opencode runtime registers' CLAUDE.md | grep -oE '`[a-z][a-z0-9-]*`' | tr -d '`' | sort -u)
  actual=$(mcp_servers .opencode/opencode.jsonc)
  comm -3 <(echo "$claimed") <(echo "$actual") | grep -c .
)" eq 0 "CLAUDE.md opencode-Liste vs opencode.jsonc (sym. Diff)"
row gate G-AGENTIC12 "$(
  c=0; for s in $(mcp_servers .mcp.json); do
    grep -q -- "$s" .claude/skills/references/mcp-tool-guide.md || c=$((c+1)); done; echo $c
)" eq 0 ".mcp.json-Server undokumentiert in mcp-tool-guide"
row gate G-AGENTIC13 "$(
  reg=$( { mcp_servers .mcp.json; mcp_servers .opencode/opencode.jsonc; } | sort -u)
  refs=$(grep -rhoE 'mcp__[a-z0-9-]+__|mcp-[a-z0-9-]+_browser_' .claude/skills --include=SKILL.md \
         | sed -E 's/^mcp__//; s/__$//; s/_browser_$//' | sort -u)
  c=0; for s in $refs; do echo "$reg" | grep -qx "$s" || c=$((c+1)); done; echo $c
)" eq 0 "Tote MCP-Server-Referenzen in SKILL.md"
row gate G-AGENTIC14 "$(
  python3 - <<'PY'
import json,re
def load(p):
    s=open(p).read(); s=re.sub(r'^\s*//.*$','',s,flags=re.M); s=re.sub(r',(\s*[}\]])',r'\1',s); d=json.loads(s)
    return d['mcpServers' if 'mcpServers' in d else 'mcp']
a=load('.mcp.json'); b=load('.opencode/opencode.jsonc')
def sig(c):
    cmd=c.get('command')
    return c.get('url') or ' '.join((cmd if isinstance(cmd,list) else [cmd or ''])+c.get('args',[]))
print(sum(1 for k in set(a)&set(b) if sig(a[k])!=sig(b[k])))
PY
)" eq 0 ".mcp.json ↔ opencode Parity (gemeinsame Server)"
row gate G-AGENTIC15 "$(
  valid=$( { for f in .claude/commands/opsx/*.md; do basename "$f" .md; done
             for f in .opencode/commands/opsx-*.md; do basename "$f" .md | sed 's/^opsx-//'; done; } | sort -u)
  refs=$(grep -rhoE '/opsx[:-][a-z]+' CLAUDE.md AGENTS.md .claude/commands .opencode/commands .claude/skills --include='*.md' 2>/dev/null \
         | sed -E 's#/opsx[:-]##' | sort -u)
  c=0; for r in $refs; do echo "$valid" | grep -qx "$r" || c=$((c+1)); done; echo $c
)" eq 0 "Phantom-/opsx-Command-Referenzen"
row gate G-AGENTIC16 "$(
  m=0
  for f in .claude/commands/opsx/*.md; do
    name=$(basename "$f" .md); o=".opencode/commands/opsx-$name.md"
    [ -f "$o" ] || { m=$((m+1)); continue; }
    a=$(awk 'BEGIN{fm=0}/^---$/{fm++;next} fm>=2{print}' "$f" | sed 's#/opsx:#/opsx-#g')
    b=$(awk 'BEGIN{fm=0}/^---$/{fm++;next} fm>=2{print}' "$o" | sed 's#/opsx:#/opsx-#g')
    [ "$a" = "$b" ] || m=$((m+1))
  done; echo $m
)" eq 0 "Claude ↔ opencode Command-Sync (normalisiert)"
row gate G-AGENTIC17 "$(
  cfg=$(grep -cE '(\.claude/commands|\.opencode/commands)/\*\*/\*\.md' docs/code-quality/gates.yaml)
  orph=$(node scripts/code-quality/gates/s4-orphans.mjs 2>/dev/null | grep -cE '(^|/)(\.claude/commands|\.opencode/commands)/|commands/opsx')
  if [ "$cfg" -ge 2 ]; then echo "$orph"; else echo 99; fi
)" le 0 "Command-Orphans via S4 (Config-Guard)"

# ── Brain-Dokumentation — GATES (G-BRAIN12/13/15; 01–11 leben im brain-Repo) ──
row gate G-BRAIN12 "$(
  _wl_err=$(mktemp)
  if bash scripts/brain-ingest-worklist.sh >/dev/null 2>"$_wl_err"; then
    grep -c 'hat 0 Treffer' "$_wl_err" || true
  else echo "-"; fi
  rm -f "$_wl_err"
)" eq 0 "Brain-Manifest-Gruppen ohne Treffer (Ingest-Drift)"
row gate G-BRAIN13 "$(python3 - <<'PY' 2>/dev/null || echo "-"
import re
wf=open('.github/workflows/brain-merge-hook.yml').read()
head=wf.split('jobs:')[0]
paths=[p.strip() for p in re.findall(r'^\s+- ([^\s].*)$', head, re.M) if '/' in p or p.startswith('.claude')]
srcs=re.findall(r'brain-merge-hook\.sh \\\n\s+bachelorprojekt/(\S+)', wf)
norm=lambda p: p.replace('/**','').rstrip('/')
print(len(set(map(norm,paths)) ^ set(map(norm,srcs))))
PY
)" eq 0 "Brain-Merge-Hook-Pfad-Parität (Trigger ↔ Handler)"
row gate G-BRAIN15 "$(
  bash templates/brain/scripts/lint-frontmatter.sh templates/brain >/dev/null 2>&1 \
    && bash templates/brain/scripts/lint-wikilinks.sh templates/brain >/dev/null 2>&1; echo $?
)" eq 0 "Brain-Seed-Template-Lint (frontmatter + wikilinks) grün"

# ── DB-Gesundheit — GATES ──
row gate G-DB06 "$(db_scalar "SELECT
  (SELECT count(*) FROM tickets.ticket_plans p    WHERE p.ticket_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tickets.tickets t WHERE t.id=p.ticket_id))
+ (SELECT count(*) FROM tickets.ticket_comments c WHERE c.ticket_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tickets.tickets t WHERE t.id=c.ticket_id))
+ (SELECT count(*) FROM tickets.ticket_links l    WHERE l.from_id  IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tickets.tickets t WHERE t.id=l.from_id));")" eq 0 "Orphan-Rows (ticket_plans/comments/links → tickets)"
row gate G-DB04 "$(db_backup_age_h)" le 26 "Backup-Alter (h) seit letztem erfolgr. db-backup-Job — T001738"

# ── Cluster-Runtime — GATES (G-OPS02/03; G-OPS01 ist Prio B → TARGET unten) ──
row gate G-OPS02 "$(ops_kubectl_count restarts_24h)" le 3 "Container-Restarts <24h (fleet, beide Brand-Namespaces)"
row gate G-OPS03 "$(tls_min_days)" ge 14 "Live-TLS-Cert-Restlaufzeit (Tage, min beider Brand-Frontends)"

# ── TARGETS (Reduktionsziele in Arbeit) ────────────────────────────────────────
[ "$QUIET" = 0 ] && printf "\n%sTARGETS (Reduktion)%s\n" "$C_B" "$C_X"

row target G-CQ05 "$(grep -rnE '\bTODO\b' --include='*.ts' --include='*.svelte' --include='*.astro' --include='*.sh' --include='*.js' --include='*.mjs' website/src scripts tests k3d brett/src 2>/dev/null | grep -vE 'node_modules|/dist/|plan-lint.sh|plan-qa-check.sh|openspec.sh|openspec-validate|openspec-merge' | wc -l | tr -d ' ')" le 1 "Echte TODO-Marker (kein Netto-Zuwachs)"
row target G-RH01 "$(n_baseline_gate ALL)" le 30 "Baselined Gate-Violations gesamt"
row target G-CQ07 "$(n_baseline_gate S2)" le 0  "S2 Import-Zyklen"
row target G-CQ09 "$(n_baseline_gate S3)" le 10 "S3 hartkodierte Hostnames"
row target G-CQ10 "$(n_baseline_gate S4)" le 4  "S4 verwaiste Scripts/Manifeste"
row target G-CQ02 "$(grep -rn ': any\|<any>\|as any' website/src --include='*.ts' --include='*.svelte' --include='*.astro' 2>/dev/null | wc -l | tr -d ' ')" le 280 "explizite any-Verwendungen"
row target G-FE03 "$(grep -rEn 'console\.(error|warn)' website/src --include='*.ts' --include='*.svelte' --include='*.astro' 2>/dev/null | grep -v 'browser-logger\.ts' | grep -v 'logger\.ts' | grep -v 'error-log-store\.ts' | grep -v '\.test\.ts' | wc -l | tr -d ' ')" le 0 "rohe console.error/warn Aufrufe (exkl. browser-logger/logger/error-log-store Selbstschutz-Fallbacks, exkl. Tests) — T001299"
row target G-FE04 "$(grep -rEn 'console\.(log|debug|info)' website/src --include='*.ts' --include='*.svelte' --include='*.astro' 2>/dev/null | grep -v 'browser-logger.ts' | grep -v '\.test\.ts' | wc -l | tr -d ' ')" eq 0 "Stray console.log/debug/info"
row target G-SIZE03 "$( [ -f website/src/lib/website-db.ts ] && wc -l < website/src/lib/website-db.ts | tr -d ' ' || echo - )" le 3000 "God-File website-db.ts (Zeilen)"
row target G-SIZE02 "$(git ls-files VideoVault .opencode | grep -E '\.(ts|tsx|js|mjs|svelte|sh|py)$' | grep -v node_modules | while read -r f; do [ -L "$f" ] || echo "$f"; done | xargs wc -l 2>/dev/null | grep -v ' total$' | awk '$1>1000' | wc -l | tr -d ' ')" le 3 "Großdateien außerhalb Gate-Scope (>1000 Zeilen)"
# .codebase-memory/graph.db.zst (16.7MB, ehem. PR #2281) ist seit T001717 nicht mehr getrackt
# (lokal via `task codebase:index` regeneriert, .gitignore) — die frühere Scope-Ausschluss-Policy
# T001348 ist damit gegenstandslos, da kein >1MB-Binärartefakt mehr im Tree liegt.
row target G-GIT03 "$(git ls-files -z 2>/dev/null | xargs -0 wc -c 2>/dev/null | grep -v ' total$' | awk '$1>1048576{c++} END{print c+0}')" le 6 "Dateien >1MB (kein LFS)"
row target G-IMG01 "$(grep -rhE '^[[:space:]]*-?[[:space:]]*image:[[:space:]]+["'"'"']?[A-Za-z0-9$]' --include='*.yaml' --include='*.yml' k3d/ prod*/ 2>/dev/null | grep -v '@sha256' | grep -vE '^[[:space:]]*#' | grep -vE 'website|brett|videovault|mediaviewer-widget|mentolder-web|WEBSITE_IMAGE|STUDIO_IMAGE|STAGING_IMAGE|paddione' | sed -E 's/.*image:[[:space:]]*//; s/["'"'"']//g; s/[[:space:]]*#.*//' | sort -u | wc -l | tr -d ' ')" le 0 "ungepinnte Fremd-Images"
row target G-DOC02 "$(wc -l < CLAUDE.md | tr -d ' ')" le 200 "CLAUDE.md Zeilen"
row target G-AGENTIC01 "$(
  c=0; for a in bachelorprojekt-security bachelorprojekt-infra bachelorprojekt-db; do
    awk 'BEGIN{f=0}/^---$/{f++;next} f==1&&/^tools:/{ok=1} END{exit !ok}' .claude/agents/$a.md || c=$((c+1)); done; echo $c
)" le 0 "Ungescopte Agenten (security/infra/db ohne tools:-Feld)"
row target G-AGENTIC09 "$(
  find .claude/skills -name SKILL.md -exec wc -l {} + | awk '$2!="total"&&$1>500{c++} END{print c+0}'
)" le 0 "SKILL.md >500 Zeilen"
row target G-AGENTIC10 "$(
  c=0; for a in bachelorprojekt-website bachelorprojekt-ops bachelorprojekt-infra bachelorprojekt-test bachelorprojekt-db bachelorprojekt-security; do
    grep -rlE "^agent:[[:space:]]*$a" .claude/skills --include=SKILL.md >/dev/null 2>&1 || c=$((c+1)); done; echo $c
)" le 0 "Agenten ohne dispatchende Skill (website/db/security)"
row target G-DOC03 "$(c=0; for d in website brett scripts tests k3d; do ls "$d"/README* >/dev/null 2>&1 && c=$((c+1)); done; echo $c)" ge 5 "README-Index Hauptverzeichnisse"
row target G-SEC05 "$(git log -50 --pretty='%G? %ae' main 2>/dev/null | grep -vE '(41898282\+)?github-actions\[bot\]@users\.noreply\.github\.com' | awk '{print $1}' | grep -c N || true)" le 2 "unsignierte Commits (letzte 50; adjusted: ohne freshness-Bot)"

# G-TEST05 — Vitest Line-Coverage (website/src/lib ≥ 60 %)
if [ "$FAST" = 0 ] && command -v pnpm >/dev/null 2>&1; then
  (cd website && pnpm exec vitest run --coverage --testTimeout=10000 2>/dev/null) >/dev/null 2>&1
  _cov_pct=$(jq -r '.total.lines.pct // empty' website/coverage/coverage-summary.json 2>/dev/null || echo "-")
  _cov_int=$(echo "$_cov_pct" | awk -F'.' '{if ($1~/^[0-9]+$/) print int($1); else print "-"}')
  row target G-TEST05 "$_cov_int" ge 60 "Vitest Line-Coverage website/src/lib"
else
  row target G-TEST05 "-" ge 60 "Vitest Line-Coverage website/src/lib (--fast übersprungen)"
fi

# ── DB-Gesundheit — TARGETS ──
row target G-DB01 "$(db_scalar "WITH fk AS (
    SELECT c.conrelid AS relid, c.conkey[1] AS col FROM pg_constraint c
    JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE c.contype='f' AND n.nspname NOT IN ('pg_catalog','information_schema') AND array_length(c.conkey,1)=1),
  idx AS (SELECT i.indrelid AS relid, i.indkey[0] AS col FROM pg_index i)
  SELECT count(*) FROM (SELECT relid,col FROM fk EXCEPT SELECT relid,col FROM idx) x;")" le 0 "FK-Spalten ohne Index"
row target G-DB03 "$(db_scalar "SELECT
    (SELECT count(DISTINCT c.table_schema||'.'||c.table_name) FROM information_schema.columns c
       JOIN information_schema.tables t ON t.table_schema=c.table_schema AND t.table_name=c.table_name
       WHERE c.column_name='brand' AND c.table_schema NOT IN ('pg_catalog','information_schema') AND t.table_type='BASE TABLE')
  - (SELECT count(DISTINCT conrelid) FROM pg_constraint
       WHERE contype='c' AND pg_get_constraintdef(oid) ILIKE '%brand%' AND pg_get_constraintdef(oid) ILIKE '%mentolder%');")" le 0 "brand-Spalten ohne CHECK-Constraint (messen; VIEWs ausgeschlossen T001906)"
row target G-DB08 "$(db_scalar "SELECT count(*) FROM pg_stat_user_tables
    WHERE n_live_tup>10000 AND seq_scan>0
      AND (seq_scan::numeric/NULLIF(seq_scan+idx_scan,0))>0.05;")" le 3 "Tabellen >10k Rows mit Seq-Scan-Anteil >5% (messen)"
row target G-DB09 "$(db_scalar "SELECT count(*) FROM pg_stat_statements WHERE mean_exec_time > 1000 AND query NOT ILIKE 'COPY %' AND query NOT ILIKE 'CREATE INDEX%'")" le 0 "Slow Queries in pg_stat_statements (mean_exec_time > 1s, exkl. Backup-COPY T001926 + einmalige CREATE INDEX-DDL T002095)"
row target G-DB10 "$(db_scalar "SELECT count(*) FROM pg_stat_user_indexes WHERE idx_scan = 0 AND indisready AND NOT indisprimary AND indexrelid NOT IN (SELECT conindid FROM pg_constraint WHERE contype='u')")" le 0 "Unused Indexes (idx_scan=0, exkl. PK/Unique)"
row target G-DB11 "$(restore_verify_age_d)" le 30 "Tage seit letztem erfolgreichem Restore-Verify (recovery-verify-status)"

# ── E2E-/OPS-TARGETS (T002063) ──
row target G-E2E01 "$(e2e_success_rate)" ge 90 "Nightly-E2E-Erfolgsrate e2e.yml (%, letzte 14 Läufe)"
row target G-E2E02 "$(db_scalar "SELECT COALESCE(sum((xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I WHERE is_test_data', c.table_schema, c.table_name), false, true, '')))[1]::text::int), 0) FROM information_schema.columns c JOIN information_schema.tables t ON t.table_schema=c.table_schema AND t.table_name=c.table_name WHERE c.column_name='is_test_data' AND t.table_type='BASE TABLE'")" eq 0 "E2E-Testdaten-Leak (is_test_data=true Rows, Brand-DB via HG_DB_NS)"
row target G-OPS01 "$(ops_kubectl_count not_ready)" le 0 "Pods nicht Running/Ready (fleet, beide Brand-Namespaces)"

# ── CI-TARGETS ──
row target G-CI03 "$(
  if [ "$FAST" = 1 ]; then echo "-"; else
    # gh-axi hat kein --json-Pendant fuer `run list` (nur --fields) — hier bewusst `gh` direkt,
    # siehe .claude/skills/references/gh-axi.md ("Wann gh statt gh-axi").
    gh_ok=0; out=$(gh run list --workflow ci.yml --branch main --limit 20 --json createdAt,updatedAt 2>/dev/null) || gh_ok=1
    if [ "$gh_ok" = 1 ] || [ -z "$out" ]; then echo "-"; else
      echo "$out" | python3 -c "
import json,sys
from datetime import datetime
runs=json.load(sys.stdin)
def parse(ts):
    return datetime.fromisoformat(ts.replace('Z','+00:00'))
durations=[(parse(r['updatedAt'])-parse(r['createdAt'])).total_seconds()/60 for r in runs if 'updatedAt' in r]
durations.sort(); p95=durations[int(len(durations)*0.95)] if durations else 0; print(f'{p95:.0f}')
" 2>/dev/null || echo "-"
    fi
  fi
)" le 12 "CI Pipeline p95 Duration (min, letzte 20 Runs auf main)"

# ── SEC-TARGETS ──
if [ "$FAST" = 0 ] && command -v kubectl >/dev/null 2>&1 && command -v trivy >/dev/null 2>&1; then
  row target G-SEC06 "$(timeout 60 trivy image --severity HIGH,CRITICAL --exit-code 0 --format json $(timeout 10 kubectl get pods --all-namespaces --request-timeout=5s -o jsonpath='{range .items[*]}{.spec.containers[*].image}{\"\n\"}{end}' 2>/dev/null | sort -u | tr '\n' ' ') 2>/dev/null | jq '[.Results[].Vulnerabilities[] | select(.Severity=="HIGH" or .Severity=="CRITICAL")] | length' 2>/dev/null || echo "-")" le 0 "Container Images mit High/Critical CVEs (via Trivy)"
else
  row target G-SEC06 "-" le 0 "Container CVEs (erfordert kubectl + Trivy — nicht messbar)"
fi

# ── FE-TARGETS ──
if [ "$FAST" = 0 ] && command -v npx >/dev/null 2>&1 && npx --yes @lhci/cli --version >/dev/null 2>&1; then
  row target G-FE05 "$(
    score=$(timeout 60 npx @lhci/cli autorun --no-lighthouserc --collect.url=https://web.mentolder.de --collect.settings.chromeFlags='--headless --no-sandbox' --assert.preset=none 2>/dev/null | grep -oP 'Performance: \K[0-9]+' | head -1)
    echo "${score:--}"
  )" ge 90 "Lighthouse Performance Score"
else
  row target G-FE05 "-" ge 90 "Lighthouse Performance Score (erfordert @lhci/cli — nicht messbar)"
fi

# ── Zusammenfassung ────────────────────────────────────────────────────────────
TOTAL=$((PASS+OPEN+GATEFAIL+SKIP))
printf "\n%s──────────────────────────────────────────%s\n" "$C_D" "$C_X"
printf "%bZusammenfassung%b (%d geprüft): %s%d ✅ erreicht%s · %s%d 🟡 offen%s · %s%d 🔴 Gate-Verstoß%s · %s%d · übersprungen%s\n" \
  "$C_B" "$C_X" "$TOTAL" "$C_G" "$PASS" "$C_X" "$C_Y" "$OPEN" "$C_X" "$C_R" "$GATEFAIL" "$C_X" "$C_D" "$SKIP" "$C_X"

if [ "$GATEFAIL" -gt 0 ]; then
  printf "%b✗ %d Gate-Ziel(e) verletzt — Repo-Health regrediert.%b\n" "$C_R" "$GATEFAIL" "$C_X"; exit 1
fi
if [ "$STRICT" = 1 ] && [ "$OPEN" -gt 0 ]; then
  printf "%b✗ --strict: %d Target-Ziel(e) noch offen.%b\n" "$C_Y" "$OPEN" "$C_X"; exit 1
fi
printf "%b✓ Alle Gate-Ziele grün.%b\n" "$C_G" "$C_X"; exit 0
