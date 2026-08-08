#!/usr/bin/env bats
# tests/spec/sdlc-isolation/e3-backup.bats
# SSOT: openspec/changes/e3-sdlc-tickets-lokal/tasks.md (T002626)
#
# PRUEFMODUS: command output verification [T002448-M4]. Die Sicherungsschritte
# werden ausgefuehrt (dry-run bzw. mit gestubbtem kubectl) und an ihrer Ausgabe
# gemessen. Der vollstaendige Restore-Nachweis gegen die echte Datenbank ist
# Teil des Cutover-Runbooks (`task sdlc:sdlc:restore-check`) — er braucht einen
# laufenden Cluster und gehoert deshalb nicht in die Offline-Suite.
#
# Run: tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-isolation/e3-backup.bats

setup() {
  REPO_ROOT="${REPO_ROOT:-$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)}"
  BACKUP="${REPO_ROOT}/scripts/sdlc/backup-tickets.sh"
  MIGRATE="${REPO_ROOT}/scripts/sdlc/migrate-tickets.sh"
}

# ── Richtung der Sicherung ──────────────────────────────────────────────────

@test "E3-Backup: sichert vom lokalen Cluster NACH fleet" {
  run bash "$BACKUP" run --dry-run
  [ "$status" -eq 0 ]
  # Quelle ist der lokale Stack …
  [[ "$output" == *"k3d-mentolder-dev"* ]]
  # … Ziel ist fleet. Die umgekehrte Richtung waere eine Sicherung der
  # Produktionsdaten auf der Workstation — das Gegenteil des Zwecks.
  [[ "$output" == *"-> fleet:"* ]]
}

@test "E3-Backup: verschluesselt, bevor etwas fleet erreicht" {
  # Ein unverschluesselter Dump waere die einzige Ausnahme im Bestand — der
  # vorhandene backup-cronjob verschluesselt jede Sicherung.
  run bash "$BACKUP" run --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *"openssl enc -aes-256-cbc"* ]]
}

@test "E3-Backup: Aufbewahrungsfrist ist konfigurierbar und wird genannt" {
  run env SDLC_BACKUP_RETENTION_DAYS=7 bash "$BACKUP" run --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *"7 Tage"* ]]
}

# ── Restore-Nachweis ────────────────────────────────────────────────────────

@test "E3-Backup: restore-check ist als eigener Befehl vorhanden" {
  # Ein Backup, das nie zurueckgespielt wurde, ist eine Vermutung (design.md D6).
  run bash "$BACKUP" restore-check --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *"Wegwerf-DB"* ]]
}

# ── Migrations-Nachweis ─────────────────────────────────────────────────────

@test "E3-Migration: restore ohne Dump bricht ab statt stillzuhalten" {
  run env SDLC_DUMP_DIR="${BATS_TEST_TMPDIR}/leer" bash "$MIGRATE" restore
  [ "$status" -ne 0 ]
  [[ "$output" == *"kein Dump gefunden"* ]]
}

@test "E3-Migration: preflight meldet ein nicht erreichbares Ziel als Fehler" {
  # Fail-loud statt stillem Ausweichen: ein Preflight, der bei fehlendem Ziel
  # 0 zurueckgibt, waere wertlos.
  run env SDLC_DST_CTX=gibt-es-nicht bash "$MIGRATE" preflight
  [ "$status" -ne 0 ]
  [[ "$output" == *"gibt-es-nicht"* ]]
}

# ── systemd-Units ───────────────────────────────────────────────────────────

@test "E3-Backup: Timer ist taeglich und holt Ausfaelle nach" {
  local timer="${REPO_ROOT}/scripts/sdlc/sdlc-backup.timer"
  [ -f "$timer" ]
  grep -q 'OnCalendar=' "$timer"
  grep -q 'Persistent=true' "$timer"
}

@test "E3-Backup: Unit ruft den run-Unterbefehl auf" {
  local unit="${REPO_ROOT}/scripts/sdlc/sdlc-backup.service"
  [ -f "$unit" ]
  grep -q 'backup-tickets.sh run' "$unit"
}
