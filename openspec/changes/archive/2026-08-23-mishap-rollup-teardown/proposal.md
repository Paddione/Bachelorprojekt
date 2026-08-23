# Proposal: mishap-rollup-teardown

## Why

Der Mishap-Rollup-Automat erzeugt sich selbst neu. `factory.timer` (aktiv, ~5 min) ruft
`scripts/factory/wakeup.sh:299` unbedingt `mishap-rollup.sh` auf; das löst
`scripts/ticket.sh rollup-container` aus, dessen Step 1 keinen offenen Container findet und dessen
Step 2 (`scripts/ticket.sh:1049`) daraufhin **einen neuen anlegt**. Das manuelle Entfernen des
Containers ist damit die Auslösebedingung für den nächsten — genau das wurde beobachtet.

Der Automat leistet dabei nicht, wofür er gebaut wurde. Über vier Zyklen
(`T013328` → `T013784` → `T013893` → `T013894`) wurde derselbe einzige Eintrag weitergereicht, ohne
je disponiert zu werden: `rollup-carryover.sh` liest ausschliesslich den Repository-HEAD, die
Zwischenpläne lagen branch-lokal. Der Eintrags-Parser hat zusätzlich Plan-Checkboxen als Befunde
ausgeleitet — `T013420`, `T013421`, `T013422`, `T013680`, `T013737`, `T013882` tragen Titel wie
`[Rollup] - [ ] **1. Failing test (RED).** Add`, alle mit `attention_mode=needs_human`. Vier
unabhängige Reparaturversuche am selben Automaten sind bereits gescheitert: `T013316` (Parser),
`T013843` (zweiter Guard gegen denselben Fehler), `T013305` (Eskalation/Watchlist), `T013919`
(ID-Validierung).

Messung gegen `origin/main` bei `0d56ca413` (2026-08-23):

```bash
# Stand, gegen den gemessen wurde
PRE=0d56ca413
git -C . ls-tree -r --name-only "$PRE" -- scripts/factory | grep -E 'rollup|mishap' | xargs wc -l | tail -1   # 1317
git -C . ls-tree -r --name-only "$PRE" -- tests/spec/mishap-rollup | xargs wc -l | tail -1                    # 1646
git show "$PRE:openspec/specs/mishap-rollup.md" | wc -l                                                       # 424
git ls-tree --name-only "$PRE" openspec/changes/ | grep -c mishap-incident-rollup                             # 6
```

Rund 3.700 Zeilen tragen einen Automaten, der in vier Zyklen null Befunde disponiert hat.

## What

Der Rollup-**Automat** wird vollständig entfernt. Die Mishap-**Erfassung** bleibt: nicht-kritische
Mishaps werden künftig als Kommentar an das Ticket geschrieben, bei dessen Bearbeitung sie
auftraten. Der Incident-Pfad (`incident`/`broken`/`security` → je ein Ticket) bleibt unverändert.

Entfernt werden:

- `scripts/factory/mishap-rollup.sh`, `rollup-carryover.sh`, `rollup-plan-tasks.sh`,
  `rollup-archive-janitor.sh`, `rollup-recurrence.sh`, `rollup-publish.sh`,
  `mishap-rollup-artifacts.sh` (7 Dateien, 1.317 Zeilen)
- der Aufruf in `scripts/factory/wakeup.sh:299`
- `cmd_rollup_container` samt Autocreate in `scripts/ticket.sh`
- `ROLLUP_BRANCH`, `ROLLUP_CHANGE_DIR` und der Container-Lookup in
  `scripts/ticket-mcp/go/internal/tools/mishap.go`
- `tests/spec/mishap-rollup/` (21 Dateien, 1.646 Zeilen)
- `openspec/specs/mishap-rollup.md` (18 Requirements)

Ersetzt wird:

- `scripts/hooks/mishap-tracker.sh` schreibt nicht-kritische Mishaps als Ticket-Kommentar statt in
  den Rollup-Buffer. Ohne Ticket-Kontext wird der Mishap protokolliert und verworfen, statt einen
  Container zu erzeugen.

Aufgeräumt wird im selben Zug:

- die 6 verwaisten `openspec/changes/mishap-incident-rollup-2026-08-22-*`-Verzeichnisse
- Worktree `.worktrees/mishap-incident-rollup-2026-08-22-T013914-reuse` und sein Branch
- das zuletzt erzeugte Container-Ticket

## Verworfene Alternativen

- **Carry-over-Scan branch-lokale Pläne lesen lassen** — repariert einen von vier Defekten und
  vergrössert das Subsystem. Vier Reparaturen am selben Automaten sind bereits gescheitert.
- **Nur den Autocreate in `ticket.sh:1049` entfernen** — `mishap-rollup.sh` behandelt einen fehlenden
  Container als harten Fehler (`exit 1`) und würde bei jedem Tick lärmen. Still kaputt statt
  abwesend.
- **`factory.timer` abschalten** — viel zu breit; der Timer treibt die gesamte Factory. Der
  chirurgische Schnitt ist der Aufruf in `wakeup.sh:299`.

_Ticket: T014104_
