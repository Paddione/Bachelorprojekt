---
title: "ci-push-trigger — Design"
ticket_id: T002522
domains: [ci-cd]
status: active
plan_ref: openspec/changes/ci-push-trigger/tasks.md
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Design: Push-Trigger auf main erzeugt keine Runs

_Ticket: T002522_

## Symptom (beobachtet, reproduzierbar)

Ein Push auf `main` erzeugt keinen Workflow-Run. Weder `ci.yml` noch die
paths-filterfreien Workflows `post-merge.yml`, `freshness-regen.yml` und
`factory-post-merge-e2e.yml` laufen an. GitHub meldet dabei keinen Fehler —
die Kette hält still.

Folgeschäden am 2026-08-01/02: kein Prod-Deploy (Website-Image und
Flux-Artefakt blieben stale), kein Auto-Close der Tickets, während Flux
weiterhin `Ready=True` auf der alten Revision meldete.

## Hypothesen aus der Ticket-Meldung — beide widerlegt

Das Ticket vermutete "Trigger-Definition vs. Secrets vs. Workflow-Pfad".

- **Trigger-Definition:** widerlegt. `post-merge.yml`, `freshness-regen.yml` und
  `factory-post-merge-e2e.yml` tragen `on: push: branches: [main]` ohne jeden
  `paths`-Filter. Sie müssten bei jedem Push feuern.
- **Workflow deaktiviert:** widerlegt. Die GitHub-API meldet für alle 27
  Workflows `state: active`.
- **Secrets:** widerlegt. Fehlende Secrets ließen einen Run *fehlschlagen*,
  nicht ausbleiben.

## Root Cause (belegt)

`scripts/worktree-create.sh` setzt beim Anlegen eines Worktrees einen leeren
Anchor-Commit mit dem Subject `chore: anchor branch <branch> [skip ci]`. Der
Anchor selbst ist gewollt — er schützt den Branch vor Ancestry-basiertem
Cleanup.

Beim **Squash-Merge** faltet GitHub die Subjects aller Branch-Commits als
Bullet-Liste in den **Body** des Squash-Commits. Damit reist `[skip ci]` aus
dem Anchor in den Head-Commit von `main` mit.

GitHub wertet seine Skip-Marker gegen die **gesamte Message des Head-Commits**
aus, nicht nur gegen die Betreffzeile, und unterdrückt daraufhin **alle**
push-getriggerten Workflows für diesen SHA.

### Beleg — Korrelation über 25 aufeinanderfolgende main-Commits

| Head-Commit trägt Skip-Marker | Anzahl | push-Runs |
|---|---|---|
| ja | 17 | 0 |
| nein | 8 | je 1 |

Kein Gegenfall. Der letzte funktionierende Push (`ad25f0613`, ein
release-please-Commit ohne Anchor) trägt keinen Marker; ausnahmslos jeder
Commit ab `535eb4731` trägt ihn.

### Zusatzbefund

Der Marker ist an seinem eigenen Einsatzort **wirkungslos**: `ci.yml` triggert
per Push nur auf `main` und `release-please--branches--main`, und zum Zeitpunkt
des Anchor-Pushes existiert noch kein Pull Request. Er schützt vor nichts und
schadet ausschließlich.

## Fix-Ansatz

1. **Ursache entfernen.** Der Anchor-Commit wird ohne Skip-Marker gesetzt. Sein
   eigentlicher Zweck — Sichtbarkeit für Ancestry-Prüfungen — bleibt unberührt,
   weil dafür allein die Existenz des Commits zählt.

2. **Rückfall verhindern — im PR, nicht auf main.** Ein Guard prüft im
   `pull_request`-Lauf alle Commits in `origin/main..HEAD` auf Skip-Marker.
   Genau diese Subjects landen später im Squash-Body. Der Check greift damit
   *bevor* gemergt wird, statt den Schaden hinterher nur festzustellen.

### Verworfene Alternative: Guard auf main

Ein Post-Merge-Check auf `main` käme zu spät — der Push-Trigger ist dann bereits
unterdrückt. Er bräuchte zusätzlich eine Ausnahme für den `freshness-regen`-
Bot-Commit, der bewusst mit Marker direkt auf `main` committet. Der PR-seitige
Guard erfasst diesen Bot-Commit gar nicht erst, weil er ohne Pull Request
entsteht — die Ausnahme entfällt ersatzlos.

## Abgrenzung

`freshness-regen.yml` setzt seinen Marker bewusst und bedingt (T002158) als
Loop-Schutz für einen Bot-Commit direkt auf `main`. Das bleibt unverändert.
`brain-merge-hook.yml` committet in das externe brain-Repo und ist nicht
betroffen.

## Edge-Cases

- **Bewusster Skip-Marker in einem Branch-Commit** ist nach diesem Change nicht
  mehr möglich. Das ist beabsichtigt: er wäre beim Squash-Merge immer
  schädlich.
- **Alle GitHub-Marker-Varianten** müssen erfasst werden, nicht nur `[skip ci]`
  — auch `[ci skip]`, `[no ci]`, `[skip actions]`, `[actions skip]`.
- **Der Fix-PR selbst** trug einen Anchor-Commit mit Marker und hätte den
  Trigger beim eigenen Merge erneut abgewürgt. Bereits bereinigt.
