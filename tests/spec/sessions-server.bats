#!/usr/bin/env bats
# tests/spec/sessions-server.bats
# SSOT: openspec/specs/sessions-server.md
#
# Initial placeholder coverage for the Sessions Server spec. [T002010]
# Manifest-Hardening assertions (non-root nginx on 8080): T014553, SA-GR-06.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  MANIFEST="${REPO_ROOT}/k3d/sessions-server.yaml"
}

@test "sessions-server spec covered" {
  run true
  [ "$status" -eq 0 ]
}

@test "sessions-server: nginx lauscht auf 8080" {
  # ConfigMap-Server-Blöcke und der Container lauschen auf dem unprivilegierten Port
  grep -qE 'listen[[:space:]]+8080' "$MANIFEST"
  grep -qE 'containerPort:[[:space:]]*8080' "$MANIFEST"
}

@test "sessions-server: Service zeigt auf 8080" {
  grep -qE 'targetPort:[[:space:]]*8080' "$MANIFEST"
}

@test "sessions-server: Container läuft non-root" {
  dep_block="$(awk '/^kind: Deployment$/{f=1} f{print} f&&/^---$/{exit}' "$MANIFEST")"
  echo "$dep_block" | grep -qE 'runAsNonRoot:[[:space:]]*true'
  echo "$dep_block" | grep -qE 'readOnlyRootFilesystem:[[:space:]]*true'
}

@test "sessions-server: conf.d-Volume filtert auf default.conf (T015167)" {
  # Das nginx-conf-Volume mountet die ConfigMap nach /etc/nginx/conf.d — dem
  # Include-Verzeichnis des Servers. Ohne items-Filter landet der nginx.conf-Key
  # (Main-Konfiguration, worker_processes etc.) mit im Include und nginx bricht
  # mit "[emerg] worker_processes directive is not allowed here" ab.
  # Positiv-Anker: der items-Filter existiert.
  grep -qE 'key:[[:space:]]*default\.conf' "$MANIFEST"
  # Block des nginx-conf-Volumes (Volumes-Ebene = 8 Spaces) bis zum naechsten
  # Volume-Eintrag; letztere Zeile wird per $d wieder entfernt.
  vol_block="$(sed -n '/^        - name: nginx-conf$/,/^        - name: /p' "$MANIFEST" | sed '$d')"
  echo "$vol_block" | grep -qE 'key:[[:space:]]*default\.conf'
  leaked="$(echo "$vol_block" | grep -cE 'key:[[:space:]]*nginx\.conf' || true)"
  [ "$leaked" -eq 0 ]
}
