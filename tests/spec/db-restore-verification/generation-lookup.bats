#!/usr/bin/env bats
# Generation-Suche im db-restore-verify-Script [T901104].
#
# Prüfmodus: Verhalten. Der `LATEST=$(find …)`-Ausdruck wird aus dem Manifest
# gezogen und gegen ein Testverzeichnis ausgeführt. Defekt: `find -regex` mit
# `\{8\}` in der Default-Syntax (emacs) von GNU find matcht nie; der Job meldete
# auf Prod und Staging immer "no backup generation found", obwohl Generationen
# auf dem PVC lagen.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  MANIFEST="${REPO_ROOT}/k3d/backup-restore-verify-cronjob.yaml"
  BACKUPS="$(mktemp -d)"
}

teardown() {
  rm -rf "$BACKUPS"
}

# Gibt den LATEST=$(find …)-Ausdruck aus, auf das Testverzeichnis umgebogen.
# `$$` ist im Manifest die Laufzeit-Escape des Flux-Renderers (T002306).
_latest_expr() {
  yq 'select(.kind == "CronJob") | .spec.jobTemplate.spec.template.spec.containers[0].args[0]' "$MANIFEST" \
    | awk '/LATEST=\$\(find /{f=1} f{print} f&&/\)[[:space:]]*$/{exit}' \
    | sed -e 's/\$\$/$/g' -e "s#/backups#${BACKUPS}#g"
}

@test "T901104: Generation-Suche findet die neueste Stempel-Generation" {
  expr="$(_latest_expr)"
  [ -n "$expr" ] || { echo "LATEST=\$(find …) nicht im Manifest gefunden"; return 1; }

  mkdir -p "$BACKUPS/20261006-000059" "$BACKUPS/20261007-202706" "$BACKUPS/pvc-20261007-010007"
  eval "$expr"
  [ "$(basename "${LATEST:-}")" = "20261007-202706" ] \
    || { echo "erwartet 20261007-202706, gefunden: '${LATEST:-}'"; echo "$expr"; return 1; }
}

@test "T901104: pvc-Generationen und fremde Verzeichnisse zaehlen nicht" {
  expr="$(_latest_expr)"
  [ -n "$expr" ] || { echo "LATEST=\$(find …) nicht im Manifest gefunden"; return 1; }

  mkdir -p "$BACKUPS/20261006-000059" "$BACKUPS/pvc-20991231-235959" "$BACKUPS/lost+found"
  eval "$expr"
  # Positiv-Anker: die gültige Generation muss gefunden werden, sonst wäre der
  # Ausschluss vakuos erfüllt.
  [ "$(basename "${LATEST:-}")" = "20261006-000059" ] \
    || { echo "erwartet 20261006-000059, gefunden: '${LATEST:-}'"; return 1; }
}
