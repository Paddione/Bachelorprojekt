# Proposal: stage-plan-touched-files-T002446

## Why

`tickets.tickets.touched_files` speist die Kollisionsprüfung in `scripts/factory/conflict-check.sh`
(`AND t.touched_files IS NOT NULL`, Zeile 138). Gesetzt wird die Spalte heute an zwei Stellen:
in der Factory-Scout-Phase (`scripts/factory/pipeline-runner.js:88`, `pipeline.mjs:232`) und in
`dev-flow-execute` Schritt 1.5. Der zweite Pfad ist konditional formuliert:

> „Falls der Plan die berührten Dateien kennt, registriere sie für die Conflict-Gate"
> — `.claude/skills/references/dev-flow-execute-phases.md:228`

Der Plan kennt sie immer. `## File Structure` direkt nach der H1 ist eine plan-lint Hard Rule
(STRUCT1) — kein Plan passiert das Gate ohne sie. Die Information liegt also bereits zum Zeitpunkt
des `stage-plan` zwingend vor; ob sie in die Datenbank gelangt, hängt aber daran, dass ein Agent
später einen als optional formulierten Prosa-Schritt ausführt.

Live-Beleg vom 2026-07-28: T002439 wurde gestaged, `## File Structure` steht in
`openspec/changes/db-pod-phase-guard-T002439/tasks.md`, `touched_files` ist `NULL`.

Die Messung zeigt zugleich, wie eng das Problem ist — die ursprüngliche Annahme „nur 10 % der
Tickets haben `touched_files`" ist irreführend, weil sie über überwiegend abgeschlossene Tickets
mittelt:

| Status | mit `touched_files` | gesamt |
|---|---|---|
| `in_progress` / `in_review` | 5 | 5 |
| `plan_staged` | 0 | 8 |

Dass `plan_staged` bei 0 steht, ist kein Defekt der Query: sie schließt diesen Status bewusst aus
(FA-SF-45 — ein Ticket kann dort tagelang liegen, es aufzunehmen würde falsch-positiv blockieren).
Der Mangel ist nicht die aktuelle Abdeckung, sondern dass sie an einem nicht durchgesetzten
Schritt hängt. Ein einziger übersehener Fall genügt für eine unentdeckte Kollision — genau die
Klasse von Vorfall, die T002418 behandelte.

## What

- Ein neues Skript `scripts/plan-touched-files.sh <planfile>` leitet die Dateiliste aus dem
  `## File Structure`-Block ab und gibt sie auf stdout aus.
- `scripts/vda/ticket/stage-plan.sh` ruft es auf und schreibt das Ergebnis nach `touched_files` —
  **ergänzend, nicht ersetzend**: eine bereits vorhandene Liste wird erweitert, nicht überschrieben.
- Liefert der Block keine Pfade, meldet das Skript das auf stderr und beendet sich mit 0.
  `stage-plan` bleibt damit funktionsfähig; `plan-lint` STRUCT1 ist das Gate für Plan-Struktur,
  nicht `stage-plan`.

Der Parser muss drei Formate beherrschen — so stehen sie in den 33 realen Plänen unter
`openspec/changes/`:

| Format | Anzahl | Form |
|---|---|---|
| Code-Fence mit `NEW:`/`CHANGED:` | 23 | `  scripts/foo.sh — beschreibung` |
| Bullet-Liste mit Backtick-Pfaden | ~7 | ``- `scripts/foo.sh` — beschreibung`` |
| Markdown-Tabelle | ~3 | `` \| `k3d/brett.yaml` \| Add comment \| `` |

Und er muss Nicht-Pfade aussortieren: `fix-arena-db-url-secrets` listet unter File Structure
`deployment/arena-server in namespace workspace-korczewski` — eine Cluster-Ressource ohne
Repo-Entsprechung.

## Nicht im Scope

- `touched_files` auf `NOT NULL DEFAULT '{}'` migrieren. In T002439 geprüft und verworfen: es
  würde „Scout lief nie" (`NULL`) und „berührt keine Dateien" (`{}`) ununterscheidbar machen.
- `plan_staged` in den Statusfilter von `conflict-check.sh` aufnehmen (FA-SF-45).
- Backfill historischer Tickets — die Kollisionsprüfung sieht nur aktive.

_Ticket: T002446_
