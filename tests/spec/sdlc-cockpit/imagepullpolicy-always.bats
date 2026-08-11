#!/usr/bin/env bats
# tests/spec/sdlc-cockpit/imagepullpolicy-always.bats
# T003740: Der lokale SDLC-Stack lief 44 h hinter main, weil imagePullPolicy
# IfNotPresent auf dem :latest-Image den Kubelet am Nachziehen hinderte —
# solange das Image lokal vorhanden ist, bleibt der Pod auf dem ersten Pull
# stehen. imagePullPolicy: Always ist die kanonische Wahl fuer :latest-Images.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  SDLC_CONSOLE_YAML="$REPO_ROOT/k3d/sdlc-stack/sdlc-console.yaml"
}

@test "T003740: sdlc-console nutzt imagePullPolicy Always auf dem :latest-Image" {
  [ -f "$SDLC_CONSOLE_YAML" ] || { echo "MISSING: $SDLC_CONSOLE_YAML"; return 1; }

  # POSITIV-ANKER: Das Deployment existiert ueberhaupt und referenziert :latest.
  # Ohne den Anker waere die Negativaussage (kein IfNotPresent) vakuos, wenn das
  # Manifest umgebaut oder verschoben wuerde.
  grep -q "name: sdlc-console" "$SDLC_CONSOLE_YAML" \
    || { echo "FAIL: Deployment sdlc-console nicht in $SDLC_CONSOLE_YAML"; return 1; }
  grep -q "ghcr.io/paddione/website-sdlc:latest" "$SDLC_CONSOLE_YAML" \
    || { echo "FAIL: kein :latest-Image in $SDLC_CONSOLE_YAML"; return 1; }

  # Der eigentliche Gegenstand: Kein IfNotPresent auf dem sdlc-console-Image.
  # Bewusst `run grep` statt `! grep -q`: POSIX schaltet set -e ab, sobald der
  # Rueckgabewert mit `!` invertiert wird — eine Assertion der Form `! grep -q`
  # kann einen bats-Test nie rot machen. (T002448-Konvention)
  run grep "imagePullPolicy:" "$SDLC_CONSOLE_YAML"
  [ "$status" -eq 0 ] || { echo "FAIL: kein imagePullPolicy-Feld im sdlc-console-Manifest"; return 1; }
  run grep -E "imagePullPolicy:[[:space:]]*IfNotPresent" "$SDLC_CONSOLE_YAML"
  [ "$status" -ne 0 ] || { echo "FAIL: imagePullPolicy IfNotPresent in $SDLC_CONSOLE_YAML"; return 1; }
}
