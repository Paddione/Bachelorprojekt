# Proposal: staged-task-requirement-restore

## Purpose (deutsch)

Das SSOT-Requirement `The Software Factory picks up staged task tickets` in
`openspec/specs/software-factory.md` wurde durch die Archivierung des Changes
`sf-scheduling-test-drift` (PR #4440) auf ein einziges Szenario reduziert — der MODIFIED-Delta
trug nur das neue Szenario + einen Erweiterungsparagrafen statt des vollständigen
Ersatztexts (OpenSpec-MODIFIED = full replacement). Sechs Szenarien (staged-task-Surfacing,
neu eingeführte Typen, Epics-Ausschluss, slots.sh-Claim, chore-Branch-Handling ×2) und die
Kern-Prosa (Exclusion statt Enumeration, kein `lastenheft_locked` für staged, chore-Branches
first-class) sind damit aus der SSOT verschwunden (591 → 586 Szenarien, comm-verifiziert).

Dieser Change stellt das vollständige Requirement wieder her **und behält das neue Szenario**
`queue.sh never surfaces is_test_data fixtures` (gültiger Zuwachs aus T005029). Zusätzlich wird
die Konvention „MODIFIED trägt den vollständigen Ersatztext" in `openspec/config.yaml`
dokumentiert, damit die Fehlerklasse nicht erneut entsteht (der mechanische Archive-Guard ist
separates Ticket T005310).

## Goals

- Requirement-Sektion in `openspec/specs/software-factory.md` wieder auf den vollständigen
  Stand bringen: Kern-Prosa (Pre-Stand 975b3295a) + 6 wiederhergestellte Szenarien + 1 neues
  Szenario (is_test_data-Ausschluss).
- BATS-Guard anlegen, der die Vollständigkeit der Sektion (alle 7 Szenario-Titel + Prosa-Anker)
  dauerhaft absichert — rot vor dem Fix, grün danach.
- Konventionsregel in `openspec/config.yaml` ergänzen: MODIFIED-Deltas tragen den
  vollständigen Ersatztext des Requirements (Prosa + alle Szenarien), kein additiver
  Partialtext.

## Non-Goals

- Kein mechanischer Archive-Guard (Szenario-Count-Vergleich beim `openspec.sh archive`) —
  das ist T005310.
- Keine Änderung an der Dispatch-Logik selbst (queue.sh/slots.sh/dispatcher-bridge) — der
  Verlust war rein dokumentarisch; das Verhalten ist unverändert.
- Keine Retrospektive weiterer Archiv-Changes auf Trunkierung — der Discover-Schritt liegt
  ebenfalls in T005310.

## Befund (T002448-M5: Symptom vs. Ursache)

- **Symptom:** `openspec/specs/software-factory.md` enthält nur noch 586 statt 591 Szenarien;
  die 6 fehlenden Szenario-Titel sind per `comm` gegen den Pre-Stand 975b3295a belegt.
- **Ursache (belegt):** Der Delta `openspec/changes/archive/2026-08-14-sf-scheduling-test-drift/
  specs/software-factory.md` interpretierte MODIFIED additiv („Die bestehenden Szenarien
  bleiben unverändert") — der Merge ersetzte die Sektion stattdessen vollständig
  (openspec-merge.mjs full-replacement-Semantik). Der Fehler liegt im Delta-Konzept, nicht in
  der Merge-Implementierung; die Implementierung von T005029 führte das fehlerhafte Delta
  lediglich aus.

## Belege

```bash
git show 975b3295a:openspec/specs/software-factory.md | grep -c '^#### Scenario'   # 591
git show origin/main:openspec/specs/software-factory.md | grep -c '^#### Scenario'  # 586
comm -23 <(git show 975b3295a:openspec/specs/software-factory.md | grep '^#### Scenario' | sort) \
         <(git show origin/main:openspec/specs/software-factory.md | grep '^#### Scenario' | sort)
```
