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
row gate G-GIT02 "$(git log --format=%s -30 origin/main 2>/dev/null | grep -vcE '^(feat|fix|chore|docs|refactor|test|ci|build|perf|style)(\(|!|:)')" eq 0 "Non-conventional Commits (letzte 30)"
if [ "$FAST" = 0 ] && command -v task >/dev/null 2>&1; then
  timeout 90 task env:validate:all >/dev/null 2>&1; row gate G-CFG01 "$?" eq 0 "env:validate:all (Schema-Drift)"
else row gate G-CFG01 "-" eq 0 "env:validate:all (--fast übersprungen)"; fi

# ── TARGETS (Reduktionsziele in Arbeit) ────────────────────────────────────────
[ "$QUIET" = 0 ] && printf "\n%sTARGETS (Reduktion)%s\n" "$C_B" "$C_X"

row target G-CQ05 "$(grep -rnE '\bTODO\b' --include='*.ts' --include='*.svelte' --include='*.astro' --include='*.sh' --include='*.js' --include='*.mjs' website/src scripts tests k3d brett/src 2>/dev/null | grep -vE 'node_modules|/dist/|plan-lint.sh|plan-qa-check.sh|openspec.sh|openspec-validate|openspec-merge' | wc -l | tr -d ' ')" le 1 "Echte TODO-Marker (kein Netto-Zuwachs)"
row target G-RH01 "$(n_baseline_gate ALL)" le 30 "Baselined Gate-Violations gesamt"
row target G-CQ07 "$(n_baseline_gate S2)" le 0  "S2 Import-Zyklen"
row target G-CQ09 "$(n_baseline_gate S3)" le 10 "S3 hartkodierte Hostnames"
row target G-CQ10 "$(n_baseline_gate S4)" le 4  "S4 verwaiste Scripts/Manifeste"
row target G-CQ02 "$(grep -rn ': any\|<any>\|as any' website/src --include='*.ts' --include='*.svelte' --include='*.astro' 2>/dev/null | wc -l | tr -d ' ')" le 280 "explizite any-Verwendungen"
row target G-FE03 "$(grep -rEn 'console\.(error|warn)' website/src --include='*.ts' --include='*.svelte' --include='*.astro' 2>/dev/null | grep -v 'browser-logger\.ts' | wc -l | tr -d ' ')" le 0 "rohe console.error/warn Aufrufe (exkl. browser-logger-Stub)"
row target G-SIZE03 "$( [ -f website/src/lib/website-db.ts ] && wc -l < website/src/lib/website-db.ts | tr -d ' ' || echo - )" le 3000 "God-File website-db.ts (Zeilen)"
# .codebase-memory/ ist bewusst aus dem Scope ausgeschlossen (Policy-Entscheidung T001348):
# graph.db.zst ist ein generiertes, `merge=ours` Binärartefakt (PR #2281), das von
# .github/workflows/codebase-memory-regen.yml direkt geschrieben/gepusht wird — ohne LFS-Bewusstsein.
# Eine LFS-Migration würde `git lfs install` im Regen-Workflow sowie lokal bei allen Contributoren
# voraussetzen (hier lokal aktuell nicht funktionsfähig: "git-lfs is broken"), zusätzlich GitHub-LFS-
# Storage-Quota. Zwei Vorgänger-Tickets (T001275, T001320) wurden geschlossen, ohne die Migration
# tatsächlich durchzuführen — der Aufwand/Nutzen rechtfertigt sie für dieses Artefakt nicht.
row target G-GIT03 "$(git ls-files -z 2>/dev/null | grep -zv '^\.codebase-memory/' | xargs -0 -I{} sh -c 'test -f "{}" && wc -c "{}"' 2>/dev/null | awk '$1>1048576{c++} END{print c+0}')" le 6 "Dateien >1MB (kein LFS, exkl. .codebase-memory/ — T001348)"
row target G-IMG01 "$(grep -rhE '^[[:space:]]*-?[[:space:]]*image:[[:space:]]+["'"'"']?[A-Za-z0-9$]' --include='*.yaml' --include='*.yml' k3d/ prod*/ 2>/dev/null | grep -v '@sha256' | grep -vE '^[[:space:]]*#' | grep -vE 'website|brett|videovault|mediaviewer-widget|mentolder-web|WEBSITE_IMAGE|STUDIO_IMAGE|STAGING_IMAGE|paddione' | sed -E 's/.*image:[[:space:]]*//; s/["'"'"']//g; s/[[:space:]]*#.*//' | sort -u | wc -l | tr -d ' ')" le 0 "ungepinnte Fremd-Images"
row target G-DOC02 "$(wc -l < CLAUDE.md | tr -d ' ')" le 200 "CLAUDE.md Zeilen"
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
