---
title: Branch-Namens-Guard in `worktree-create.sh`
ticket_id: T002470
domains: [infra, test]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Branch-Namens-Guard in `worktree-create.sh`

Ticket: T002470 · Verwandt: T002240, T002409 (Mishap 2) · Spec-Delta gegen `divergence-guard`

## Problem

`scripts/worktree-create.sh` legt Worktrees für Branch-Namen an, die `.githooks/pre-commit`
(Zeilen 113–155) anschließend bei **jedem** Commit ablehnt. Der Fehler tritt dadurch maximal
weit von seiner Ursache entfernt auf:

1. `worktree-create.sh` akzeptiert den Namen kommentarlos.
2. Der Anker-Commit (T002412) läuft mit `--no-verify` — bewusst, weil er keine Dateien trägt —
   und umgeht den Hook. Der Worktree wirkt funktionsfähig.
3. Erst der erste inhaltliche Commit schlägt fehl.

Wer den Worktree danach von außen betrachtet, sieht über `git log` einen Branch mit Commit und
hält ihn für unbearbeitet-aber-intakt. Der Unterschied ist nur über `git status --porcelain`
sichtbar.

### Gemessener Umfang (2026-07-29)

4 von 13 aktiven Worktrees tragen einen Branch, den der Hook ablehnt:

| Branch | Verletzung |
|---|---|
| `chore/mishap-t002407` | Ticket-ID klein geschrieben |
| `chore/mishap-t002424` | Ticket-ID klein geschrieben |
| `chore/mishap-t002429` | Ticket-ID klein geschrieben |
| `feature/t2450-loc-gates-headroom` | Kurzform, 4-stellig, keine ID im Sinne der Regex |

Hinzu kommt der `plan_ref`-Branch von T002409 selbst: `chore/mishap-t002409`.

Zur Abgrenzung: `feature/t2250-mishap-docker-wsl-T002250` kommt durch — die Kurzform im Slug ist
unschädlich, solange die Großform als Suffix vorhanden ist.

### Warum der Fehler wiederkehrt

- **T002240** war derselbe Bug. Gefixt wurde er ausschließlich in
  `scripts/factory/auto-chore-plan.sh`; der Kommentar dort (Zeilen 92–95) beschreibt den
  Mechanismus wörtlich, inklusive „der ganze Schritt stirbt still".
- **T002409 Mishap 2** meldete ihn erneut, diesmal für das Präfix `feat/` statt `feature/`.

Beide Fixes saßen beim Aufrufer. Mindestens sieben Aufrufer bauen ihren Branch-Namen selbst
(`pr-refresh.sh`, `weekly-dep-schema-audit.sh`, `batch-workflow-gen.sh`, `eval-replay.mjs`,
`pipeline.mjs`, `vda/factory-prep.sh`, `auto-chore-plan.sh`). Die Regel steht nur im Hook — und
der läuft zuletzt.

### Zweitbefund: Mutation vor Validierung

Der Divergence-Guard (Zeilen 33–69) läuft **vor** der Argument-Zuweisung (Zeile 71) und führt
dabei `git stash push` (Zeile 43) und `git pull --rebase` (Zeile 48) aus. Bei einem ungültigen
Branch-Namen wird der Hauptcheckout also bereits mutiert, bevor irgendetwas geprüft wurde.
Argument-Validierung gehört vor jede Mutation.

## Lösung

Ein Guard in `worktree-create.sh` — dem einen Punkt, den alle Aufrufer passieren.

### Platzierung

Unmittelbar nach `set -euo pipefail` (Zeile 31), **vor** dem Divergence-Guard. Der Block liest
`$1` prüfend; die kanonischen Zuweisungen in Zeile 71/72 bleiben unverändert, damit der Eingriff
lokal bleibt. Folge: Bei ungültigem Namen wird weder gestasht noch gepullt noch ein Worktree
entfernt.

### Semantik

- Exit ≠ 0, keine Mutation, kein Verzeichnis.
- Die Meldung nennt die verletzte Bedingung **einzeln** (Typ-Präfix / Ticket-ID), nicht pauschal
  „verletzt die Konvention" — dieselbe Lehre, die T002375-p6 bereits im Hook gezogen hat.
- Sie schlägt den korrigierten Aufruf zum Kopieren vor: `t002407` → `T002407`, `feat/` →
  `feature/`. Ist keine Korrektur ableitbar, entfällt die Vorschlagszeile, statt zu raten.
- Exemptions identisch zum Hook: `main`, `develop`, `master`, `release-please--*`,
  `dependabot/*`, `renovate/*`.
- Bypass `WT_SKIP_NAME_CHECK=1` für den Notfall, analog zu `SKIP_BRANCH_CHECK=1` im Hook.
- Der Guard greift auch bei `BRANCH_EXISTS=1` — ein Commit auf einen bestehenden, falsch
  benannten Branch scheitert genauso.

### Verworfene Alternative: automatische Korrektur

Eine stille Umbenennung (`t002407` → `T002407`) wäre verlockend, weil die Absicht eindeutig ist.
Sie lässt aber den Aufrufer divergieren: `auto-chore-plan.sh` hält `$branch` in einer Variablen
und verwendet sie danach für Commit und Push. Ein abweichend benannter Branch würde dort ins
Leere zeigen. Der Pfad-Redirect aus T001936 darf das, weil ein Pfad danach nicht weiterverwendet
wird; ein Branch-Name wird es.

## Duplikation statt gemeinsamer Lib

Die Regel steht nach dem Fix an zwei Stellen. Eine gemeinsame Funktion in `scripts/lib/` wäre die
DRY-Antwort, wird hier aber bewusst nicht gewählt: Der `pre-commit`-Hook hat heute keine einzige
Abhängigkeit auf eine Repo-Datei. Bekäme er eine, würde eine fehlende oder beschädigte Lib-Datei
**jeden** Commit blockieren — an dieser Stelle ist Robustheit mehr wert als Redundanzfreiheit.

Stattdessen sichert ein Drift-Guard-Test die Übereinstimmung: Er schickt dieselbe Tabelle von
Branch-Namen durch beide Implementierungen und schlägt fehl, sobald die Urteile divergieren.
Damit ist der Drift beobachtbar statt strukturell ausgeschlossen — das Instrument, das dieses
Repo für vergleichbare Fälle bereits nutzt.

## Tests

| Test | Zweck |
|---|---|
| RED-Test | `worktree-create.sh chore/mishap-t002407 …` muss Exit ≠ 0 liefern und **kein** Verzeichnis hinterlassen. Schlägt vor der Implementierung fehl. |
| Positiv-Anker | Ein konventionskonformer Name legt weiterhin einen Worktree an — verhindert einen vakuos bestehenden Negativtest (T002356-M1). |
| Exemptions | `main` und `renovate/*` passieren den Guard. |
| Bypass | `WT_SKIP_NAME_CHECK=1` lässt einen verletzenden Namen durch. |
| Drift-Guard | Namenstabelle durch Hook-Regel und Skript-Regel; divergierende Urteile schlagen fehl. |
| Keine Mutation | Bei Ablehnung wurde nicht gestasht und kein Worktree entfernt (Zweitbefund). |

Ort: `tests/spec/divergence-guard/branch-name-guard.bats` — ein Verzeichnis pro SSOT-Spec, eine
Datei pro Vorgang (T002416). Runner: `tests/unit/lib/bats-core/bin/bats`.

## Spec-Delta

Gegen `openspec/specs/divergence-guard.md`. Dessen Purpose („Erkennt und meldet Abweichungen
zwischen deklariertem Soll-Zustand und Ist-Zustand im Repository") und dessen erstes Requirement
(„Divergence check before worktree creation", fail-fast mit Exit ≠ 0) decken diesen Fall
inhaltlich ab: Ein konventionswidriger Branch-Name ist eine Abweichung zwischen Soll und Ist.

## Nicht Teil dieses Vorgangs

- **Aufräumen der vier bestehenden kaputten Worktrees.** Sie sind sauber (0 dirty, 0 staged);
  es liegt keine Arbeit fest. Gehört zu `repo-hygiene`.
- **Härtung der einzelnen Aufrufer.** Der Engpass genügt; alles andere wäre genau die
  Duplikation, aus der dieses Problem entstanden ist.

## Offener Punkt

Die Scaffold-Commits auf den kleingeschriebenen Branches (`chore(plans): scaffold mishap-t002407
plan [T002407]`) sind durchgekommen, obwohl der Hook ausführbar ist, `core.hooksPath` im Worktree
korrekt gesetzt ist und alle `exit`-Statements vor dem Branch-Check Fehlerpfade sind. Die
wahrscheinlichste Erklärung ist ein `--no-verify` der jeweiligen Agent-Session; belegt ist sie
nicht. Der Fix hängt nicht davon ab — er verhindert, dass solche Branches überhaupt entstehen.
