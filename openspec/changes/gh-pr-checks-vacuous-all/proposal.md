# Proposal: gh-pr-checks-vacuous-all

## Why

Ein jq-Prädikat der Form `gh pr checks <n> --json bucket --jq 'all(.bucket != "pending")'`
liefert über der **leeren** Liste `true`. Das ist korrekte jq-Semantik (`all` über der leeren
Menge ist wahr), aber die auswertende Schleife liest daraus „keine Checks mehr pending" und
bricht ab. Der Zustand liest sich als „CI durchgelaufen", während nie eine Prüfung
stattgefunden hat.

Beobachtet 2026-08-09 an PR #4050 (ticket-ops-Welle 1, Einheit B): Der PR stand auf
`mergeStateStatus=DIRTY`. Ein konfligierender PR startet die CI gar nicht erst — die
Checkliste bleibt leer. Nach einem Rebase erschienen 15 Checks.

T002822 (im selben Lauf behoben) deckt den Fall **nicht**: dort geht es um die *manuelle*
Fehllesart einer leeren Checkliste, und `.claude/skills/references/repo-hygiene-ops.md` §3
enthält keine Stelle zu `all(...)` oder zum vakuosen Wahrheitswert. Die automatisierte
Variante ist die schärfere: bei der manuellen Lesart sieht man wenigstens die leere Liste,
bei der Warteschleife sieht man nur `true`.

## What

Die Nichtleere-Bedingung wird zur harten Vorbedingung jedes Check-Listen-Urteils:

1. **Gemeinsame Auswertung** `scripts/lib/ci-checks.sh` mit `ci_checks_verdict` — liest eine
   Check-Liste (JSON-Array) von stdin, gibt genau ein Verdict aus
   (`empty | red | pending | green`) und terminiert nur bei `green` mit Exit 0. Die leere
   Liste ist ein eigener Zustand, weder Erfolg noch Rot.
2. **`scripts/factory/pr-babysit-ticket.sh`** nutzt die Funktion und terminiert bei dauerhaft
   leerer Checkliste mit Diagnose statt ohne Fortschritt weiterzudrehen (heute belegt: die
   Schleife läuft unbegrenzt, siehe RED-Test).
3. **Doku-Regel** in `repo-hygiene-ops.md` §3 und `ci-fix-loop.md`: jedes Prädikat über einer
   womöglich leeren Menge braucht eine vorgeschaltete Nichtleere-Prüfung — dieselbe Struktur
   wie die Positiv-Anker-Pflicht bei Negativtests (T002356-M1).

**Nicht im Scope:** `scripts/devflow-ci-watch.sh` (trägt den Guard bereits via `total_count`,
ci-cd.md „CI-Watch ist fail-closed bei null vorhandenen Checks") und
`scripts/arbitration/detect.sh` (trägt ihn via `length == 0`). Beide werden nur dokumentiert
als Referenzmuster genannt, nicht umgebaut.

_Ticket: T003109_
