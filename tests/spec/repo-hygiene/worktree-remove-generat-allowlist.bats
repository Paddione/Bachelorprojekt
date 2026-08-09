#!/usr/bin/env bats
# tests/spec/repo-hygiene/worktree-remove-generat-allowlist.bats
# SSOT: openspec/specs/agent-skills.md — repo-hygiene-Runbook §1
#
# Ticket T003121. Der Vorcheck vor `git worktree remove` verlangte bisher einen leeren
# `git status --porcelain`. Das misst zu grob: jeder Worktree, in dem ein Plan gestaged
# oder archiviert wurde, traegt danach ein regeneriertes Freshness-Generat und ist damit
# dauerhaft dirty. Der dokumentierte Schutz wurde dadurch im Normalfall uebersprungen.
#
# Pruefmodus: **Kommando-Ergebnis-Verifikation** (Block 2) plus eine Quelltext-Aussage
# (Block 1) — Letztere ist die ausdrueckliche Ausnahme der Konvention T002448-M4 fuer
# Doku-Regeln, die kein ausfuehrbares Laufzeitverhalten haben. Block 2 baut die
# dokumentierte Form NICHT nach, sondern liest sie aus der realen SSOT-Datei und wertet
# ihr Resultat aus.
#
# Bewusst NICHT geprueft wird das Ausgabeformat von `git status` — geprueft wird, WELCHE
# Pfade die dokumentierte Form durchlaesst (T002716).
#
# Jeder Block belegt ZUERST, dass sein Bezugspunkt existiert (Positiv-Anker, T002356-M1),
# und prueft DANN die eigentliche Aussage.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  OPS="${REPO_ROOT}/.claude/skills/references/repo-hygiene-ops.md"
}

# Schneidet einen `## `-Abschnitt aus dem Runbook heraus, damit Aussagen im richtigen
# Abschnitt landen statt irgendwo in der Datei.
_section() {
  awk -v pat="$1" '
    $0 ~ pat { inside = 1; next }
    inside && /^## / { inside = 0 }
    inside { print }
  ' "$OPS"
}

# Wegwerf-Repo mit genau zwei Abweichungen: einem Freshness-Generat (folgenlos) und
# einer echten Quelldatei (Befund). Kein Bezug zum Repo des Laufs.
_make_dirty_worktree() {
  local wt="$1"
  mkdir -p "$wt/website/src/data" "$wt/scripts"
  git -C "$wt" init -q
  git -C "$wt" symbolic-ref HEAD refs/heads/main
  git -C "$wt" config user.email "t003121@example.invalid"
  git -C "$wt" config user.name "T003121 Guard"
  printf '{}\n' > "$wt/website/src/data/openspec-status.json"
  printf 'echo base\n' > "$wt/scripts/beispiel.sh"
  git -C "$wt" add -A
  git -C "$wt" commit -qm "base"
  # Generat wandert auf main ohnehin fort — folgenlos.
  printf '{"regeneriert": true}\n' > "$wt/website/src/data/openspec-status.json"
  # Echte Arbeit, die kein Commit sichert — genau das soll den Remove blockieren.
  printf 'echo ungesicherte Arbeit\n' >> "$wt/scripts/beispiel.sh"
}

@test "T003121: §1 verwirft 'git log main..<branch>' als Merge-Nachweis" {
  [ -f "$OPS" ]

  # Positiv-Anker: §1 existiert und hat Inhalt. Ohne ihn waeren die Aussagen unten
  # ueber einem leeren Ausschnitt vakuos wahr.
  local sec
  sec="$(_section '^## 1[.]')"
  [ -n "$sec" ]
  printf '%s\n' "$sec" | grep -qF 'git worktree remove'

  # Die Aussage: der Abschnitt fuehrt die Squash-Merge-Falle und verweist auf den
  # Blob-Vergleich, statt den Ancestry-Vergleich als Nachweis anzubieten.
  printf '%s\n' "$sec" | grep -qF 'squash-and-merge'
  printf '%s\n' "$sec" | grep -qiF 'blob-vergleich'
}

@test "T003121: die dokumentierte Allowlist-Form laesst Generate durch und meldet echte Arbeit" {
  # Positiv-Anker: §1 dokumentiert ueberhaupt eine Filterform auf `status --porcelain`.
  local sec
  sec="$(_section '^## 1[.]')"
  [ -n "$sec" ]
  printf '%s\n' "$sec" | grep -qF 'status --porcelain'

  # Die dokumentierte Form wird aus der realen SSOT-Datei gelesen, nicht im Test
  # nachgebaut — sonst prueft der Guard seine eigene Kopie statt der Anweisung, der
  # ein Bediener folgt. Genommen wird der Fenced-Block, der die Filterform enthaelt.
  local form
  form="$(awk '/^git -C <path> status --porcelain.*cut -c4-/ { inside = 1 }
               inside { print }
               inside && !/\\$/ { exit }' "$OPS")"
  [ -n "$form" ]
  printf '%s\n' "$form" | grep -qF 'openspec/changes/'

  local wt="${BATS_TEST_TMPDIR}/dirty"
  _make_dirty_worktree "$wt"
  form="${form//<path>/$wt}"

  # Resultat-Verifikation: die echte Quelldatei kommt durch (Befund → kein Remove) …
  run bash -c "$form"
  printf '%s\n' "$output" | grep -qF 'scripts/beispiel.sh'

  # … und das Generat wird geschluckt. Ohne diese Haelfte waere der Vorcheck wieder
  # der grobe, der `--force` zum Standardgriff macht.
  run bash -c "$form | grep -cF 'website/src/data/openspec-status.json'"
  [ "$output" -eq 0 ]
}

@test "T003121: ein Worktree mit ausschliesslich Generat-Abweichungen gilt als sauber" {
  local form
  form="$(awk '/^git -C <path> status --porcelain.*cut -c4-/ { inside = 1 }
               inside { print }
               inside && !/\\$/ { exit }' "$OPS")"
  [ -n "$form" ]

  local wt="${BATS_TEST_TMPDIR}/nur-generat"
  _make_dirty_worktree "$wt"
  # Die echte Arbeit zuruecknehmen — es bleibt genau der Fall aus dem Befund vom
  # 2026-08-10 (.worktrees/factory-worktree-reaper-T002896).
  git -C "$wt" checkout -- scripts/beispiel.sh

  # Positiv-Anker: der Worktree ist fuer git weiterhin dirty. Ohne ihn koennte die
  # Aussage unten auch dann gelten, wenn gar keine Abweichung mehr existierte.
  run bash -c "git -C '$wt' status --porcelain"
  [ -n "$output" ]

  # Die Aussage: die dokumentierte Form meldet trotzdem nichts — der Remove ist frei.
  form="${form//<path>/$wt}"
  run bash -c "$form"
  [ -z "$output" ]
}
