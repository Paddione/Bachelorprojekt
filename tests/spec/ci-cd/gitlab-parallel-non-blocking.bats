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

@test "gitlab-parallel-non-blocking: kein GitLab-Job traegt allow_failure: true" {
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

bad = [name for name, job in doc.items()
       if isinstance(job, dict) and "script" in job and job.get("allow_failure") is True]
print(" ".join(bad))
PY
)"
  if [ -n "$offenders" ]; then
    echo "Job(s) mit allow_failure: true:${offenders}" >&2
    false
  fi
}
