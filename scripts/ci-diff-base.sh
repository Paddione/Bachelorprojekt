#!/usr/bin/env bash
# scripts/ci-diff-base.sh — Diff-Basis fuer scope-waehlende Gates [T012405]
#
# Vier Gates waehlen ihren Umfang aus einem Diff gegen main (find-changed-tests.sh,
# task test:changed, vitest --changed, commit-lint). Die Basis heisst je nach
# Pipeline-Art anders oder existiert gar nicht. Dieses Skript ist die EINZIGE
# Fundstelle dieser Aufloesung — beide Pipelines rufen es, damit die Auswahl-Semantik
# nicht zwischen den Plattformen driftet.
#
# Spec: openspec/specs/ci-cd.md, Requirement "Diff-Basis wird an einer Stelle
# aufgeloest und meldet ihr Fehlen".
#
# AUSGABE: ausschliesslich der SHA auf stdout. Diagnosen gehen nach stderr, damit
#   BASE="$(bash scripts/ci-diff-base.sh)"
# verwendbar bleibt — landete auch nur eine Diagnosezeile auf stdout, enthielte BASE
# zwei Zeilen und jeder Folge-git-Aufruf scheiterte mit einer Meldung, die auf git
# zeigt statt auf die Ursache.
#
# EXIT-CODES:
#   0  stdout = Basis-SHA
#   3  keine Basis anwendbar (Push auf main) — Aufrufer nimmt die Vollmenge
#   4  Umgebung kaputt (kein origin/main erreichbar) — Aufrufer bricht ab
#
# 3 und 4 sind bewusst verschieden. Ein einziger Fehler-Code liesse beide im Aufrufer
# zusammenfallen, und der Aufrufer waehlt daraus die Testmenge: eine kaputte Umgebung,
# die als "keine Basis, also Vollmenge" gelesen wird, meldet gruen fuer einen Commit,
# den nichts geprueft hat. Exit 1 ist bewusst NICHT vergeben — ein unter `set -e`
# abgebrochenes Skript liefert 1, und der Aufrufer koennte das keinem Fall zuordnen.
#
# Kein `set -e`: git merge-base und git rev-parse scheitern hier in regulaeren Zweigen
# (flacher Klon ohne origin/main). Fehlschlaege werden explizit abgefangen und in die
# obigen Codes uebersetzt.
set -uo pipefail

log() { printf '%s\n' "ci-diff-base: $*" >&2; }

# --- 1) Vorgegebene Merge-Request-Basis --------------------------------------
# GitLab setzt sie in MR-Pipelines. Sie hat Vorrang: sie ist die Basis, gegen die
# GitLab den MR selbst diffed, und eine abweichende eigene Rechnung waere eine
# zweite Wahrheit ueber denselben Merge-Request.
if [ -n "${CI_MERGE_REQUEST_DIFF_BASE_SHA:-}" ]; then
  if git rev-parse --verify --quiet "${CI_MERGE_REQUEST_DIFF_BASE_SHA}^{commit}" >/dev/null 2>&1; then
    log "Basis aus CI_MERGE_REQUEST_DIFF_BASE_SHA"
    printf '%s\n' "$CI_MERGE_REQUEST_DIFF_BASE_SHA"
    exit 0
  fi
  # Gesetzt, aber im lokalen Klon nicht aufloesbar: typischerweise ein zu flacher
  # Fetch. Das ist eine kaputte Umgebung, keine fehlende Basis.
  log "CI_MERGE_REQUEST_DIFF_BASE_SHA gesetzt, aber nicht aufloesbar — flacher Klon?"
  exit 4
fi

# --- 2) Laeuft die Pipeline auf main? ----------------------------------------
# Plattform-uebergreifend pruefen: GitLab, GitHub, dann lokal. Der Reihe nach, damit
# das Skript in beiden CI-Systemen und beim manuellen Aufruf dasselbe tut.
branch="${CI_COMMIT_BRANCH:-${GITHUB_REF_NAME:-}}"
if [ -z "$branch" ]; then
  branch="$(git branch --show-current 2>/dev/null || true)"
fi

if [ "$branch" = "main" ]; then
  log "Push auf main — keine Diff-Basis anwendbar, Aufrufer nimmt die Vollmenge"
  exit 3
fi

# --- 3) origin/main muss erreichbar sein -------------------------------------
main_ref=""
for candidate in refs/remotes/origin/main origin/main main; do
  if git rev-parse --verify --quiet "${candidate}^{commit}" >/dev/null 2>&1; then
    main_ref="$candidate"
    break
  fi
done

if [ -z "$main_ref" ]; then
  log "origin/main nicht auffindbar — vor dem Aufruf 'git fetch origin +main:refs/remotes/origin/main'"
  exit 4
fi

# --- 4) Merge-Base gegen HEAD ------------------------------------------------
if base="$(git merge-base "$main_ref" HEAD 2>/dev/null)" && [ -n "$base" ]; then
  log "Basis aus merge-base(${main_ref}, HEAD)"
  printf '%s\n' "$base"
  exit 0
fi

# Keine gemeinsame Historie (flacher Klon mit --depth=1 auf beiden Seiten). Dann ist
# der main-Tip die beste verfuegbare Naeherung — schlechter als die Merge-Base, aber
# eine echte Basis, mit der die Auswahl arbeiten kann.
if base="$(git rev-parse --verify --quiet "${main_ref}^{commit}" 2>/dev/null)" && [ -n "$base" ]; then
  log "keine gemeinsame Historie — Rueckfall auf ${main_ref}"
  printf '%s\n' "$base"
  exit 0
fi

log "Basis nicht aufloesbar"
exit 4
