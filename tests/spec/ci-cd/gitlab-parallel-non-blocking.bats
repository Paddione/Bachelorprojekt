#!/usr/bin/env bats
# tests/spec/ci-cd/gitlab-parallel-non-blocking.bats — GitHub bleibt SSOT [T011790]
#
# PRUEFMODUS: Quelltext-Inspektion (nicht Output-Verifikation).
# Begruendung: Gegenstand ist, ob GitHub-Workflow-Jobs entfernt/kurzgeschlossen wurden
# und ob GitLab-Jobs weich gestellt sind (allow_failure). Beides ist reine
# Konfigurationsstruktur ohne beobachtbaren Laufzeit-Output ohne echten CI-Lauf auf
# beiden Plattformen (T002448-M4-Ausnahme fuer CI-Konfiguration).
#
# Hintergrund (specs/ci-cd.md, Requirement "GitLab-Parallelbetrieb"): GitHub Actions
# bleibt in dieser Etappe alleiniges Merge-Gate. Kein bestehender GitHub-Workflow darf
# entfernt oder dauerhaft kurzgeschlossen werden; die GitLab-Jobs duerfen nicht durch
# allow_failure weich gestellt sein — dass GitLab nicht blockiert, folgt daraus, dass
# es nirgends als Required Check hinterlegt ist, nicht aus weichen Jobs.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  CI_YML="${REPO_ROOT}/.github/workflows/ci.yml"
  GL_YML="${REPO_ROOT}/.gitlab-ci.yml"
}

# Gibt den Textblock eines Top-Level-Jobs aus ci.yml aus (von "  <job>:" bis zum
# naechsten Top-Level-Schluessel gleicher Einrueckung, exklusiv).
_gh_job_block() {
  local job="$1"
  awk -v job="  ${job}:" '
    $0 == job { flag=1; print; next }
    flag && /^  [A-Za-z0-9_-]+:[[:space:]]*$/ { flag=0 }
    flag { print }
  ' "$CI_YML"
}

@test "gitlab-parallel-non-blocking: die drei GitHub-Kern-Jobs existieren weiterhin" {
  # Positiv-Anker [T002356-M1]: ohne diesen Nachweis waere "keiner entfernt" bei
  # einer leeren/verschobenen Datei trivial wahr.
  if [ ! -f "$CI_YML" ]; then
    echo "erwartete Datei fehlt: $CI_YML" >&2
    false
  fi
  for job in test-bats test-manifests security-scan; do
    block="$(_gh_job_block "$job")"
    if [ -z "$block" ]; then
      echo "GitHub-Job fehlt oder wurde entfernt: ${job}" >&2
      false
    fi
  done
}

@test "gitlab-parallel-non-blocking: keiner der drei Kern-Jobs ist dauerhaft kurzgeschlossen" {
  if [ ! -f "$CI_YML" ]; then
    echo "erwartete Datei fehlt: $CI_YML" >&2
    false
  fi

  # Positiv-Anker [T002356-M1] — im SELBEN Test, nicht nur im vorigen: fehlten alle
  # drei Jobbloecke, waere "keiner kurzgeschlossen" unten trivial wahr (leere
  # Kandidatenmenge). Ein anderer Test darf diesen Anker nicht ersetzen — jeder
  # Test steht fuer sich.
  missing=""
  for job in test-bats test-manifests security-scan; do
    block="$(_gh_job_block "$job")"
    [ -n "$block" ] || missing="${missing} ${job}"
  done
  if [ -n "$missing" ]; then
    echo "GitHub-Job fehlt oder wurde entfernt (Positiv-Anker verletzt):${missing}" >&2
    false
  fi

  offenders=""
  for job in test-bats test-manifests security-scan; do
    block="$(_gh_job_block "$job")"
    if echo "$block" | grep -qE 'if:\s*false'; then
      offenders="${offenders} ${job}"
    fi
  done
  if [ -n "$offenders" ]; then
    echo "Kurzgeschlossene Job(s):${offenders}" >&2
    false
  fi
}

# ── Etappe 3 (T012405): von "keiner" auf "keiner ohne Gegenstueck" ───────────
#
# Bis Etappe 2 galt hier: KEIN GitLab-Job darf allow_failure: true tragen. Die
# Absicht dahinter steht im Kopfkommentar — dass GitLab nicht blockiert, soll
# daraus folgen, dass es nirgends als Required Check hinterlegt ist, NICHT daraus,
# dass seine Jobs weich gestellt sind. Weiche Jobs wuerden echte Befunde verdecken.
#
# Etappe 3 bringt lighthouse, dessen GitHub-Gegenstueck selbst continue-on-error
# traegt. Das pauschale Verbot waere hier falsch herum: Ein fail-closed
# Lighthouse-Job auf GitLab waere STRENGER als GitHub — eine Divergenz genau der
# Klasse, die die Paritaet vermeiden soll, und er faerbte die Pipeline rot wegen
# einer Performance-Zahl, die GitHub selbst als Hinweis behandelt.
#
# Die Regel wird deshalb praezisiert, nicht gelockert: weich sein darf ein
# GitLab-Job genau dann, wenn sein GitHub-Gegenstueck es auch ist. Was die
# urspruengliche Absicht verbietet — Weichstellen OHNE Entsprechung auf der
# anderen Seite — bleibt vollstaendig verboten.
@test "gitlab-parallel-non-blocking: kein GitLab-Job ist weicher als sein GitHub-Gegenstueck" {
  if [ ! -f "$GL_YML" ]; then
    echo "erwartete Datei fehlt: $GL_YML" >&2
    false
  fi

  # Positiv-Anker [T002356-M1]: es gibt ueberhaupt Jobs, gegen die geprueft wird.
  job_count="$(python3 - "$GL_YML" <<'PY'
import sys
import yaml

with open(sys.argv[1]) as fh:
    doc = yaml.safe_load(fh) or {}

print(sum(1 for v in doc.values() if isinstance(v, dict) and "script" in v))
PY
)"
  [ "$job_count" -gt 0 ]

  offenders="$(python3 - "$GL_YML" <<'PY'
import sys
import yaml

with open(sys.argv[1]) as fh:
    doc = yaml.safe_load(fh) or {}

# Jobs, deren GitHub-Gegenstueck selbst weich ist (continue-on-error). Der Schluessel
# ist der GitLab-Job-Name. Ein Eintrag hier ist KEIN Freibrief: der Test unterhalb
# prueft seine Voraussetzung gegen ci.yml.
SOFT_ON_GITHUB = {"lighthouse"}

bad = [name for name, job in doc.items()
       if isinstance(job, dict) and "script" in job
       and job.get("allow_failure") is True
       and name not in SOFT_ON_GITHUB]
print(" ".join(bad))
PY
)"
  if [ -n "$offenders" ]; then
    echo "Job(s) mit allow_failure: true:${offenders}" >&2
    false
  fi
}

@test "gitlab-parallel-non-blocking: die lighthouse-Ausnahme deckt sich mit ci.yml" {
  # Ohne diesen Test waere die Ausnahmeliste im Test darueber ein Freibrief: sie
  # bliebe auch dann bestehen, wenn der GitHub-Job lighthouse eines Tages
  # fail-closed wuerde. Geprueft wird deshalb nicht die Liste, sondern ihre
  # Voraussetzung auf der GitHub-Seite.
  block="$(_gh_job_block lighthouse)"

  # Positiv-Anker [T002356-M1]: der Job existiert ueberhaupt. Ein leerer Block
  # liesse die Pruefung unten trivial scheitern — mit einer Meldung, die auf
  # continue-on-error zeigt statt auf den fehlenden Job.
  if [ -z "$block" ]; then
    echo "GitHub-Job lighthouse existiert nicht (mehr) — die GitLab-Ausnahme neu bewerten" >&2
    false
  fi

  if ! printf '%s\n' "$block" | grep -q 'continue-on-error: true'; then
    echo "GitHub-Job lighthouse ist NICHT mehr weich — die GitLab-Ausnahme (allow_failure) ist unbegruendet" >&2
    false
  fi
}

@test "gitlab-parallel-non-blocking: Job-Paritaet allein schaltet das Gate nicht um" {
  # Der Guard gegen den versehentlichen Gate-Flip (T012405). Etappe 3 stellt GitLab
  # auf denselben Pruefumfang wie GitHub — und genau dann wird es verlockend, die
  # GitHub-Seite "jetzt ueberfluessige" Jobs abschalten zu lassen. Das ist eine
  # eigene Entscheidung mit eigener Etappe, nicht ein Nebeneffekt der Paritaet.
  #
  # Anders als Test 1, der drei Kern-Jobs prueft, deckt dieser ALLE zehn
  # Offline-Gate-Jobs ab: nach Etappe 3 hat jeder von ihnen ein GitLab-Gegenstueck,
  # jeder waere also ein Kandidat fuers Abschalten.
  ALL_GATES="test-bats test-manifests test-factory-openspec test-factory-shard test-factory security-scan brett-typescript vitest-website commit-lint lighthouse"

  found=0
  missing=""
  for job in $ALL_GATES; do
    block="$(_gh_job_block "$job")"
    if [ -z "$block" ]; then
      missing="${missing} ${job}"
    else
      found=$((found + 1))
    fi
  done

  # Positiv-Anker [T002356-M1]: die Extraktion greift ueberhaupt. Ohne ihn waere
  # "nichts fehlt" auch bei einer unlesbaren ci.yml wahr.
  echo "Anker: gefundene Offline-Gate-Jobs = ${found} von 10"
  [ "$found" -gt 0 ]

  if [ -n "$missing" ]; then
    echo "GitHub-Offline-Gate-Job(s) entfernt:${missing}" >&2
    echo "Der Gate-Flip ist eine eigene Etappe — Paritaet allein rechtfertigt keine Abschaltung." >&2
    false
  fi
}
