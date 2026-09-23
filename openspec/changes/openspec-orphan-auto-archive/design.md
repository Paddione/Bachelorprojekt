# Design: openspec-orphan-auto-archive

_Ticket: T900338_

## Ablauf

```
 sdlc-github-poller.timer (Dev-Host, alle 5 min)
        │
        ▼
 github-poller.sh --task archive
        │  delegiert (Zeitgeber, nicht Logik — wie task_merges)
        ▼
 openspec-orphan-dispatch.sh
   gh api contents/openspec/changes?ref=main ──► offene Slugs
   je Slug:  .ticket (gh api) ──► Ticket-DB: status done?
             Einfuehrungs-Commit (gh api commits?path=) ──► aelter als --min-age-hours?
             gh pr list --search "<slug> in:title" ──► offener Archiv-PR?
   laeuft schon ein openspec-orphan-archive.yml-Run? ──► dann nichts dispatchen
        │  gh workflow run openspec-orphan-archive.yml -f slugs=a,b
        ▼
 GitHub Actions: openspec-orphan-archive.yml
   scripts/openspec-orphan-archive.sh --slugs a,b --out <dir>
     je Slug: TICKET_OFFLINE=1 openspec.sh archive <slug>
       ok   ──► <dir>/archived.txt
       fail ──► <dir>/failed.tsv  (slug, ticket, Fehlerzeile)
   archived nicht leer: task openspec:validate, task freshness:regenerate,
                        Branch + PR + gh pr merge --auto --squash
   failed nicht leer:   Issue je Slug (Label openspec-orphan), bestehendes offenes
                        Issue zum Slug bekommt einen Kommentar statt eines Duplikats
```

## Entscheidungen

**D1 — Der Poller entscheidet, die CI archiviert.** Die CI erreicht die Ticket-DB seit
ADR-006 nicht (`post-merge.yml`, Kommentar zu E3/T002626). `openspec.sh archive` muesste
dort mit `TICKET_OFFLINE=1` laufen, womit sein Guard "Ticket ist done" entfiele. Aus Git
allein ist "fertig" nicht ablesbar: 190 von 618 seit August archivierten Changes wurden auf
`main` von mehreren PRs mit mindestens 2 h Abstand beruehrt. Der Poller hat die DB und ruft
`gh` ohnehin auf; er uebergibt nur Slugs, deren Ticket `done` ist. Damit laeuft der Executor
in der CI zu Recht mit `TICKET_OFFLINE=1` — der Guard ist vorgelagert, nicht entfallen.

```bash
# Messung D1 (Stand 7fbc7b774): Changes seit August mit >=2 Nicht-Archiv-PRs im Abstand >=2 h
ls openspec/changes/archive | grep -E '^2026-0(8|9)' | sed 's/^[0-9-]\{11\}//' | while read s; do
  git log 7fbc7b774 --format='%ct %s' -- "openspec/changes/$s/" | grep -vi archive | grep '(#[0-9]*)' | awk '{print $1}' | sort -n | sed -n '1p;$p' | paste -sd' '
done | awk 'NF==2 && $2-$1>=7200' | wc -l
```

**D2 — Der Poller schreibt nichts in Git.** Er liest den Bestand ueber `gh api` von `main`
statt aus dem lokalen Checkout. Der Checkout auf dem Dev-Host wird von parallelen Sessions
beschrieben und kann veraltet sein; ein Worktree-Lebenszyklus im Poller waere eine zweite
Fehlerquelle.

**D3 — Karenz 2 h statt Push-Trigger.** Die Session archiviert in
`devflow-post-merge-finalize.sh` wenige Minuten nach dem Merge. Ein sofortiger CI-Lauf
wuerde mit ihr um denselben Slug konkurrieren. Nach 2 h und ohne offenen PR mit dem Slug im
Titel ist die Session entweder fertig oder abgebrochen.

**D4 — Kein Ermessen in der Automatik.** Der Executor ruft `openspec.sh archive` ohne
`--allow-shrink`, `--create-new` oder `--no-merge` auf. Am 2026-09-23 brauchten 4 von 8
Changes genau diese Entscheidungen (fehlender SSOT-Spec, falscher Delta-Header,
gewollter Szenario-Wegfall). Sie gehen als Issue an einen Menschen. Weil die Archiv-Guards
seit T002581 vor jedem Schreibzugriff laufen, hinterlaesst ein gescheiterter Slug keinen
Halbzustand im Baum.

**D5 — Eskalation per GitHub-Issue.** Ein Ticket-Kommentar ist aus der CI nicht moeglich
(D1). Issues mit Label `openspec-orphan` und der Ticket-ID im Titel landen ueber die
Issue-Intake von `repo-hygiene` bei einem Menschen. Pro Slug hoechstens ein offenes Issue.

**D6 — Dispatch nur ohne laufenden Run.** Der Timer feuert alle 5 min, ein Workflow-Lauf
dauert laenger. Laeuft oder wartet bereits ein Run des Workflows, dispatcht der Poller
nichts; der naechste Tick holt es nach.

## Fehlerfaelle

| Fall | Verhalten |
|---|---|
| `gh api` scheitert | Aufgabe `archive` meldet Fehler, kein Dispatch, Poller-rc != 0 |
| Change ohne `.ticket` | uebersprungen mit Meldung (Altbestand-Regel, siehe openspec-workflow) |
| Ticket nicht in der DB | uebersprungen mit Meldung |
| Slug beim Executor nicht mehr offen | `failed.tsv`, Grund `not an open change` |
| `task openspec:validate` nach dem Archivieren rot | kein PR, ein Issue mit allen Slugs des Laufs |

## Tests

- `tests/spec/openspec-workflow/orphan-archive.bats` — Executor gegen ein Fixture-`OPENSPEC_ROOT`.
- `tests/spec/sdlc-isolation/orphan-archive-dispatch.bats` — Dispatcher und Poller-Aufgabe mit
  gestubbtem `gh` und `psql` (`FACTORY_PG_URL`).

Der Workflow selbst wird nicht in BATS ausgefuehrt; seine Logik steckt vollstaendig im Executor.
