#!/usr/bin/env bash
# zielfamilien-audit.sh — Audit-Runner für die Zielfamilien-Fehlerklassen E1–E5 [T002584]
#
# Systematischer Durchgang durch die Audit-Zielfamilien in
# `.claude/lib/goals.md` / `scripts/health-goals-check.sh` auf die Fehlerklasse
# T002356-M1 (vakuos grün / SKIP-forever). Läuft vollständig OFFLINE — kein Netz,
# keine DB, kein Cluster (REQ-HEALTH-GOALS-AUDIT-001): die `check`-Messung erfolgt
# gegen ein Fixture-Korpus aus Marker-Dateien.
#
# Subkommandos:
#   list-families                      18 Audit-Familien, eine je Zeile (sortiert)
#   evaluate <id> <actual> [--present|--absent]   Regel-Engine pur (E1/E2/E4)
#   check --family <P> [--fixture <d>]  Messung + Regeln gegen ein Fixture-Korpus
#
# Fixture-Korpus: `--fixture <dir>` oder $ZF_AUDIT_FIXTURES; weder gesetzt → exit 2.
#   basis/<P>/<GOAL>.absent    → E5 (Existenz-Anker fehlt), FAIL, exit 1
#   basis/<P>/<GOAL>.present   → PASS (bzw. via `.value` bewertet)
#   basis/<P>/<GOAL>.value     → Messwert, der mit den evaluate-Regeln bewertet wird
#   kein Marker                → SKIP (kein Exit-Einfluss)
#
# Audit-Scope (T002584): explizite Allowlist der 18 Familien. LLM* → T002442,
# WT* → T002443 ausgeschlossen; CD/DORA/K8S/SPEC kamen nach Plan-Erstellung
# (2026-08-03, T002598) in die Dateien und liegen außerhalb des Audit-Scopes.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# 18 In-Scope-Familien (Allowlist, RED-Vertrag `zielfamilien-audit.bats`)
ZF_FAMILIES="AGENTIC BRAIN CFG CI CQ DB DEP DOC E2E FE GIT IF IMG OPS RH SEC SIZE TEST"

zf_usage() {
  cat <<'EOF'
Usage: zielfamilien-audit.sh <subcommand>

  list-families                      18 Audit-Familien, eine je Zeile
  evaluate <id> <actual> [--present|--absent]   Regel-Engine (E1/E2/E4); Default present
  check --family <P> [--fixture <dir>]  Messung + Regeln gegen Fixture-Korpus

Fixture-Korpus: --fixture <dir> oder $ZF_AUDIT_FIXTURES.
Marker: basis/<P>/<GOAL>.absent | .present, optional .value (Messwert).
EOF
}

# ── Katalog (SSOT: goals.md + health-goals-check.sh, gefiltert auf Allowlist) ──

zf_family_of() { printf '%s\n' "$1" | sed -E 's/^G-//; s/[0-9]+$//'; }

# Gibt pro Zeile "<FAMILY> <GOAL_ID>" aus, dedupliziert, nur Allowlist-Familien.
zf_catalog() {
  local id fam
  {
    grep -oE '^## G-[A-Z0-9]+' "$REPO_ROOT/.claude/lib/goals.md" | sed 's/^## //'
    grep -oE 'row[[:space:]]+(gate|target)[[:space:]]+G-[A-Z0-9]+' \
      "$REPO_ROOT/scripts/health-goals-check.sh" | sed -E 's/row[[:space:]]+(gate|target)[[:space:]]+//'
  } | sort -u | while read -r id; do
    fam="$(zf_family_of "$id")"
    case " $ZF_FAMILIES " in *" $fam "*) printf '%s %s\n' "$fam" "$id";; esac
  done
}

# ── Fixture-Auflösung (REQ-001: --fixture oder Env, sonst exit 2) ─────────────

zf_fixture_dir() {
  local opt="${1:-}"
  if [ -n "$opt" ]; then printf '%s\n' "$opt"; return 0; fi
  if [ -n "${ZF_AUDIT_FIXTURES:-}" ]; then printf '%s\n' "$ZF_AUDIT_FIXTURES"; return 0; fi
  echo "zielfamilien-audit: kein Fixture-Verzeichnis (--fixture <dir> oder ZF_AUDIT_FIXTURES)" >&2
  return 2
}

# ── list-families ─────────────────────────────────────────────────────────────

zf_list_families() {
  zf_catalog | awk '{print $1}' | LC_ALL=C sort -u
}

# ── evaluate — Regel-Engine pur (E1/E2/E4) ────────────────────────────────────

# Reihenfolge (erste zutreffende gewinnt; E1 vor E4, damit ein LEERER Messwert bei
# fehlender Basis als vakuos-grün erkannt wird, nicht als Text — RED + Rollen-Matrix):
#   1. "-"            → E2 (SKIP-Sentinel): bei --absent PASS (korrektes n/a), sonst FAIL
#   2. 0 oder leer    → E1 bei --absent (vakuos grün, T002356-M1)
#   3. nicht numerisch→ E4 (Text im arithmetischen Vergleich), unabhängig vom Basis-Status
#   4. sonst          → PASS (reale Null/echte Zahl ist ein Messwert)
zf_evaluate() {
  local id="${1:-}" actual="${2:-}" basis="${3:---present}"
  case "$basis" in --present|--absent) ;; *) basis="--present";; esac

  if [ "$actual" = "-" ]; then
    if [ "$basis" = "--absent" ]; then printf 'PASS %s\n' "$id"; return 0; fi
    printf 'FAIL %s E2\n' "$id"; return 1
  fi
  if { [ "$actual" = "0" ] || [ -z "$actual" ]; } && [ "$basis" = "--absent" ]; then
    printf 'FAIL %s E1\n' "$id"; return 1
  fi
  if ! printf '%s' "$actual" | grep -qE '^-?[0-9]+$'; then
    printf 'FAIL %s E4\n' "$id"; return 1
  fi
  printf 'PASS %s\n' "$id"; return 0
}

# ── check — Messung + Regeln gegen Fixture-Korpus ─────────────────────────────

zf_check() {
  local family="" fixture="" id val rc=0
  while [ $# -gt 0 ]; do
    case "$1" in
      --family) family="$2"; shift 2;;
      --fixture) fixture="$2"; shift 2;;
      *) echo "zielfamilien-audit: unbekanntes check-Argument: $1" >&2; return 2;;
    esac
  done
  [ -n "$family" ] || { echo "zielfamilien-audit: check braucht --family <P>" >&2; return 2; }
  fixture="$(zf_fixture_dir "$fixture")" || return 2

  while read -r fam id; do
    [ "$fam" = "$family" ] || continue
    if [ -f "$fixture/basis/$family/$id.absent" ]; then
      printf 'FAIL %s E5: Mess-Basis fehlt (Existenz-Anker)\n' "$id"
      rc=1
    elif [ -f "$fixture/basis/$family/$id.present" ]; then
      if [ -f "$fixture/basis/$family/$id.value" ]; then
        val="$(cat "$fixture/basis/$family/$id.value")"
        zf_evaluate "$id" "$val" --present || rc=1
      else
        printf 'PASS %s\n' "$id"
      fi
    else
      printf 'SKIP %s\n' "$id"
    fi
  done < <(zf_catalog)
  return "$rc"
}

# ── Main-Dispatch ─────────────────────────────────────────────────────────────

case "${1:-}" in
  list-families) shift; zf_list_families "$@";;
  evaluate) shift; zf_evaluate "$@";;
  check) shift; zf_check "$@";;
  help|-h|--help) zf_usage;;
  *) zf_usage >&2; exit 2;;
esac
