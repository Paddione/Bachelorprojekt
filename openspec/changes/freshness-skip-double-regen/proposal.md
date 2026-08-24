# Proposal: freshness-skip-double-regen

## Why

### Beobachtetes Symptom (Fakt)

Mishap-Buffer-Eintrag 2026-08-23T23:50:42Z `[degraded] ci/freshness`: Beim Archiv-PR #5191
(chore/openspec-closure-guard-spec-T015670, gemerged 2026-08-23T23:47:07Z) lief ein zusätzlicher
Rebase-Regen-Zyklus. Timeline-Evidenz (gh):

- `#5191` merge → `freshness-regen.yml`-Run 32674637361 um 23:47:09Z (erster Zyklus).
- Der dahinter wartende Archiv-PR `#5193` wurde auf den neuen main-Stand gerebaset und dabei
  per Rebase-Pfad (`task freshness:regenerate` + Commit + Push) ein weiterer Regen-Lauf
  erzeugt.
- `#5193` merge 23:52:19Z → Run 32674893916 um 23:52:21Z (zweiter, vermeidbarer Zyklus).

### Ursachen-Analyse (verifiziert am Code)

1. **Kein Skip-Guard:** Alle drei Rebase-/Regen-Pfade starten ihren eigenen
   Regen-Commit-Push, ohne zu prüfen, ob bereits ein Freshness-Regen läuft oder offen ist:
   - `scripts/pr-refresh.sh:222-228` — regeneriert nach JEDEM Rebase und committet/pusht.
   - `scripts/devflow-ci-watch.sh:34-44` — DIRTY-Preflight: rebase + regen + force-push.
   - `scripts/factory/babysit-prs.sh:248-253` — class=freshness: regen + commit + push.
   Erkennbar wäre der Doppelzyklus über offene PRs mit `headRefName startswith
   chore/freshness-regen-` oder einen `in_progress`/`queued` Run von `freshness-regen.yml`.
2. **merge=ours-Rebase-Falle:** `.gitattributes` führt die Freshness-Artefakte als
   `merge=ours` (lokaler Driver `merge.ours.driver=true`). Während eines **Rebase** ist
   „ours" das neue Base (origin/main) — der Driver verwirft also stillschweigend die
   artefaktseitigen Änderungen des PR-Branch. Die Kompensation ist zwingend die
   Regeneration NACH dem Rebase; nur `pr-refresh.sh` tut das, und die Spec-Stelle
   `openspec/specs/ci-cd.md` (Szenario „merge=ours-Driver automatisiert die Auflösung")
   beschreibt die Richtung falsch („zugunsten des PR-Branch" — stimmt nur für Merge, nicht
   für Rebase). Diese Fehlannahme produziert genau die Nachregen-Zyklen.

## What

Drei Gruppen:

1. **Skip-Guard gegen den Doppelzyklus:** Ein gemeinsamer Detektor
   (`scripts/freshness-regen-in-flight.sh`) erkennt „Regen bereits offen/läuft" (offener
   `chore/freshness-regen-*`-PR ODER `freshness-regen.yml`-Run in `in_progress`/`queued`).
   Die drei Pfade oben prüfen ihn vor ihrem eigenen Regen-Commit-Push und überspringen
   diesen (der laufende/offene Zyklus heilt main ohnehin); Rebase und Push selbst bleiben
   unangetastet.
2. **Dokumentation/Entschärfung der merge=ours-Falle:** `.gitattributes`-Kommentarblock,
   Taskfile-NOTE bei `freshness:regenerate` und `pr-refresh.sh`-Header erklären die
   Rebase-Richtung („ours" = neues Base → Branch-seitige Artefakt-Änderungen werden
   verworfen; Regeneration nach dem Rebase ist Pflicht). Das falsche Szenario in der
   SSOT-Spec wird im Delta dieser Changes korrigiert.

3. **Pre-Flight-Skip im push-getriggerten Workflow:** `.github/workflows/freshness-regen.yml`
   feuert bei JEDEM main-Push, auch bei den eigenen Archive- und Regen-PRs. Vor
   `task freshness:regenerate` prüft ein Step, ob bereits ein offener
   `chore/freshness-regen-*`- oder `chore/plan-archive-*`-PR existiert, und überspringt den
   Regen dann. **Fail-open** bei `gh`-Fehlern (Rate-Limit, Netzwerk): WARN + regulärer Regen,
   damit im CI-Hauptpfad kein neuer Fail-Closed-Blocker entsteht. Gruppe 1 deckt die drei
   Skriptpfade ab, Gruppe 3 den Workflow-Trigger selbst.

   _Übernommen aus dem verworfenen Parallelplan `freshness-regen-dedupe`, der für dasselbe
   Ticket T015827 gestaged war und nur diesen einen Pfad abdeckte._

_Ticket: T015827_
