---
title: "fix-devflow-ciwatch-ticket-path — Implementation Plan"
ticket_id: T006370
domains: [ci-cd]
status: planning
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# fix-devflow-ciwatch-ticket-path — Implementation Plan

_Ticket: T006370_

## File Structure

| Datei | Ist | Budget |
|-------|-----|--------|
| `scripts/devflow-ci-watch.sh` | 197 | 603 (Limit 800, nicht baselined) |
| `tests/spec/ci-cd/devflow-ciwatch-ticket-path.bats` | neu | kein S1-Limit (.bats nicht gerated) |
| `tests/spec/ci-cd/devflow-ci-watch-merged-exit.bats` | 165 | kein S1-Limit (.bats nicht gerated) |
| `openspec/changes/fix-devflow-ciwatch-ticket-path/specs/ci-cd.md` | neu | Delta-Spec |
| `openspec/changes/fix-devflow-ciwatch-ticket-path/specs/mishap-t002242.md` | neu | Delta-Spec |

## Task 1: RED — Failing Test liegt vor und ist rot

Der Guard-Test `tests/spec/ci-cd/devflow-ciwatch-ticket-path.bats` (liegt bereits im
Branch vor, wurde im Plan-Commit eingebracht) verifiziert, dass er auf dem aktuellen
Stand rot ist: Das Skript ruft `./scripts/ticket.sh` relativ zum cwd auf und übersetzt
den Umgebungsfehler in Exit 6 mit falscher „Phase-Chain nicht vollständig"-Behauptung.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/devflow-ciwatch-ticket-path.bats
# expected: FAIL (red — cwd-abhängiger Aufruf existiert noch)
```

Die Testdatei führt das Skript aus einem cwd OHNE `scripts/` aus (Fake-gh über
Marker-Dateien, Fake-ticket.sh über den `TICKET_SH`-Override; Muster:
`devflow-ci-watch-merged-exit.bats`) und prüft Exit-Codes, den Marker-Output des
Fake-ticket.sh und format-freie Substrings (Output-Verifikation nach T002448-M4,
Semantik nach T002716):

1. MERGED-Pfad erreicht assert-phase-chain cwd-unabhängig (erwartet Exit 0, Marker vorhanden).
2. Nachgewiesene Chain-Verletzung (Fake exit 1) endet mit Exit 6 und der Meldung
   „Phase-Chain nicht vollständig" (Gate bleibt, Spec M1).
3. Nicht erreichbares Ticket-Tool (toter `TICKET_SH`-Pfad) endet mit Exit 7 und
   „nicht erreichbar"-Meldung (Worktree-Remove-Szenario).
4. Grüner Pfad (alle Checks grün) erreicht assert-phase-chain cwd-unabhängig (Exit 0).
5. Statischer Guard: kein relativer `./scripts/ticket.sh`-Aufruf mehr im Skript
   (einzige grep-Ausnahme — die toleranten phase-Aufrufe sind nur im Quelltext
   beobachtbar; im Header der Testdatei dokumentiert).

## Task 2: GREEN — cwd-unabhängige ticket.sh-Auflösung und Guard in devflow-ci-watch.sh

Ergänze in `scripts/devflow-ci-watch.sh` nach den Argument-Parsings (nach
`MAX_CI_ATTEMPTS`-Zeile) die Skript-Speicherort-Auflösung:

```bash
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)" || exit 2
TICKET_SH="${TICKET_SH:-$SCRIPT_DIR/ticket.sh}"
```

Stelle alle vier `./scripts/ticket.sh`-Aufrufe (phase vor den Preflights, phase im
Poll-Loop, assert-phase-chain im MERGED-Preflight und im grünen Pfad) auf
`"$TICKET_SH"` um.

Füge VOR beiden `assert-phase-chain`-Aufrufen denselben Guard ein:

```bash
if [[ ! -x "$TICKET_SH" ]]; then
  echo "⚠ ticket.sh nicht erreichbar ($TICKET_SH) — Phase-Chain kann nicht verifiziert werden (Worktree entfernt?)." >&2
  exit 7
fi
if ! "$TICKET_SH" assert-phase-chain --id "$TICKET_ID"; then
  echo "❌ Phase-Chain nicht vollständig — siehe Meldungen oben." >&2
  exit 6
fi
```

Semantik: Exit 6 bleibt exklusiv für eine nachgewiesene Chain-Verletzung (Spec M1
unverändert); Exit 7 trennt den Umgebungsfehler „Tool nicht erreichbar" (fail-closed,
kein grüner Exit ohne Verifikation). Die `phase`-Aufrufe bleiben `|| true`-tolerant.

## Task 3: GREEN — Bestandstests auf TICKET_SH-Override umstellen

`tests/spec/ci-cd/devflow-ci-watch-merged-exit.bats` schmuggelt sein Fake-ticket.sh als
`$WORK/scripts/ticket.sh` ins cwd — nach Task 2 trifft der Aufruf das echte ticket.sh
(DB-Zugriff). Setze in allen vier `run env -C "$WORK"`-Aufrufen der Datei
`TICKET_SH="$WORK/scripts/ticket.sh"` explizit, damit das Fake weiterhin greift:

```bash
run env -C "$WORK" TICKET_SH="$WORK/scripts/ticket.sh" PATH="$WORK/bin:$PATH" \
  bash "$SCRIPT" T999999 "https://github.com/x/y/pull/1"
```

Verhalten und Assertions der Bestandstests (T002671, T003612) bleiben unverändert —
sie testen weiter dasselbe Verhalten, nur mit explizitem Fake-Pfad.

## Task 4: Verify — Tests grün und Gates sauber

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/devflow-ciwatch-ticket-path.bats tests/spec/ci-cd/devflow-ci-watch-merged-exit.bats
# expected: PASS (green — alle 9 Tests grün, inkl. Bestandstests auf Override umgestellt)
```

Danach die drei mandatory Verify-Commands:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

- Nach der Test-Änderung `task test:inventory` regenerieren und
  `website/src/data/test-inventory.json` mitcommitten (CI-Inventar-Check failt sonst).
- `bash scripts/openspec.sh validate` muss grün sein (Delta-Spec-Konvention T001304:
  `specs/ci-cd.md` nach dem Parent-SSOT-Slug benannt; zweite Delta-Datei
  `specs/mishap-t002242.md` für die Exit-7-Ergänzung).
- Positiv-Anker Gegenprobe: Reproducer aus `proposal.md` (cwd ohne scripts/, Fake-gh mit
  `state=MERGED`) endet nach dem Fix mit Exit 0 statt Exit 6.
