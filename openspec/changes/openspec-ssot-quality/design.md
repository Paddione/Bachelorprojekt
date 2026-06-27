## Context

Der OpenSpec-Workflow im Bachelorprojekt-Repo nutzt `openspec-validate.ts` als
fail-closed CI-Gate (`task test:openspec`). Die Validierung erzwingt für alle
`openspec/specs/*.md` die Header `## Purpose` und `## Requirements` sowie für
aktive Changes in `openspec/changes/*/specs/` das Vorhandensein mindestens einer
Capability-Delta-Datei.

Aktueller Zustand (2026-06-28):
- 2 harte FAIL-Zeilen in `task test:openspec`: ein malformed SSOT-Spec + 2 leere `specs/`-Dirs
- `openspec/config.yaml` OpenSpec-Komponenten-Liste: 24 Einträge vs. 63 tatsächliche Spec-Dateien
- Archivierte Proposals mit falschem `status:`-Feld (keine CI-Wirkung, aber Traceability-Lücke)

Parallel läuft T001262 (OpenSpec upstream CLI). Dieser Change berührt keine CLI-Scripts
(`scripts/openspec.sh`) und keine CLI-Befehle — ausschließlich Dateiinhalt und eine
additive Erweiterung von `openspec-validate.ts`.

## Goals / Non-Goals

**Goals:**
- `task test:openspec` läuft mit 0 FAIL-Zeilen nach diesem PR
- `openspec/config.yaml` enthält alle aktuellen SSOT-Spec-Slugs, alphabetisch sortiert
- Neuer WARN-Check in `openspec-validate.ts` meldet Drift zwischen config.yaml und `specs/`-Dir
- Minimale Stub-Deltas in leeren `specs/`-Verzeichnissen aktiver Changes
- Archiv-Status-Bereinigung auf `openspec/changes/archive/` beschränkt

**Non-Goals:**
- Keine neuen `task openspec:*`-Commands (T001262-Scope)
- Kein Auto-Sync-Script für config.yaml (YAGNI)
- Keine Ticket-Erstellung für `.ticket`-lose Changes (WARN akzeptabel)
- Keine inhaltliche Überarbeitung von SSOT-Specs

## Decisions

### D1: Stub-Deltas für leere specs/-Dirs (nicht löschen)

**Entscheidung:** Minimalen validen Delta anlegen (`## MODIFIED Requirements` + 1 Stub-Requirement),
statt das `specs/`-Verzeichnis zu entfernen.

**Begründung:** Das Verzeichnis wurde von `openspec new change` angelegt und signalisiert die
Intention, einen Delta zu schreiben. Es zu löschen würde die teilweise abgeschlossene Propose-Phase
rückgängig machen. Ein Stub ist valid für den Validator und wird bei dev-flow-execute durch echte
Requirements ersetzt.

**Alternative:** `specs/`-Dir entfernen + Change auf "proposal only"-Schema downgraden.
Verworfen weil es erfordert, das `.openspec.yaml` anzupassen (T001262-Scope-Überschneidung).

### D2: WARN statt FAIL für den Drift-Check

**Entscheidung:** Der neue config.yaml-Drift-Check emittiert `WARN:` (nicht `FAIL:`),
sodass neue Specs hinzugefügt werden können, ohne sofort CI zu brechen.

**Begründung:** Der Check ist präventiv und informativ. Teams sollen die Lücke sehen,
nicht durch sie geblockt werden. Ein FAIL würde jede Spec-Erstellung in einem PR zur
Zwei-Schritt-Arbeit machen (Spec anlegen + config.yaml updaten im gleichen Commit).

**Alternative:** FAIL mit Pflicht-Update von config.yaml. Verworfen wegen zu hoher Friction
für normale Feature-Entwicklung.

### D3: H2-Header Fix statt Neuerstellung von t001269-Spec

**Entscheidung:** Minimales Einfügen von `## Purpose` + `## Requirements` vor dem
bestehenden H3-Content. Kein Rewrite des Inhalts.

**Begründung:** Die Datei entstand durch `opsx:archive` und enthält archivierte Mishap-Daten,
die erhalten bleiben sollen. Der Fix ist chirurgisch — nur das Strukturproblem (fehlende H2-Wrapper)
wird behoben.

## Risks / Trade-offs

- **[Merge-Konflikt mit T001262]** → `openspec-validate.ts` wird von T001262 möglicherweise
  ebenfalls angefasst. Mitigation: Change-Abschnitt ist klar additiv (neue Funktion `checkConfigDrift()`),
  kein Eingriff in bestehende Funktionssignaturen. Bei Konflikt ist Resolution trivial (beide Additions
  zusammenführen).

- **[Stub-Deltas als Dauerzustand]** → Wenn `g-cd01-korczewski-ci-parity` oder `g-dep01-npm-vuln`
  nie implementiert werden, bleiben die Stubs dauerhaft. Mitigation: Stubs enthalten einen Kommentar
  `# placeholder — fill in during dev-flow-execute` der die Intention klar macht.

- **[Config-Liste veraltet sofort wieder]** → Nach dem Update auf 63 Einträge wird bei jeder
  neuen Spec-Erstellung die Liste erneut out-of-sync. Mitigation: Der neue WARN-Check in CI
  macht das sichtbar und verhindert stille Drift.

## Migration Plan

1. PR anlegen (chore/openspec-ssot-quality → main)
2. Kein Rolling-Upgrade nötig — reine Dateiänderungen, kein Cluster-Deploy
3. Rollback: `git revert <merge-commit>` — alle Änderungen sind rein additiv oder inhaltlich neutral
