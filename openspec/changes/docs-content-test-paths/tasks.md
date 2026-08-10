---
title: "docs-content-test-paths — Implementation Plan"
ticket_id: T003142
domains: [bachelorprojekt-test, ci-cd]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# docs-content-test-paths — Implementation Plan

_Ticket: T003142_

## File Structure

```
tests/spec/ci-cd/docs-content-guards.bats   NEU  (bereits in diesem Branch, rot)
tests/unit/test-docs-content.bats           LÖSCHEN
tests/unit/.coverage-allowlist              BEARBEITEN (Eintrag + Kommentarblock entfernen)
docs/systemtest-fragebogen.md               BEARBEITEN (zwei Zeilen, veraltete Topologie)
website/src/data/test-inventory.json        GENERIERT (task test:inventory)
docs/code-quality/repo-index.json           GENERIERT (task freshness:regenerate)
openspec/changes/docs-content-test-paths/   PLANARTEFAKTE (bereits vorhanden)
```

S1-Zeilenlimits greifen hier nicht: `docs/code-quality/gates.yaml` → `s1.limits`
führt weder `.bats` noch `.md`; beide berührten Dateien sind nicht baselined
(`jq -r '."S1:docs/systemtest-fragebogen.md".metric // "nicht-baselined"'
docs/code-quality/baseline.json` → `nicht-baselined`). Kein Zeilenbudget zu
beachten, kein Split nötig.

## Task 1 — Ausgangslage bestätigen (RED)

Der neue Guard liegt bereits im Branch und ist rot. Vor jeder Änderung den
roten Lauf reproduzieren, damit die beiden echten Befunde belegt sind:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/docs-content-guards.bats
# expected: FAIL — 2 von 6 rot:
#   1) "kein Test referenziert die abgeschalteten Docsify-Pfade"
#      → tests/unit/test-docs-content.bats
#   2) "live docs (docs/*.md) tragen keine veraltete Cluster-Topologie"
#      → docs/systemtest-fragebogen.md
```

Die vier grünen Guards sind kein Versehen: sie sind die migrierten
Zusicherungen, deren geprüftes Verhalten den Generator-Umbau überlebt hat
(Link-Auflösung, Quickstart-Auslieferung, Mermaid je Service-Seite, Glossar und
Decisions). Sie belegen, dass die Migration inhaltlich trägt, statt nur einen
Pfad zu tauschen.

Ebenfalls den Alt-Lauf einmal festhalten, damit die Löschung begründet ist:

```bash
tests/unit/lib/bats-core/bin/bats tests/unit/test-docs-content.bats
# expected: FAIL — 7 von 12 rot; die ersten 4 laufen vakuos grün
```

## Task 2 — Veraltete Cluster-Topologie in `docs/systemtest-fragebogen.md` korrigieren

Zwei Zeilen nennen eine Topologie, die es seit der Fleet-Konsolidierung nicht
mehr gibt (und zusätzlich Keycloak, das Pocket ID abgelöst hat):

```bash
grep -n 'korczewski-Cluster' docs/systemtest-fragebogen.md
# Zeile 1001: "… vom Arena-Server (korczewski-Cluster) akzeptiert wird."
# Zeile 1014: "… ☐ Entfällt (kein korczewski-Cluster)"
```

Beide Stellen auf die heutige Topologie umschreiben: ein Cluster `fleet`, Brand
`korczewski` im Namespace `workspace-korczewski`. Der Fragebogen ist ein
Prüfprotokoll für den laufenden Betrieb — er beschreibt einen Soll-Zustand, kein
Archiv, deshalb wird er korrigiert und nicht ausgenommen. Formulierung an
`CLAUDE.md` → „Cluster Topology & Nodes" ausrichten.

Danach:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/docs-content-guards.bats \
  -f 'veraltete Cluster-Topologie'
# erwartet: grün
```

## Task 3 — Alten Test entfernen und Allowlist bereinigen

```bash
git rm tests/unit/test-docs-content.bats
```

In `tests/unit/.coverage-allowlist` den Eintrag `test-docs-content` samt dem
darüberstehenden Kommentarblock („Currently FAILS offline: referenziert tote
Pfade …") entfernen. `scripts/tests/unit-coverage-guard.sh` iteriert nur über
existierende Dateien, ein zurückgelassener Eintrag wäre also stumm — genau die
Art stiller Karteileiche, die diesen Fehler zwei Monate getragen hat.

Der Kommentarblock nennt die toten Pfade wörtlich. Der neue Konventions-Guard
scannt ausschließlich `*.bats`, greift dort also nicht — die Zeilen müssen
trotzdem weg, weil sie sonst eine Ausnahme dokumentieren, die es nicht mehr gibt.

```bash
grep -c 'test-docs-content' tests/unit/.coverage-allowlist
# erwartet: 0
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/docs-content-guards.bats
# erwartet: 6 von 6 grün
```

## Task 4 — SSOT-Spec nachziehen und Registrierung prüfen

Der Delta-Spec `openspec/changes/docs-content-test-paths/specs/ci-cd.md` liegt
vor und trägt den Parent-Slug `ci-cd`. Er wird beim Archivieren nach
`openspec/specs/ci-cd.md` gemerged; bis dahin nur validieren:

```bash
task openspec:validate
```

Prüfen, dass der neue Guard von einem Runner erfasst wird — beide Formen der
Spec-Konvention abdecken (Sammeldatei und Verzeichnis):

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/ci-cd*
```

Test-Inventar regenerieren, weil eine Testdatei hinzukommt und eine wegfällt:

```bash
task test:inventory
git diff --stat website/src/data/test-inventory.json
```

## Task 5 — Abschließende Verifikation

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

`task freshness:regenerate` aktualisiert unter anderem
`docs/code-quality/repo-index.json`, das `tests/unit/test-docs-content.bats`
noch listet. Die regenerierten Artefakte gehören in denselben Commit, sonst
schlägt der Freshness-Vergleich in CI fehl.
