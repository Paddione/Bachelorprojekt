---
title: "tcc-fixture-cleanup — Implementation Plan"
ticket_id: T002710
domains: [test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# tcc-fixture-cleanup — Implementation Plan

_Ticket: T002710_

## File Structure

```
tests/spec/dev-flow-plan/task-context.bats            # setup() gains orphan-reap of stale tcc-fixture-* dirs
tests/spec/dev-flow-plan/tcc-fixture-orphan-reap.bats  # new — failing test for the reap behavior
```

## Task 1 — RED: Failing-Test für verwaistes tcc-fixture-*-Verzeichnis

Lege `tests/spec/dev-flow-plan/tcc-fixture-orphan-reap.bats` an. Der Test:

1. Legt ein Fake-Waisenverzeichnis `openspec/changes/tcc-fixture-999999999/` mit einer
   Inhaltsdatei an und setzt dessen mtime per `touch -d '20 minutes ago'` in die Vergangenheit
   (simuliert einen abgebrochenen Lauf, dessen `teardown()` nie lief).
2. Legt als Positiv-Anker (T002356-M1) ein unabhängiges Verzeichnis
   `openspec/changes/_t002710-anchor-fixture/` mit Marker-Datei an, das NICHT dem
   `tcc-fixture-*`-Muster entspricht.
3. Löst `setup()` von `tests/spec/dev-flow-plan/task-context.bats` real aus, indem ein einzelner,
   schneller Test daraus per `bats -f "TCC-asm: --partial p3 liefert genau dessen impact_files"`
   als Subprozess läuft (Output-Verifikation — kein Grep auf den Quelltext).
4. Prüft danach per Dateisystem: das Waisenverzeichnis ist weg, der Positiv-Anker unangetastet.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/dev-flow-plan/tcc-fixture-orphan-reap.bats
# expected: FAIL (rot — setup() in task-context.bats raeumt noch keine fremden
# tcc-fixture-*-Verzeichnisse auf; das Fake-Waisenverzeichnis ueberlebt den Lauf)
```

## Task 2 — GREEN: Reap-Logik in setup() von task-context.bats

Erweitere `setup()` in `tests/spec/dev-flow-plan/task-context.bats` (aktuell Zeilen 5–31) um einen
Reap-Schritt, der **vor** dem `mkdir -p "$CHANGE_DIR"` läuft:

- Finde alle `openspec/changes/tcc-fixture-*`-Verzeichnisse **außer** dem für den aktuellen Lauf
  vorgesehenen `$CHANGE_DIR`, deren mtime älter als 10 Minuten ist:
  ```bash
  # [T002710-Nachtrag] MUSTER MIT ZIFFERN-SUFFIX: der Plan-Slug heisst selbst
  # tcc-fixture-cleanup. Ein blankes tcc-fixture-*-Muster loescht ihn beim
  # ersten Testlauf (Realunfall — Plan-Verzeichnis wurde aus git restauriert).
  # Echte Fixtures heissen immer tcc-fixture-<pid> (SLUG="tcc-fixture-$$").
  find "$REPO/openspec/changes" -maxdepth 1 -type d -name 'tcc-fixture-*[0-9]' -mmin +10 -print0 \
    | while IFS= read -r -d '' orphan; do
        case "$orphan" in
          */openspec/changes/tcc-fixture-*) rm -rf "$orphan" ;;
        esac
      done
  ```
  Der 10-Minuten-Schwellwert folgt demselben Muster wie `scripts/hooks/cleanup-tmp.sh`
  (`find /tmp -name "brainstorm-*" -mmin +60 -delete`) — hier deutlich enger, weil ein einzelner
  Testlauf Sekunden dauert; 10 Minuten sind reichlich Puffer gegen einen tatsächlich parallel
  laufenden Nachbarprozess, ohne echte Nebenläufigkeit zu gefährden.
- Der `case`-Guard ist identisch zu dem in `teardown()` (Zeile 36–38) — kein `rm -rf` außerhalb
  von `openspec/changes/tcc-fixture-*`.
- `$CHANGE_DIR` selbst wird von der `find`-Schleife nicht erfasst, solange der eigene
  `mkdir -p "$CHANGE_DIR"` erst NACH dem Reap-Schritt läuft (Reihenfolge beachten) — das eigene
  Verzeichnis existiert zu diesem Zeitpunkt noch nicht, `find` sieht es also gar nicht.

Nach der Änderung:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/dev-flow-plan/tcc-fixture-orphan-reap.bats
# grün erwartet — Waisenverzeichnis entfernt, Positiv-Anker unangetastet
tests/unit/lib/bats-core/bin/bats tests/spec/dev-flow-plan/task-context.bats
# grün erwartet — bestehende Suite bleibt unveraendert funktionsfaehig
```

## Verify (final)

- [ ] **Fix-Step (GREEN) abgeschlossen.** Beide oben genannten Testläufe grün.
- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
