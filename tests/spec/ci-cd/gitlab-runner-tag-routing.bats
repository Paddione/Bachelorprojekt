#!/usr/bin/env bats
# tests/spec/ci-cd/gitlab-runner-tag-routing.bats — Fallback per Runner-Tag-Variable [T011790]
#
# PRUEFMODUS: Quelltext-Inspektion (nicht Output-Verifikation).
# Begruendung: Gegenstand ist, welchen Runner ein GitLab-Job ueber seine tags:-Deklaration
# adressiert. Das ist reine YAML-Struktur; es gibt keinen Laufzeit-Output ohne echten
# GitLab-Zugang (siehe design.md — CI-Konfiguration ist die T002448-M4-Ausnahme).
#
# Hintergrund (design.md D2): Der Compute-Fallback (self-hosted -> gitlab.com Shared
# Runner) laeuft ausschliesslich ueber die Projekt-Variable CI_RUNNER_TAG. Ein
# hartkodierter Tag in irgendeinem Job macht genau diesen Job fuer den Fallback
# unerreichbar — deshalb wird ueber die YAML-Struktur geprueft, nicht ueber
# Zeilenanker auf eine bestimmte Einrueckung (Einrueckung ist Darstellung).

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  GL_YML="${REPO_ROOT}/.gitlab-ci.yml"
}

# Gibt fuer jeden Job in .gitlab-ci.yml eine Zeile "<jobname>|<tags-als-json>" aus.
# Ein "Job" ist hier jeder oberste YAML-Schluessel mit einem script:-Feld — das
# schliesst .gitlab-ci.yml-eigene Sonderschluessel (stages, variables, ...) aus.
_job_tags() {
  python3 - "$GL_YML" <<'PY'
import json, sys
import yaml

path = sys.argv[1]
with open(path) as fh:
    doc = yaml.safe_load(fh) or {}

for name, job in doc.items():
    if not isinstance(job, dict):
        continue
    if "script" not in job:
        continue
    print(f"{name}|{json.dumps(job.get('tags'))}")
PY
}

@test "gitlab-runner-tag-routing: .gitlab-ci.yml existiert und definiert mindestens einen Job mit tags:" {
  # Positiv-Anker [T002356-M1]: ohne mindestens einen Job waere "kein Job hartkodiert
  # einen Tag" bei einer leeren Datei trivial wahr.
  if [ ! -f "$GL_YML" ]; then
    echo "erwartete Datei fehlt: $GL_YML" >&2
    false
  fi
  jobs="$(_job_tags)"
  [ -n "$jobs" ]
  [ "$(printf '%s\n' "$jobs" | grep -c '|')" -gt 0 ]
}

@test "gitlab-runner-tag-routing: jeder Job referenziert die Variable, kein Job traegt ein Literal" {
  if [ ! -f "$GL_YML" ]; then
    echo "erwartete Datei fehlt: $GL_YML" >&2
    false
  fi
  jobs="$(_job_tags)"
  [ -n "$jobs" ]

  offenders=""
  while IFS='|' read -r name tags_json; do
    [ -n "$name" ] || continue
    case "$tags_json" in
      '["$CI_RUNNER_TAG"]') : ;; # korrekt: verweist auf die Variable
      *) offenders="${offenders} ${name}=${tags_json}" ;;
    esac
  done <<< "$jobs"

  if [ -n "$offenders" ]; then
    echo "Job(s) ohne \$CI_RUNNER_TAG-Referenz:${offenders}" >&2
    false
  fi
}

@test "gitlab-runner-tag-routing: CI_RUNNER_TAG ist global mit dem self-hosted Tag vorbelegt" {
  if [ ! -f "$GL_YML" ]; then
    echo "erwartete Datei fehlt: $GL_YML" >&2
    false
  fi
  default_value="$(python3 - "$GL_YML" <<'PY'
import sys
import yaml

with open(sys.argv[1]) as fh:
    doc = yaml.safe_load(fh) or {}

print(str((doc.get("variables") or {}).get("CI_RUNNER_TAG", "")))
PY
)"
  [ "$default_value" = "bachelorprojekt-local" ]
}
