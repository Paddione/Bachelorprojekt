---
title: "devflow-selection-archive-hardening — Implementation Plan"
ticket_id: T002255
domains: [plan-authoring, ci-cd, scripts]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# devflow-selection-archive-hardening — Implementation Plan

_Tickets: T002255, T002256 — Mishap-Bundles aus dem T002251-Zyklus._
_Design: `openspec/changes/devflow-selection-archive-hardening/design.md`_

## File Structure

```
scripts/filter-generated.sh                        (neu)  — Filter, gespeist aus .gitattributes
Taskfile.yml                                       (mod)  — test:changed pipet CHANGED durch den Filter
scripts/devflow-post-merge-deploy.sh               (mod)  — Filter + Image-Builds entfernt
.claude/skills/references/deploy-routing.md        (mod)  — generierte Pfade als Nicht-Trigger
.claude/skills/references/plan-archive-steps.md    (mod)  — Branch-Name, origin/main, Fence, Skript-first
.claude/skills/references/mcp-tool-guide.md        (mod)  — Worktree-Limit für stage_plan + archive_plan
tests/spec/devflow-selection-archive-hardening.bats (neu) — 23 Tests, bereits RED committed
website/src/data/test-inventory.json               (gen)  — via task test:inventory
```

### S1-Budgets

| Datei | Ist | Budget |
| --- | --- | --- |
| `scripts/devflow-post-merge-deploy.sh` | 56 | 444 |

`scripts/filter-generated.sh` ist neu (.sh, statisches Limit 500, Zielgröße ~20 Zeilen) und
damit unkritisch. `Taskfile.yml` (.yml), die drei Reference-Dateien (.md) und die BATS-Datei
(.bats) haben in `gates.yaml` → `s1.limits` kein Extension-Limit; `.claude/` ist zudem kein
`scan.code_roots`-Eintrag. Keine der Dateien ist in `docs/code-quality/baseline.json`
eingetragen. S4 (Orphan-Gate) ist die bindende Regel für das neue Skript: es wird von
`Taskfile.yml` und `scripts/devflow-post-merge-deploy.sh` referenziert.

<!-- vitest: kein neuer Test nötig — der Change fasst keine Datei unter
     website/src/lib/** oder website/src/pages/api/** an. -->

---

## Task 1 — RED-Nachweis (Failing-Test-Step)

Die Testdatei `tests/spec/devflow-selection-archive-hardening.bats` ist bereits im
Stage-Commit enthalten und beschreibt den Zielzustand. Vor der ersten Implementierungszeile
den roten Stand bestätigen:

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/devflow-selection-archive-hardening.bats
# expected: FAIL — 20 von 23 Tests rot
```

Grün sein **müssen** bereits jetzt genau drei Tests; sie sind Regressionswächter und dürfen
in keinem späteren Schritt rot werden:

- `freshness:check bleibt ungefiltert` — die Artefaktliste dort ist der Prüfgegenstand.
- `post-merge-deploy behaelt feature:deploy als Break-Glass`
- `fail-closed-Meldung aus T002242-M3 bleibt erhalten`

---

## Task 2 — `scripts/filter-generated.sh` anlegen

Liest Pfade zeilenweise von stdin und gibt alle zurück, die **nicht** als generiert markiert
sind. Regel-Quelle ist ausschließlich das `linguist-generated`-Attribut aus `.gitattributes`.

Verifiziertes Ausgabeformat von `git check-attr --stdin linguist-generated`:

```
website/src/data/openspec-status.json: linguist-generated: true
scripts/foo.sh: linguist-generated: unspecified
```

Der Wert ist `true` (nicht `set`), weil `.gitattributes` das Attribut **mit Wert** setzt
(`linguist-generated=true`). Ein Filter auf `: set$` würde still nichts entfernen.

**Zwei Fallen, die die Implementierung abfangen muss:**

1. `grep -v` liefert Exit 1, wenn *alle* Zeilen verworfen werden — der Fall bei einem Diff
   aus ausschließlich generierten Dateien (`freshness-regen.yml`-Bot-Commits). Unter
   `set -o pipefail` reißt das den aufrufenden Task mit. Deshalb kein `pipefail` in der
   Pipeline bzw. `|| true` am Filterschritt, und `exit 0` am Skriptende erzwingen.
2. Das Skript muss aus dem Repo-Root laufen, weil `git check-attr` relativ auflöst.

```bash
#!/usr/bin/env bash
# filter-generated.sh — entfernt generierte Artefakte aus einer Pfadliste (stdin → stdout).
#
# Regel-SSOT ist das linguist-generated-Attribut in .gitattributes. Damit wirkt jedes neue
# generierte Artefakt automatisch, sobald es seinen ohnehin vorgeschriebenen Eintrag
# bekommt — es gibt bewusst KEINE zweite Pfadliste in diesem Skript.
#
# NICHT verwenden in `task freshness:check`: dort sind genau diese Pfade der
# Prüfgegenstand, nicht Rauschen.
set -uo pipefail

git check-attr --stdin linguist-generated 2>/dev/null \
  | grep -vE ': linguist-generated: (true|set)$' \
  | sed -E 's/: linguist-generated: [^:]*$//'

exit 0
```

`chmod +x scripts/filter-generated.sh` nicht vergessen — Test 1 prüft das Executable-Bit.

Danach die fünf A1-Tests grün:

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/devflow-selection-archive-hardening.bats \
  --filter 'T002255-A1'
```

---

## Task 3 — `Taskfile.yml` `test:changed` verdrahten

In `test:changed` die `CHANGED`-Zuweisung durch den Filter leiten. Die zehn nachfolgenden
`grep`-Selektoren (`RUN_WEBSITE`, `RUN_E2E_WEBSITE`, `RUN_E2E_BRETT`, `RUN_E2E_SERVICES`,
`RUN_E2E_KORCZEWSKI` und die übrigen) bleiben **unverändert** — der Filter sitzt eine Ebene
davor.

Vorher:

```bash
CHANGED=$( (git diff --name-only HEAD origin/main 2>/dev/null || git diff --name-only HEAD 2>/dev/null; git diff --name-only HEAD) | sort -u || true)
```

Nachher:

```bash
CHANGED=$( (git diff --name-only HEAD origin/main 2>/dev/null || git diff --name-only HEAD 2>/dev/null; git diff --name-only HEAD) | sort -u | bash scripts/filter-generated.sh || true)
```

`freshness:check` bleibt unangetastet. Der Test
`freshness:check bleibt ungefiltert` schlägt fehl, falls der Filter dort einsickert.

---

## Task 4 — `scripts/devflow-post-merge-deploy.sh` umbauen

Drei Änderungen in einer Datei:

**4a — Filter vorschalten.** Zeile 8:

```bash
CHANGED=$(git diff-tree --no-commit-id -r --name-only "$MERGE_COMMIT" | bash scripts/filter-generated.sh)
```

**4b — Image-Builds durch CI-Verweise ersetzen.** Die drei Blöcke `task feature:website`,
`task feature:brett` und `task docs:deploy` entfallen. An ihre Stelle tritt eine Meldung mit
dem zuständigen Workflow, weil Prod pull-based via Flux ausgerollt wird und der lokale Build
einen GHCR-Login voraussetzt, den der Agent nicht hält:

```bash
if [[ "$DEPLOY_WEBSITE" == true ]]; then
  echo "ℹ Website-Image wird von .github/workflows/build-website.yml gebaut (pull-based via Flux) — kein lokaler Build."
fi
if [[ "$DEPLOY_BRETT" == true ]]; then
  echo "ℹ Brett-Image wird von .github/workflows/build-brett.yml gebaut — kein lokaler Build."
fi
if [[ "$DEPLOY_DOCS" == true ]]; then
  echo "ℹ Docs-Image wird von .github/workflows/build-docs.yml gebaut — kein lokaler Build."
fi
```

**4c — Break-Glass und fail-closed unangetastet lassen.** Der `DEPLOY_K8S`-Block mit
`task feature:deploy` bleibt (`kubectl apply` braucht keinen Registry-Login), ebenso das
`FAILED_TASKS`-Array und die `deploy blocked`-Meldung aus T002242-M3. Der bestehende Test
`tests/spec/ci-cd.bats:1209` bewacht das und muss grün bleiben:

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd.bats --filter 'T002242-M3'
```

Der frühe Ausstieg bei „keine Deploy-Trigger erkannt" (Zeilen 21–27) bleibt ebenfalls — er
greift jetzt häufiger, weil generierte Pfade keinen Trigger mehr setzen. Das ist beabsichtigt.

---

## Task 5 — `deploy-routing.md`

Generierte Pfade explizit als Nicht-Trigger festhalten, damit die Routing-SSOT die neue
Skript-Semantik beschreibt statt ihr zu widersprechen. Aufzunehmen:

- Pfade mit `linguist-generated` in `.gitattributes` lösen kein Deploy aus.
- Die Bildbau-Zeile pro Brand verweist auf den CI-Workflow statt auf `task feature:*`.

Prüfbar über den Test `deploy-routing.md dokumentiert generierte Pfade als Nicht-Trigger`.

---

## Task 6 — `.claude/skills/references/plan-archive-steps.md`

Vier Korrekturen in der Vorlage, der Agenten wörtlich folgen:

**6a — Branch-Name mit Ticket-ID.** Zeile 43:

```bash
ARCHIVE_BRANCH="chore/plan-archive-${SLUG//\//-}-${TICKET_ID}"
```

`${TICKET_ID}` unverändert einsetzen — der Guard in `.githooks/pre-commit:117` prüft
`[[ "$_bn" =~ T[0-9]{6,} ]]` case-sensitiv. Die Ticket-ID darf nicht aus einem
kleingeschriebenen Slug abgeleitet werden; dieselbe Falle ist in `mishap-tracker` Schritt 3.5
bereits dokumentiert.

**6b — Archiv-Branch von `origin/main`.** Statt `git checkout -b "$ARCHIVE_BRANCH"` vom
bereits squash-gemergten Fix-Branch:

```bash
git fetch origin main
git checkout -B "$ARCHIVE_BRANCH" origin/main
```

Die Archiv-Änderungen werden auf diesem Branch committet (oder per `git cherry-pick` vom
Fix-Branch übernommen). Nebeneffekt: der Archiv-PR zeigt garantiert nur die
Archiv-Änderungen im Diff.

**6c — Blockquote aus dem Code-Block lösen.** Die Fences sind paarweise balanciert (5/12,
17/24, 27/67), aber der Block 27–67 schließt den Blockquote ab Zeile 31 und den restlichen
Fließtext mit ein. Den bash-Block nach `bash scripts/openspec.sh archive "$SLUG"` schließen,
den Blockquote als Markdown stehen lassen, und für Schritt 4 einen neuen bash-Block öffnen.

**6d — Skript-Aufruf vor MCP.** Die Datei nennt heute beide Wege: MCP-first in Zeile 15,
`./scripts/ticket.sh archive-plan` als Fallback in Zeile 18. Die Reihenfolge umkehren und die
Bezeichnung „MCP-first" entfernen, weil `archive_plan` aus Worktrees fehlschlägt (Task 7).

---

## Task 7 — `.claude/skills/references/mcp-tool-guide.md`

Die Datei erwähnt `stage_plan` und `archive_plan` bisher nur in ihrer Tool-Tabelle (Zeile 100)
und einem Parameter-Hinweis (Zeile 105); eine Worktree-Einschränkung ist nirgends
dokumentiert. Einen Abschnitt ergänzen, der beide Tools nennt:

- Aus einem Worktree aufgerufen scheitern `stage_plan` und `archive_plan`, weil der
  MCP-Server Plan-Pfade relativ zum Haupt-Checkout auflöst, wo der Change-Ordner nur auf dem
  Branch existiert. Symptome: `does not exist in git` (stage_plan) bzw.
  `plan file does not exist or is empty` (archive_plan), obwohl die Datei im Worktree
  vorhanden ist.
- Primärweg in dieser Situation: `bash scripts/ticket.sh stage-plan` /
  `bash scripts/ticket.sh archive-plan`, aus dem Worktree ausgeführt.

Der MCP-Server selbst wird in diesem Change nicht angefasst. Nach dem Merge ein
Follow-up-Ticket anlegen für die `cwd`/worktree-Auflösung in `scripts/ticket-mcp`.

---

## Task 8 — Verifikation

```bash
# 1. Alle Tests dieses Changes grün
./tests/unit/lib/bats-core/bin/bats tests/spec/devflow-selection-archive-hardening.bats

# 2. Regression: der T002242-M3-Wächter bleibt grün
./tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd.bats

# 3. Filter im Echtbetrieb — auf diesem Branch darf die Selektion kein E2E ziehen
bash scripts/filter-generated.sh <<< "$(git diff --name-only HEAD origin/main)"

# 4. Test-Inventar nach der neuen BATS-Datei regenerieren
task test:inventory

# 5. OpenSpec-Delta validieren
task openspec:validate

# 6. Mandatory CI-Gates
task test:changed
task freshness:regenerate
task freshness:check
```

Schritt 3 ist die Probe aufs Exempel: der Branch enthält Änderungen unter `openspec/` und
`website/src/data/test-inventory.json`; nach dem Fix darf `task test:changed` in Schritt 6
kein Playwright mehr starten. Vor diesem Change war genau das der gemeldete Mishap.

`task test:inventory` (Schritt 4) ist Pflicht, weil eine neue BATS-Datei hinzukommt — der
CI-Inventar-Check vergleicht `website/src/data/test-inventory.json` gegen den committeten
Stand.
