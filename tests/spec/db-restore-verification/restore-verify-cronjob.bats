#!/usr/bin/env bats
# Guard für den db-restore-verify CronJob [T014544 / G-DB05].
#
# Prüfmodus: gemischt. Die Existenz- und Struktur-Zusicherungen manifestieren
# sich im Manifest selbst — dafür sind YAML-Strukturprüfungen das angemessene
# Mittel (Ausnahme der Test-Resultats-Konvention T002448-M4, dokumentiert).
# Das eingebettete Shell-Script wird zusätzlich per `bash -n` syntaktisch
# geprüft (output/exit-code-Verifikation).
#
# RED bei Auslieferung des Plans: Das Manifest existiert noch nicht.
#
# Run: tests/unit/lib/bats-core/bin/bats tests/spec/db-restore-verification/

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  K3D="${REPO_ROOT}/k3d"
  MANIFEST="${K3D}/backup-restore-verify-cronjob.yaml"
}

@test "T014544: restore-verify cronjob exists with weekly schedule (Positiv-Anker)" {
  [ -f "$MANIFEST" ] || { echo "Manifest fehlt: $MANIFEST" >&2; return 1; }
  kind="$(yq 'select(.kind == "CronJob") | .kind' "$MANIFEST")"
  [ "$kind" = "CronJob" ] || { echo "kein CronJob im Manifest" >&2; return 1; }
  schedule="$(yq 'select(.kind == "CronJob") | .spec.schedule' "$MANIFEST")"
  [ "$schedule" = "30 3 * * 0" ] || { echo "unerwarteter Schedule: $schedule" >&2; return 1; }
}

@test "T014544: restore script restores into disposable DBs and drops them afterwards" {
  script="$(yq 'select(.kind == "CronJob") | .spec.jobTemplate.spec.template.spec.containers[0].args[0]' "$MANIFEST")"
  [ -n "$script" ] && [ "$script" != "null" ] || { echo "kein Script eingebettet" >&2; return 1; }

  # Restore in Wegwerf-DB (Prefix restore_verify_), kein Zugriff auf Produktivdaten
  printf '%s' "$script" | grep -q 'restore_verify_' || { echo "keine Wegwerf-DB-Prefix" >&2; return 1; }

  # Aufräumen: DROP DATABASE muss vorhanden sein (auch IF EXISTS genügt)
  printf '%s' "$script" | grep -q 'DROP DATABASE' || { echo "kein DROP DATABASE (Akkumulations-Gefahr)" >&2; return 1; }

  # Evidence-Protokollierung: JSONL-Log auf PVC
  printf '%s' "$script" | grep -q 'restore-verification.jsonl' || { echo "kein G-DB05-Evidence-Log" >&2; return 1; }
}

@test "T014544: embedded restore script is syntactically valid bash" {
  script="$(yq 'select(.kind == "CronJob") | .spec.jobTemplate.spec.template.spec.containers[0].args[0]' "$MANIFEST")"
  [ -n "$script" ] && [ "$script" != "null" ] || { echo "kein Script eingebettet" >&2; return 1; }
  run bash -c 'printf "%s" "$1" | bash -n' _ "$script"
  [ "$status" -eq 0 ] || { echo "bash -n failed: $output" >&2; return 1; }
}

@test "T014544: cronjob is wired into the base kustomization" {
  entry="$(grep -c 'backup-restore-verify-cronjob.yaml' "${K3D}/kustomization.yaml")"
  [ "$entry" -ge 1 ] || { echo "Manifest nicht in k3d/kustomization.yaml eingehängt" >&2; return 1; }
}
