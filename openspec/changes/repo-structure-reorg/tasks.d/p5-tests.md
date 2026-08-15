---
title: "repo-structure-reorg — Implementation Plan (Partial p5-tests)"
ticket_id: T006999
domains: [repo-structure]
status: active
---

# repo-structure-reorg — Implementation Plan (Partial p5-tests)

_Ticket: T006999 · Rolle: tests · depends_on: p1, p2, p3, p4_

## File Structure

| Datei | Ist (wc -l) | Budget / Anmerkung |
|---|---|---|
| `tests/spec/repo-structure/inventory-registered.bats` | NEU | kein S1-Limit für `.bats` (`s1.excludes`), nicht-baselined — kein Zahlen-Claim |
| `website/src/data/test-inventory.json` | generiert | Regenerierung via `task test:inventory` — kein Hand-Edit |

## Task P5.1 — Guard schreiben (RED, expected: FAIL)

Der Guard prüft, dass alle vier in p1–p4 angelegten Drift-Guards im
Test-Inventar registriert sind. p1–p4 haben die Inventar-Datei nur lokal
regeneriert und nie committet — das committete Inventar enthält die vier
Pfade noch nicht, der Guard ist also ehrlich rot.

Guard-Datei: `tests/spec/repo-structure/inventory-registered.bats`
(T002416-Verzeichniskonvention, eine Datei pro Vorgang).

Prüfmodus: Output-Verifikation (T002448-M4) — der Test liest das generierte
JSON-Artefakt, nicht die Guard-Quellen. Positiv-Anker zuerst (T002356-M1):
die vier Guard-Dateien existieren im Dateisystem; erst dann die
Registrierungs-Aussage gegen das Inventar.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/repo-structure/inventory-registered.bats
# expected: FAIL — das committete website/src/data/test-inventory.json
# registriert die vier Guard-Pfade aus p1–p4 noch nicht
```

Guard-Logik (drei `@test`-Blöcke):

1. **Positiv-Anker:** alle vier Guard-Dateien existieren
   (`tests/spec/repo-structure/{root-agent-md,packages-assets,components-group,website-moved}.bats`).
2. **Registrierung:** das Inventar (`website/src/data/test-inventory.json`)
   enthält die vier Dateipfade (Fixed-String, `grep -qF` ohne Zeilenanker —
   Format-Stabilität nicht annehmen, Semantik prüfen: der Pfad ist
   registriert). Fehlt die Inventar-Datei ganz, ist das ein lauter Fehler
   (kein vakuum-grün, kein stilles `skip`).
3. **Kein Stale-Pfad:** das Inventar enthält keinen Eintrag, der auf die
   alten Top-Level-Pfade (`website/`, `brett/` usw. als Inventar-`path`)
   zeigt.

## Task P5.2 — Inventar regenerieren und committen (GREEN)

```bash
task test:inventory
# erwartet: die vier Guard-Einträge erscheinen (Pfad-Fallback, T002445)
git add website/src/data/test-inventory.json
git commit -m "test(ci): register repo-structure guards in test inventory [T006999]"

tests/unit/lib/bats-core/bin/bats tests/spec/repo-structure/inventory-registered.bats
# erwartet: grün — Positiv-Anker und Registrierung bestehen
```

## Task P5.3 — Gesamt-Verifikation (STRUCT3)

Alle p1–p4-Moves sind abgeschlossen; dieser Task läuft die drei
mandatorischen CI-Gates gegen den Endzustand:

```bash
task test:changed          # gezielte Tests der geänderten Domains (BATS-Selection + quality)
task freshness:regenerate  # generierte Artefakte (test-inventory, repo-index, goals-data)
task freshness:check       # CI-Äquivalent: Freshness + quality:check (S1–S4) + Baseline-Assertion
task workspace:validate    # Kustomize-Manifeste bleiben strukturell intakt
```

Zusätzlich die Grep-Verifikation des Gesamtzustands (Fixed-String, ohne
node_modules/.git/tmp/k3d/docs-content-built/openspec):

```bash
git grep -n 'website/' -- Taskfile.yml taskfiles/ .github/workflows/ scripts/ tests/ .claude/ .opencode/ CLAUDE.md AGENTS.md | grep -v 'components/website/' | head
# erwartet: keine Ausgabe (oder nur dokumentierte Ausnahmen aus p4s Ausnahmen-Tabelle)
git grep -n 'brett/\|studio-server/\|mentolder-web/\|mediaviewer-widget/\|VideoVault/' -- Taskfile.yml taskfiles/ .github/workflows/ scripts/ tests/ .claude/ | grep -v 'components/' | head
# erwartet: keine Ausgabe
git ls-files | grep -E '^(SOUL|IDENTITY|USER|HEARTBEAT)\.md$'
# erwartet: keine Ausgabe — Persona-MDs sind aus der Root entfernt
```

## Risiken

| Risiko | Mitigation |
|---|---|
| Inventar-Format ändert sich, Guard greppt auf Darstellung | Fixed-String ohne Zeilenanker; Semantik (Pfad registriert), nicht Format |
| Guard läuft vakuum-grün, weil Inventar-Datei fehlt | Test 2 failt laut bei fehlender Datei — kein `skip`, kein leeres `grep` |
| test:inventory schlägt fehl, weil ein p1–p4-Guard doch nicht existiert | Positiv-Anker in Test 1 meldet exakt die fehlende Datei |
