#!/usr/bin/env bats
# tests/spec/dev-flow-plan/tcc-fixture-orphan-reap.bats
# T002710 — task-context.bats' teardown() only fires if the process that created the
# fixture survives to run it. An aborted run (WSL crash, session kill, systemd
# timeout) leaves openspec/changes/tcc-fixture-<pid>/ behind as a 0-byte leftover in
# the tracked working tree. setup() must reap such orphans on the NEXT run instead of
# relying on the dying process' own teardown().
#
# Pruefmodus: OUTPUT-VERIFIKATION (T002448-M4). We run the real
# tests/spec/dev-flow-plan/task-context.bats suite as a subprocess (a single fast test
# via `bats -f`, which triggers its setup()) and check the filesystem state afterwards
# — no grep against the implementation source.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  BATS_BIN="$REPO/tests/unit/lib/bats-core/bin/bats"
  TCC_FILE="$REPO/tests/spec/dev-flow-plan/task-context.bats"
  STALE_DIR="$REPO/openspec/changes/tcc-fixture-999999999"
  ANCHOR_DIR="$REPO/openspec/changes/_t002710-anchor-fixture"
  # [T003025] Seit dem Archivieren des T002710-Plans (2026-08-09, Commit 0a23ae709)
  # existiert openspec/changes/tcc-fixture-cleanup nicht mehr im Arbeitsbaum — der
  # Test legt sein Negativ-Fixture (tcc-fixture-* OHNE Ziffern-Suffix) jetzt selbst an,
  # statt sich auf einen committeten, vergaenglichen Plan zu stuetzen. Der Aussagekern
  # bleibt: der Reaper darf Verzeichnisse im tcc-fixture-*-Muster ohne Ziffern-Suffix
  # nicht anfassen.
  PLAN_LIKE_DIR="$REPO/openspec/changes/tcc-fixture-cleanup"
}

teardown() {
  rm -rf "$STALE_DIR" "$ANCHOR_DIR" "$PLAN_LIKE_DIR"
}

@test "TCC-reap: verwaistes tcc-fixture-* Verzeichnis wird beim naechsten setup() entfernt" {
  rm -rf "$STALE_DIR"
  mkdir -p "$STALE_DIR"
  echo "leftover" > "$STALE_DIR/leftover.txt"
  # mtime > 10 Minuten in die Vergangenheit setzen, damit die Reap-Schwelle greift —
  # ein wirklich paralleler, laufender Nachbarprozess waere juenger und bliebe verschont.
  touch -d '20 minutes ago' "$STALE_DIR"

  # Positiv-Anker (T002356-M1): ein Verzeichnis AUSSERHALB des tcc-fixture-*-Musters
  # bleibt unangetastet — sonst waere die Negativ-Aussage unten vakuos.
  rm -rf "$ANCHOR_DIR"
  mkdir -p "$ANCHOR_DIR"
  echo "keep me" > "$ANCHOR_DIR/marker.txt"

  # Zweiter Positiv-Anker: tcc-fixture-*-Verzeichnis OHNE Ziffern-Suffix (Plan-Slug-
  # Muster aus T002710). Wird ebenfalls selbst angelegt, siehe setup().
  rm -rf "$PLAN_LIKE_DIR"
  mkdir -p "$PLAN_LIKE_DIR"
  echo "keep me" > "$PLAN_LIKE_DIR/marker.txt"

  # Ein einzelner, schneller Test aus task-context.bats reicht, um dessen setup()
  # auszuloesen — er braucht kein plan-intel.sh-Generatorlauf, nur die vorhandene
  # intel.json aus der Fixture.
  run "$BATS_BIN" -f "TCC-asm: --partial p3 liefert genau dessen impact_files" "$TCC_FILE"
  [ "$status" -eq 0 ] || { echo "Trigger-Test fehlgeschlagen: $output"; false; }

  [ ! -d "$STALE_DIR" ] || { echo "verwaistes tcc-fixture-Verzeichnis wurde NICHT entfernt: $STALE_DIR"; false; }
  [ -f "$ANCHOR_DIR/marker.txt" ] || { echo "Positiv-Anker wurde faelschlich entfernt: $ANCHOR_DIR"; false; }
  # Zweiter Positiv-Anker (T002710-Nachtrag): ein Verzeichnis im
  # tcc-fixture-*-Muster OHNE Ziffern-Suffix — genau der Plan-Slug
  # tcc-fixture-cleanup — bleibt unangetastet. Der erste Entwurf des
  # Reap-Schritts nutzte ein blankes tcc-fixture-*-Muster und loeschte
  # damit beim Testlauf den gestagten Plan (Realunfall, aus git restauriert).
  [ -f "$PLAN_LIKE_DIR/marker.txt" ] || { echo "Plan-Slug-aehnliches Verzeichnis wurde entfernt: $PLAN_LIKE_DIR"; false; }
}
