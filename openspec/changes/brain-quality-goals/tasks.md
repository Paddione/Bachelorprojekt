---
title: "brain-quality-goals — Implementation Plan"
ticket_id: T001608
domains: [brain, templates, tests, docs]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# brain-quality-goals — Implementation Plan

## File Structure

**Neu (Create):**

- `tests/spec/brain-quality-goals.bats` — RED→GREEN-Fixtures für alle 6 Gates + Selbst-Konformität (NEUE Datei; NICHT an `tests/spec/brain-foundation.bats` anhängen — T001578 hat dort zuletzt appended, eigene Datei = null Merge-Konflikt-Risiko). S1: `.bats` gate-frei.
- `templates/brain/wiki/quality-goals.md` — die 11 G-BRAIN-Ziele (type: decision). S1: `.md` gate-frei.
- `templates/brain/wiki/usage.md` — How-to (type: runbook). S1: `.md` gate-frei.
- `templates/brain/wiki/cheatsheet.md` — Spickzettel (type: runbook). S1: `.md` gate-frei.
- `templates/brain/wiki/first-aid.md` — CI-Troubleshooting (type: runbook). S1: `.md` gate-frei.
- `templates/brain/wiki/llm-workflows.md` — Prompt-Vorlagen + Agent-Konventionen (type: runbook). S1: `.md` gate-frei.
- `templates/brain/README.md` — GitHub-Landing, ohne Frontmatter (Lint-exempt). S1: `.md` gate-frei.

**Geändert (Modify):**

- `templates/brain/scripts/lint-wikilinks.sh` — Alias/Anker-Syntax + Sammel-Diagnose (G-BRAIN01/04).
- `templates/brain/scripts/lint-frontmatter.sh` — Scope, tags-Pflicht, Diagnose statt Crash (G-BRAIN02/03/04).
- `templates/brain/.github/workflows/build-site.yml` — Lint-Job mit `needs` + kein raw/-Staging (G-BRAIN05/06). S1: `.yml` gate-frei.
- `templates/brain/SCHEMA.md` — Sprach-/Slug-Konvention, Lint-Scope, Wikilink-Formen, Verweis auf quality-goals. S1: `.md` gate-frei.
- `templates/brain/index.md` — verlinkt die 5 neuen Seiten. S1: `.md` gate-frei.
- `templates/brain/wiki/index-moc.md` — verlinkt die 5 neuen Seiten. S1: `.md` gate-frei.
- `templates/brain/log.md` — Journal-Eintrag für diesen Change (lebt G-BRAIN09 vor). S1: `.md` gate-frei.
- `website/src/data/test-inventory.json` — via `task test:inventory` regeneriert (CI-Inventar-Check). S1: `.json` gate-frei.

**S1-Budgets der gate-pflichtigen Dateien (aus intel.json, beide nicht-baselined, `.sh`-Limit 500):**

| Datei | Ist | Budget |
|---|---|---|
| `templates/brain/scripts/lint-wikilinks.sh` | 14 | 486 |
| `templates/brain/scripts/lint-frontmatter.sh` | 16 | 484 |

Beide Skripte wachsen auf ca. 15 bzw. 40 Zeilen — weit unter der wirksamen Schwelle; kein Split nötig.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 11 Qualitätsziele G-BRAIN01–11 für das LLM-Wiki definieren, die 6 Gate-Löcher (Linter + build-site-Pipeline) im Seed-Template reparieren und ein komplettes Nutzungs-Doku-Set seeden — RED→GREEN gegen eine neue BATS-Datei.

**Architecture:** Seed-SSOT ist `templates/brain/` (`scripts/brain-bootstrap.sh` kopiert rekursiv 1:1 — neue Dateien laufen ohne Bootstrap-Änderung mit). Beide Linter bleiben offline, POSIX-bash, gegen beliebiges Verzeichnis lauffähig (BATS-testbar in `mktemp -d`). `ci.yml` des brain-Repos bleibt unverändert; die Reparatur passiert in den Skripten, die es aufruft, plus im separaten `build-site.yml`.

**Tech Stack:** Bash (Linter), GitHub-Actions-YAML (Workflow-Template), Markdown (Wiki-Seiten), BATS (Tests).

## Kontext & Leitplanken

- **Design-Spec (SSOT für WAS/WARUM):** `docs/superpowers/specs/2026-07-03-brain-quality-goals-design.md`. **Plan Intel:** `openspec/changes/brain-quality-goals/intel.json`.
- **Ist-Verhalten (intel.json §symbols, verbindlich):** Der Wikilink-Linter grept nur `[A-Za-z0-9._-]+`-Slugs in Doppelklammern — Alias- und Anker-Form werden heute ignoriert (verifiziert: toter Alias-Link → exit 0). Der Frontmatter-Linter läuft über ALLE `*.md` inkl. `raw/` (latenter CI-Breaker), lässt leere tags passieren und crasht per `set -e` ohne Diagnose bei Enum-Case-Mismatch (`type: Note`). `build-site.yml` staged heute `index.md log.md SCHEMA.md wiki raw` und hat keinen `needs`-Lint-Job.
- **Nachrichten-Format-Verträge (Tests ⇄ Implementierung, exakt einhalten):**
  - Wikilink-Lint: `FAIL: <pfad> dead wikilink: [[<slug>]]` — `<slug>` ist der Teil vor `|` bzw. `#`.
  - Frontmatter-Lint: `FAIL: <pfad> missing required frontmatter field: <feld>` · `FAIL: <pfad> invalid type: <wert>` · `FAIL: <pfad> invalid status: <wert>` · `FAIL: <pfad> tags must be a non-empty list`.
- **Risiko Spec-Delta-Kollision (intel.json §risks):** `brain-site-dockerfile-template` (T001578) ist gemerged, aber nicht archiviert; beide Deltas zielen auf `openspec/specs/brain-foundation.md`. Unser Delta ist deshalb rein additiv (nur `## ADDED Requirements`). Beim Archivieren T001578 zuerst mergen; dass dessen Requirement-Text `raw` im Staging erwähnt, wird bei dessen bzw. unserem Archive aufgelöst — nicht in diesem Change.
- **Risiko Trigger-Lücke (intel.json §risks):** `task test:changed` matcht reine `templates/brain/**`-Änderungen nicht — die neue BATS-Datei liegt im selben PR, der `tests/spec/*.bats`-Glob von `test:factory` erfasst sie automatisch.
- **Risiko Code-Fences (intel.json §risks):** Der Wikilink-Linter parst KEINE Code-Fences — jeder Beispiel-Wikilink in den Doku-Seiten (auch in Fences) muss auf einen real existierenden Slug zeigen (`index-moc`, `quality-goals`, `SCHEMA`, …). Platzhalter werden als `[[<slug>]]` mit spitzen Klammern notiert — diese Form kann der Linter-Regex nicht matchen. Mess-Kommandos schreiben Klammer-Regexe so, dass nie zwei `[` direkt aufeinanderfolgen (`\[\[` bzw. `\[{2}`).
- **S3:** Keine Brand-Domain-Literale — alle Seiten referenzieren „die publizierte Quartz-Site" generisch.
- **Non-Goals:** Kein Enforcement der Targets G-BRAIN07–11, kein Ingest-Runner, keine Änderung an `scripts/brain-bootstrap.sh` oder an `templates/brain/.github/workflows/ci.yml`, keine Anbindung an Hauptrepo-goals.
- **Kompatibilität:** Alle 15 Tests in `tests/spec/brain-foundation.bats` müssen unverändert grün bleiben (Regressionslauf in Task 2–4 und 10).

---

### Task 1: RED — `tests/spec/brain-quality-goals.bats` anlegen

**Files:**
- Create: `tests/spec/brain-quality-goals.bats`

**Interfaces:**
- Consumes: `scripts/brain-bootstrap.sh` (Seed in Zielverzeichnis, exit 0), die beiden Linter-Pfade unter `templates/brain/scripts/`.
- Produces: die Testnamen/Assertions, gegen die Task 2–9 implementiert werden. Die Nachrichten-Format-Verträge stehen oben in „Kontext & Leitplanken".

- [ ] **Step 1: Testdatei mit vollständigem Inhalt anlegen**

```bash
#!/usr/bin/env bats
# tests/spec/brain-quality-goals.bats
# SSOT: openspec/specs/brain-foundation.md (Delta: openspec/changes/brain-quality-goals, T001608)
setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  BOOTSTRAP="$REPO_ROOT/scripts/brain-bootstrap.sh"
  LINT_WL="$REPO_ROOT/templates/brain/scripts/lint-wikilinks.sh"
  LINT_FM="$REPO_ROOT/templates/brain/scripts/lint-frontmatter.sh"
  TPL="$REPO_ROOT/templates/brain"
  WORK="$(mktemp -d)"
}
teardown() { rm -rf "$WORK"; }

# --- G-BRAIN01: Alias- und Anker-Wikilinks werden gelintet ------------------

@test "G-BRAIN01: dead alias wikilink [[ghost|Text]] fails lint-wikilinks" {
  mkdir -p "$WORK/w/wiki"
  printf -- '---\ntype: note\ntags: [x]\nstatus: active\n---\nsee [[ghost|Text]]\n' > "$WORK/w/wiki/a.md"
  run bash "$LINT_WL" "$WORK/w"
  [ "$status" -ne 0 ]
  [[ "$output" == *"dead wikilink: [[ghost]]"* ]]
}

@test "G-BRAIN01: dead anchor wikilink [[ghost#abschnitt]] fails lint-wikilinks" {
  mkdir -p "$WORK/w/wiki"
  printf -- '---\ntype: note\ntags: [x]\nstatus: active\n---\nsee [[ghost#abschnitt]]\n' > "$WORK/w/wiki/a.md"
  run bash "$LINT_WL" "$WORK/w"
  [ "$status" -ne 0 ]
  [[ "$output" == *"dead wikilink: [[ghost]]"* ]]
}

@test "G-BRAIN01: alias and anchor links to existing pages pass" {
  mkdir -p "$WORK/w/wiki"
  printf -- '---\ntype: note\ntags: [x]\nstatus: active\n---\nsee [[b|Alias]] und [[b#sektion]]\n' > "$WORK/w/wiki/a.md"
  printf -- '---\ntype: note\ntags: [x]\nstatus: active\n---\nhi\n' > "$WORK/w/wiki/b.md"
  run bash "$LINT_WL" "$WORK/w"
  [ "$status" -eq 0 ]
}

# --- G-BRAIN04 (Wikilinks): Sammel-Diagnose über alle Dateien ---------------

@test "G-BRAIN04: lint-wikilinks lists every dead link across files before exiting" {
  mkdir -p "$WORK/w/wiki"
  printf -- '---\ntype: note\ntags: [x]\nstatus: active\n---\nsee [[ghost-eins]]\n' > "$WORK/w/wiki/a.md"
  printf -- '---\ntype: note\ntags: [x]\nstatus: active\n---\nsee [[ghost-zwei|Alias]]\n' > "$WORK/w/wiki/b.md"
  run bash "$LINT_WL" "$WORK/w"
  [ "$status" -ne 0 ]
  [[ "$output" == *"[[ghost-eins]]"* ]]
  [[ "$output" == *"[[ghost-zwei]]"* ]]
}

# --- G-BRAIN02: tags muss nicht-leere Liste sein ----------------------------

@test "G-BRAIN02: empty tags list is rejected by lint-frontmatter" {
  mkdir -p "$WORK/w/wiki"
  printf -- '---\ntype: note\ntags: []\nstatus: active\n---\nbody\n' > "$WORK/w/wiki/a.md"
  run bash "$LINT_FM" "$WORK/w"
  [ "$status" -ne 0 ]
  [[ "$output" == *"tags must be a non-empty list"* ]]
}

@test "G-BRAIN02: bare tags line without values is rejected" {
  mkdir -p "$WORK/w/wiki"
  printf -- '---\ntype: note\ntags:\nstatus: active\n---\nbody\n' > "$WORK/w/wiki/a.md"
  run bash "$LINT_FM" "$WORK/w"
  [ "$status" -ne 0 ]
  [[ "$output" == *"tags must be a non-empty list"* ]]
}

# --- G-BRAIN03: Scope wiki/ + Hubs; raw/ und README.md exempt ---------------

@test "G-BRAIN03: raw/ files without frontmatter pass lint-frontmatter" {
  mkdir -p "$WORK/w/raw" "$WORK/w/wiki"
  printf -- 'rohes fragment ohne frontmatter\n' > "$WORK/w/raw/dump.md"
  printf -- '---\ntype: note\ntags: [x]\nstatus: active\n---\nbody\n' > "$WORK/w/wiki/ok.md"
  run bash "$LINT_FM" "$WORK/w"
  [ "$status" -eq 0 ]
}

@test "G-BRAIN03: README.md without frontmatter passes lint-frontmatter" {
  mkdir -p "$WORK/w/wiki"
  printf -- '# Landing ohne Frontmatter\n' > "$WORK/w/README.md"
  printf -- '---\ntype: note\ntags: [x]\nstatus: active\n---\nbody\n' > "$WORK/w/wiki/ok.md"
  run bash "$LINT_FM" "$WORK/w"
  [ "$status" -eq 0 ]
}

@test "G-BRAIN03: hub page index.md stays in lint scope" {
  mkdir -p "$WORK/w/wiki"
  printf -- 'kein frontmatter\n' > "$WORK/w/index.md"
  run bash "$LINT_FM" "$WORK/w"
  [ "$status" -ne 0 ]
  [[ "$output" == *"index.md"* ]]
}

# --- G-BRAIN04 (Frontmatter): Diagnose statt Crash, Weiterprüfung -----------

@test "G-BRAIN04: invalid enum yields FAIL line and later files are still checked" {
  mkdir -p "$WORK/w/wiki"
  printf -- '---\ntype: Note\ntags: [x]\nstatus: active\n---\nbody\n' > "$WORK/w/wiki/a.md"
  printf -- '---\ntype: note\ntags: [x]\nstatus: bogus\n---\nbody\n' > "$WORK/w/wiki/b.md"
  run bash "$LINT_FM" "$WORK/w"
  [ "$status" -ne 0 ]
  [[ "$output" == *"invalid type: Note"* ]]
  [[ "$output" == *"invalid status: bogus"* ]]
}

# --- G-BRAIN05/06: build-site.yml lint-gekoppelt, ohne raw/ -----------------

@test "G-BRAIN05: build-site.yml runs both linters in a lint job gating the build" {
  wf="$TPL/.github/workflows/build-site.yml"
  grep -q 'lint-wikilinks.sh' "$wf"
  grep -q 'lint-frontmatter.sh' "$wf"
  grep -qE 'needs:[[:space:]]*lint' "$wf"
}

@test "G-BRAIN06: build-site.yml stages no raw/ directory" {
  run grep -w 'raw' "$TPL/.github/workflows/build-site.yml"
  [ "$status" -ne 0 ]
}

# --- Seed-Vollständigkeit + Selbst-Konformität ------------------------------

@test "seed ships the five doc pages plus README, linked from both hubs" {
  for p in quality-goals usage cheatsheet first-aid llm-workflows; do
    [ -f "$TPL/wiki/$p.md" ]
    grep -q "$p" "$TPL/index.md"
    grep -q "$p" "$TPL/wiki/index-moc.md"
  done
  [ -f "$TPL/README.md" ]
}

@test "quality-goals page lists all eleven goals with baseline date" {
  qg="$TPL/wiki/quality-goals.md"
  for i in 01 02 03 04 05 06 07 08 09 10 11; do grep -q "G-BRAIN$i" "$qg"; done
  grep -q '2026-07-03' "$qg"
  grep -q 'type: decision' "$qg"
}

@test "llm-workflows ships at least five prompt templates incl. OpenSpec-SSOT-Sync" {
  n="$(grep -c '^### Prompt' "$TPL/wiki/llm-workflows.md")"
  [ "$n" -ge 5 ]
  grep -qi 'openspec' "$TPL/wiki/llm-workflows.md"
}

@test "self-conformity: full seed passes both repaired linters" {
  run bash "$BOOTSTRAP" "$WORK/brain"; [ "$status" -eq 0 ]
  run bash "$LINT_FM" "$WORK/brain"; [ "$status" -eq 0 ]
  run bash "$LINT_WL" "$WORK/brain"; [ "$status" -eq 0 ]
}
```

- [ ] **Step 2: RED-Lauf — Suite muss auf dem aktuellen Stand rot sein**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/brain-quality-goals.bats`
expected: FAIL — u. a. die G-BRAIN01/02/03-Fixtures (Alias/Anker/tags/raw heute ungeprüft bzw. falsch gescoped), G-BRAIN04 (set-e-Crash ohne Diagnose), G-BRAIN05/06 (`needs`-Job fehlt, `raw` wird gestaged) und die Seed-Vollständigkeits-Tests (Seiten existieren noch nicht). Nur die Fixtures „alias and anchor links to existing pages pass" und „hub page index.md stays in lint scope" dürfen schon grün sein.

- [ ] **Step 3: Commit**

```bash
git add tests/spec/brain-quality-goals.bats
git commit -m "test(brain): RED fixtures for G-BRAIN01-06 gates + seed docs [T001608]"
```

---

### Task 2: `lint-wikilinks.sh` — Alias/Anker + Sammel-Diagnose (G-BRAIN01, G-BRAIN04)

**Files:**
- Modify: `templates/brain/scripts/lint-wikilinks.sh` (Vollersatz, 15 Zeilen — Budget 486)
- Test: `tests/spec/brain-quality-goals.bats` (Filter `G-BRAIN01|G-BRAIN04`)

**Interfaces:**
- Consumes: Aufruf-Konvention `lint-wikilinks.sh <dir>` → exit 0|1 (unverändert, ci.yml-kompatibel).
- Produces: Meldungsformat `FAIL: <pfad> dead wikilink: [[<slug>]]` mit `<slug>` = Teil vor `|`/`#`; Slug-Menge bleibt: Basenames aller `*.md` unter `<dir>` (inkl. Hubs).

- [ ] **Step 1: Skript vollständig ersetzen**

```bash
#!/usr/bin/env bash
# lint-wikilinks.sh — validates that every wikilink ([[slug]], [[slug|Alias]],
# [[slug#anchor]]) in the brain wiki resolves to an existing page. Collects
# every dead link across all files, then exits non-zero. Offline, POSIX-bash,
# no network. See ../SCHEMA.md and wiki/quality-goals.md (G-BRAIN01/04).
set -euo pipefail
root="${1:-.}"; rc=0
mapfile -t slugs < <(find "$root" -name '*.md' -type f -exec basename {} .md \; | sort -u)
in_slugs() { local s="$1"; for k in "${slugs[@]}"; do [[ "$k" == "$s" ]] && return 0; done; return 1; }
while IFS= read -r f; do
  while IFS= read -r link; do
    slug="${link#\[\[}"; slug="${slug%\]\]}"; slug="${slug%%[#|]*}"
    in_slugs "$slug" || { echo "FAIL: $f dead wikilink: [[$slug]]"; rc=1; }
  done < <(grep -oE '\[\[[A-Za-z0-9._-]+([|#][^]]*)?\]\]' "$f" || true)
done < <(find "$root" -name '*.md' -type f)
exit "$rc"
```

Kern der Reparatur: Der Grep-Ausdruck erhält die optionale Gruppe `([|#][^]]*)?` (Alias-/Anker-Teil), die Slug-Extraktion schneidet mit `${slug%%[#|]*}` alles ab `|`/`#` ab. Die Schleife lief schon vorher über alle Dateien weiter — sie bleibt unverändert und garantiert zusammen mit `exit "$rc"` am Ende die Sammel-Diagnose (alle Verstöße gelistet, Exit ≠ 0 erst am Schluss).

- [ ] **Step 2: Gezielte Tests grün**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/brain-quality-goals.bats -f 'G-BRAIN01|G-BRAIN04: lint-wikilinks'`
Expected: PASS (4 Tests).

- [ ] **Step 3: Regression — Bestandssuite bleibt grün**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/brain-foundation.bats`
Expected: PASS (15 Tests; das Meldungsformat für `[[ghost]]` ist unverändert).

- [ ] **Step 4: Commit**

```bash
git add templates/brain/scripts/lint-wikilinks.sh
git commit -m "fix(brain): wikilink lint parses alias/anchor links, collects all findings [T001608]"
```

---

### Task 3: `lint-frontmatter.sh` — Scope, tags-Pflicht, Diagnose statt Crash (G-BRAIN02, G-BRAIN03, G-BRAIN04)

**Files:**
- Modify: `templates/brain/scripts/lint-frontmatter.sh` (Vollersatz, ca. 40 Zeilen — Budget 484)
- Test: `tests/spec/brain-quality-goals.bats` (Filter `G-BRAIN02|G-BRAIN03|G-BRAIN04: invalid`)

**Interfaces:**
- Consumes: Aufruf-Konvention `lint-frontmatter.sh <dir>` → exit 0|1 (unverändert, ci.yml-kompatibel).
- Produces: Scope = `wiki/**/*.md` + `index.md`/`log.md`/`SCHEMA.md` im Root; `raw/**` und `README.md` exempt. Meldungsformate wie in „Kontext & Leitplanken" (bestehende drei Formate byte-gleich erhalten, neu: `tags must be a non-empty list`).

- [ ] **Step 1: Skript vollständig ersetzen**

```bash
#!/usr/bin/env bash
# lint-frontmatter.sh — validates required frontmatter fields on wiki pages and
# the hub pages index.md, log.md, SCHEMA.md. raw/ and README.md are exempt.
# Reports every violation (file + field + value) and exits non-zero at the end
# instead of aborting on the first finding. Offline, POSIX-bash, no network.
# See ../SCHEMA.md and wiki/quality-goals.md (G-BRAIN02/03/04).
set -euo pipefail
root="${1:-.}"; rc=0

list_targets() {
  if [ -d "$root/wiki" ]; then
    find "$root/wiki" -name '*.md' -type f
  fi
  for hub in index.md log.md SCHEMA.md; do
    if [ -f "$root/$hub" ]; then printf '%s\n' "$root/$hub"; fi
  done
}

fm_value() { # fm_value <fm-block> <field> -> value after "<field>:" (may be empty)
  grep -E "^$2:" <<<"$1" | head -n1 | sed -E "s/^$2:[[:space:]]*//" || true
}

while IFS= read -r f; do
  [ -n "$f" ] || continue
  fm="$(awk 'NR==1&&$0!="---"{exit} /^---$/{c++; if(c==2) exit; next} c==1' "$f")"
  for field in type tags status; do
    grep -qE "^${field}:" <<<"$fm" || { echo "FAIL: $f missing required frontmatter field: $field"; rc=1; }
  done
  if grep -qE '^type:' <<<"$fm"; then
    t="$(fm_value "$fm" type)"
    [[ "$t" =~ ^(note|moc|entity|decision|runbook)$ ]] || { echo "FAIL: $f invalid type: $t"; rc=1; }
  fi
  if grep -qE '^status:' <<<"$fm"; then
    s="$(fm_value "$fm" status)"
    [[ "$s" =~ ^(draft|active|archived)$ ]] || { echo "FAIL: $f invalid status: $s"; rc=1; }
  fi
  if grep -qE '^tags:' <<<"$fm"; then
    tags="$(fm_value "$fm" tags)"; tags="${tags//[[:space:]]/}"
    if [[ -z "$tags" || "$tags" == "[]" ]]; then
      echo "FAIL: $f tags must be a non-empty list"; rc=1
    fi
  fi
done < <(list_targets)
exit "$rc"
```

Warum das den set-e-Crash behebt: Im alten Skript stand die Enum-Extraktion als nackte Pipeline in einer Kommandosubstitution (`grep -oE '^type: *[a-z]+' … | awk …`) — bei `type: Note` matcht der Grep nicht, `pipefail` schlägt durch und `set -e` beendet das Skript ohne FAIL-Zeile, bevor weitere Dateien geprüft sind. Neu wird jede Extraktion durch `fm_value` mit `|| true` abgesichert und nur nach positivem Präsenz-Check ausgewertet; jede Verletzung erzeugt eine FAIL-Zeile, geprüft wird immer bis zum Ende, `exit "$rc"` erst am Schluss. Case-Mismatch (`Note`) fällt jetzt durch den Enum-Vergleich statt durchs Skript.

- [ ] **Step 2: Gezielte Tests grün**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/brain-quality-goals.bats -f 'G-BRAIN02|G-BRAIN03|G-BRAIN04: invalid'`
Expected: PASS (6 Tests).

- [ ] **Step 3: Regression — Bestandssuite bleibt grün**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/brain-foundation.bats`
Expected: PASS (die Fixtures dort liegen unter `wiki/` und bleiben im Scope; Meldungsformate unverändert).

- [ ] **Step 4: Commit**

```bash
git add templates/brain/scripts/lint-frontmatter.sh
git commit -m "fix(brain): frontmatter lint scoped to wiki+hubs, non-empty tags, full diagnostics [T001608]"
```

---

### Task 4: `build-site.yml` — Lint-Job mit `needs`, kein raw/-Staging (G-BRAIN05, G-BRAIN06)

**Files:**
- Modify: `templates/brain/.github/workflows/build-site.yml` (Vollersatz)
- Test: `tests/spec/brain-quality-goals.bats` (Filter `G-BRAIN05|G-BRAIN06`)

**Interfaces:**
- Consumes: `scripts/lint-wikilinks.sh`/`scripts/lint-frontmatter.sh` aus Task 2/3 (Aufruf gegen `.`).
- Produces: Job-Namen `lint` und `build` (`needs: lint`); Staging-Liste exakt `index.md log.md SCHEMA.md wiki`. Wichtig: Das Wort `raw` darf NIRGENDS in der Datei vorkommen (auch nicht in Kommentaren) — der G-BRAIN06-Test prüft mit `grep -w`.

- [ ] **Step 1: Workflow vollständig ersetzen**

```yaml
name: Build & Push Quartz Site

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  packages: write

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Wikilink lint
        run: bash scripts/lint-wikilinks.sh .
      - name: Frontmatter lint
        run: bash scripts/lint-frontmatter.sh .
  build:
    runs-on: ubuntu-latest
    needs: lint
    steps:
      - uses: actions/checkout@v4
      - name: Stage build context
        run: |
          mkdir -p /tmp/build/content
          cp -R index.md log.md SCHEMA.md wiki /tmp/build/content/
          cp site.Dockerfile /tmp/build/Dockerfile
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: /tmp/build
          push: true
          tags: ghcr.io/paddione/brain-site:latest
```

- [ ] **Step 2: Gezielte Tests grün**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/brain-quality-goals.bats -f 'G-BRAIN05|G-BRAIN06'`
Expected: PASS (2 Tests).

- [ ] **Step 3: Regression — T001578-Assertions halten**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/brain-foundation.bats -f 'build-site|site.Dockerfile'`
Expected: PASS (`ghcr.io/paddione/brain-site:latest` und `site.Dockerfile` bleiben referenziert).

- [ ] **Step 4: Commit**

```bash
git add templates/brain/.github/workflows/build-site.yml
git commit -m "fix(brain): site build gated on lint job, raw/ removed from staging [T001608]"
```

---

### Task 5: Wiki-Seite `quality-goals.md` (die 11 Ziele)

**Files:**
- Create: `templates/brain/wiki/quality-goals.md`
- Test: `tests/spec/brain-quality-goals.bats` (Filter `quality-goals page`)

**Interfaces:**
- Consumes: Meldungs-/Gate-Semantik aus Task 2–4 (die Gate-Zeilen der Tabelle beschreiben genau das dort implementierte Verhalten).
- Produces: Slug `quality-goals` (Linkziel für Task 6–9); Abschnittsanker `#targets-g-brain07-11--mess-kommandos` wird nicht referenziert — Anker-Beispiele in anderen Seiten nutzen `SCHEMA#wikilinks`.

- [ ] **Step 1: Seite mit vollständigem Inhalt anlegen**

````markdown
---
type: decision
tags: [quality, goals, meta]
status: active
source:: Bachelorprojekt openspec/changes/brain-quality-goals (T001608)
---
# Quality Goals — G-BRAIN01 bis G-BRAIN11

Verbindliche Qualitätsziele für Struktur und Organisation dieses Wikis.
Baseline gemessen am 2026-07-03 (Seed-Zustand: 2 Wiki-Seiten, leeres raw/).
Klassen: **Gate** = maschinell erzwungen (Linter/CI), **Target** = dokumentiert
gemessen, bewusst ohne Enforcement.

| ID | Ziel | Klasse | Baseline (2026-07-03) | Target |
|---|---|---|---|---|
| G-BRAIN01 | Wikilink-Lint versteht alle drei Formen (plain, Alias, Anker); 0 tote Links | Gate | Alias/Anker ungeprüft | alle 3 Formen geprüft, 0 tote Links |
| G-BRAIN02 | `tags` nicht-leer auf jeder Frontmatter-pflichtigen Seite | Gate | `tags: []` passierte den Lint | leere tags werden abgewiesen |
| G-BRAIN03 | Frontmatter-Lint scoped auf `wiki/` + Hubs; `raw/` und `README.md` exempt | Gate | Lint lief über alle `*.md` inkl. `raw/` | korrekt gescoped |
| G-BRAIN04 | Beide Linter melden ALLE Verstöße (Datei + Feld/Link) und brechen nie stumm ab | Gate | Crash ohne Diagnose bei ungültigem Enum | vollständige Fehlerliste, Exit ungleich 0 erst am Ende |
| G-BRAIN05 | Site-Build/Publikation nur nach grünem Lint | Gate | Build entkoppelt vom Lint | Lint-Job als `needs`-Voraussetzung |
| G-BRAIN06 | `raw/` erscheint nicht im publizierten Site-Content | Gate | `raw/` wurde mitpubliziert | aus dem Content-Staging entfernt |
| G-BRAIN07 | 0 Orphan-Seiten: jede `wiki/`-Seite ist von mindestens einer anderen Seite verlinkt | Target | 0 Orphans (unbewacht) | 0 Orphans, regelmäßig gemessen |
| G-BRAIN08 | Jede `wiki/`-Seite ist über maximal 2 MOC-Hops von `index.md` erreichbar | Target | erfüllt (trivial bei 2 Seiten) | weiterhin max. 2 Hops |
| G-BRAIN09 | 1 `log.md`-Eintrag pro inhaltlichem Commit auf main | Target | 1 Eintrag / 2 Commits (50 %) | 100 % |
| G-BRAIN10 | Keine `raw/`-Datei älter als 14 Tage (Backlog-Frische) | Target | raw/ leer | gemessen ab Erst-Ingest |
| G-BRAIN11 | Jede Hauptrepo-Spec (`openspec/specs/*.md`) hat eine Brain-Seite mit `source::`-Rückverweis | Target | 0/24 | 24/24 |

## Gates (G-BRAIN01–06)

Die sechs Gates werden maschinell erzwungen: `scripts/lint-wikilinks.sh` und
`scripts/lint-frontmatter.sh` laufen in der CI auf jeden Push/PR; der
Site-Build startet nur nach grünem Lint-Job und staged `raw/` nicht auf die
publizierte Quartz-Site. Fehlermeldungen und Fixes: [[first-aid]].

## Targets (G-BRAIN07–11) — Mess-Kommandos

Jedes Kommando läuft offline im Repo-Root.

### G-BRAIN07 — Orphans

```bash
for p in wiki/*.md; do s="$(basename "$p" .md)"; grep -rl --include='*.md' -e "\[\[$s" . | grep -v "wiki/$s.md" | grep -q . || echo "ORPHAN: $s"; done
```

Ziel: keine `ORPHAN:`-Zeile.

### G-BRAIN08 — MOC-Hops

```bash
links() { grep -oE '\[{2}[A-Za-z0-9._-]+' "$1" 2>/dev/null | tr -d '[' ; }
l1="$(links index.md)"; l2="$(for s in $l1; do f="$(find . -name "$s.md" | head -n1)"; [ -n "$f" ] && links "$f"; done)"
for p in wiki/*.md; do s="$(basename "$p" .md)"; printf '%s\n' $l1 $l2 | grep -qx "$s" || echo "TIEFER-ALS-2-HOPS: $s"; done
```

Ziel: keine `TIEFER-ALS-2-HOPS:`-Zeile.

### G-BRAIN09 — Journal-Disziplin

```bash
c="$(git log --oneline --no-merges -- wiki raw index.md SCHEMA.md | wc -l)"; e="$(grep -c '^- 20' log.md)"; echo "log-Eintraege: $e / Content-Commits: $c (Ziel: e >= c)"
```

### G-BRAIN10 — raw/-Backlog-Frische

```bash
find raw -name '*.md' -type f -mtime +14 -print | grep . && echo 'BACKLOG UEBERALTERT' || echo 'raw-Backlog OK'
```

### G-BRAIN11 — OpenSpec-SSOT-Abdeckung

```bash
n="$(grep -rlE '^source:: .*openspec/specs/' wiki | wc -l)"; echo "SSOT-Seiten: $n / 24 (Nenner: Specs im Hauptrepo, Stand 2026-07-03)"
```

Erfüllung via künftigen Ingest (Worklist-Gruppe `ssot-specs` im Hauptrepo);
siehe [[llm-workflows]] für den Sync-Prompt.

## Beförderungs-Regel Target → Gate

Ein Target wird zum Gate befördert, sobald sein Mess-Kommando über ca. 4 Wochen
stabil das Ziel hält: Kommando als `scripts/`-Check portieren, als CI-Step
registrieren, Tabellenzeile hier auf Klasse Gate umstellen. Entscheidung und
Datum gehören als Eintrag in [[log]].

Siehe auch: [[usage]], [[cheatsheet]], [[SCHEMA]].
````

- [ ] **Step 2: Gezielter Test grün**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/brain-quality-goals.bats -f 'quality-goals page'`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add templates/brain/wiki/quality-goals.md
git commit -m "feat(brain): quality-goals page with G-BRAIN01-11, baselines + measurement commands [T001608]"
```

---

### Task 6: Wiki-Seiten `usage.md` + `cheatsheet.md`

**Files:**
- Create: `templates/brain/wiki/usage.md`
- Create: `templates/brain/wiki/cheatsheet.md`

**Interfaces:**
- Consumes: Slugs `quality-goals` (Task 5), `SCHEMA`, `index-moc`, `log`, `first-aid`/`llm-workflows` (Task 7 — Wikilinks darauf werden erst mit Task 7 auflösbar; deshalb läuft der Template-Lint erst in Task 9).
- Produces: Slugs `usage` und `cheatsheet`.

- [ ] **Step 1: `usage.md` mit vollständigem Inhalt anlegen**

````markdown
---
type: runbook
tags: [howto, meta]
status: active
source:: Bachelorprojekt openspec/changes/brain-quality-goals (T001608)
---
# Usage — Seiten anlegen und pflegen

## Neue Seite anlegen

1. Slug wählen: kebab-case, englisch, sprechend (Konvention in [[SCHEMA]]).
2. Datei `wiki/<slug>.md` anlegen — Frontmatter-Template aus [[cheatsheet]] kopieren.
3. `type` wählen (Tabelle unten), `tags` nicht-leer füllen, mit `status: draft` starten.
4. Von mindestens einer bestehenden Seite verlinken — üblicherweise [[index-moc]] —
   sonst entsteht ein Orphan (G-BRAIN07 in [[quality-goals]]).
5. Beide Lint-Skripte lokal laufen lassen (Kommandos in [[cheatsheet]]), committen,
   Eintrag in [[log]] ergänzen.

## Welcher type?

| type | wofür |
|---|---|
| note | Wissens-/Konzeptseite (Standard) |
| moc | Map of Content — thematischer Hub, bündelt Links |
| entity | Person, System, Dienst, Organisation |
| decision | festgehaltene Entscheidung inkl. Begründung |
| runbook | Schritt-für-Schritt-Anleitung |

## raw → wiki

Rohmaterial (Transkripte, Exporte, Fragmente) landet ohne Frontmatter-Zwang in
`raw/`. Von dort wird es zu gelinteten `wiki/`-Seiten **kompiliert, nicht
verschoben** ([[SCHEMA]]): Erkenntnisse destillieren, Quelle als `source::`
referenzieren, raw-Datei nach dem Destillat löschen (G-BRAIN10: kein Eintrag
älter als 14 Tage). Prompt-Vorlage dafür: [[llm-workflows]].

## log.md pflegen

Pro inhaltlichem Commit ein Eintrag in [[log]] (G-BRAIN09): Datum, was, warum,
betroffene Seiten als Wikilinks.

Erste Hilfe bei roter CI: [[first-aid]].
````

- [ ] **Step 2: `cheatsheet.md` mit vollständigem Inhalt anlegen**

````markdown
---
type: runbook
tags: [howto, reference]
status: active
source:: Bachelorprojekt openspec/changes/brain-quality-goals (T001608)
---
# Cheatsheet

## Frontmatter-Template (kopieren, anpassen)

```yaml
---
type: note
tags: [thema]
status: draft
source:: Bachelorprojekt docs/pfad-zur-quelle (Kontext)
---
```

Erlaubte Werte — `type`: note, moc, entity, decision, runbook ·
`status`: draft, active, archived · `tags`: nicht-leere Liste (leere Liste
wird vom Lint abgewiesen, G-BRAIN02). Welcher `type` wofür: [[usage]].

## Wikilink-Syntax (alle drei Formen werden gelintet)

- Plain: `[[index-moc]]` — Linkziel ist der Dateiname ohne Endung.
- Alias: `[[quality-goals|Qualitätsziele]]` — eigener Linktext nach dem Strich.
- Anker: `[[SCHEMA#wikilinks]]` — Sprung zu einer Überschrift.

Der Lint prüft den Slug-Teil vor `|` bzw. `#` — auch in Code-Fences. Für
Platzhalter-Beispiele deshalb spitze Klammern nutzen: `[[<slug>]]` matcht der
Linter nicht.

## source::-Rückverweise

```text
source:: Bachelorprojekt openspec/specs/brain-foundation.md
source:: Vaultwarden-Eintrag "GPU-Host" (Credentials NIE im Klartext)
```

## Sprach- und Slug-Konvention (Kurzform, verbindlich in [[SCHEMA]])

Prosa deutsch, Fachbegriffe englisch; Slugs kebab-case, englisch, sprechend.

## Lint lokal

```bash
bash scripts/lint-frontmatter.sh .
bash scripts/lint-wikilinks.sh .
```

Rote CI entwirren: [[first-aid]] · Ziele und Mess-Kommandos: [[quality-goals]].
````

- [ ] **Step 3: Plausibilitäts-Check (Seiten existieren, Frontmatter korrekt)**

Run: `grep -l 'type: runbook' templates/brain/wiki/usage.md templates/brain/wiki/cheatsheet.md`
Expected: beide Pfade werden gelistet.

- [ ] **Step 4: Commit**

```bash
git add templates/brain/wiki/usage.md templates/brain/wiki/cheatsheet.md
git commit -m "feat(brain): usage + cheatsheet runbook pages [T001608]"
```

---

### Task 7: Wiki-Seiten `first-aid.md` + `llm-workflows.md`

**Files:**
- Create: `templates/brain/wiki/first-aid.md`
- Create: `templates/brain/wiki/llm-workflows.md`
- Test: `tests/spec/brain-quality-goals.bats` (Filter `llm-workflows`)

**Interfaces:**
- Consumes: Meldungsformate aus Task 2/3 (werden hier wörtlich dokumentiert), Slugs aus Task 5/6.
- Produces: Slugs `first-aid` und `llm-workflows`; `llm-workflows` mit exakt dem Header-Muster `### Prompt N — Titel` (der BATS-Test zählt `^### Prompt`).

- [ ] **Step 1: `first-aid.md` mit vollständigem Inhalt anlegen**

````markdown
---
type: runbook
tags: [troubleshooting, ci]
status: active
source:: Bachelorprojekt openspec/changes/brain-quality-goals (T001608)
---
# First Aid — CI ist rot

## 1 · Welcher Check ist rot?

**Wikilink-Lint** — Meldung: `FAIL: <datei> dead wikilink: [[<slug>]]`
- Tippfehler im Slug? Zielseite umbenannt oder nie angelegt?
- Achtung: auch Links in Code-Fences werden geprüft. Beispiel-Links auf echte
  Seiten zeigen lassen oder Platzhalter als `[[<slug>]]` mit spitzen Klammern
  schreiben ([[cheatsheet]]).

**Frontmatter-Lint** — Meldungen:
- `missing required frontmatter field: <feld>` — `type`/`tags`/`status` ergänzen.
- `invalid type: <wert>` bzw. `invalid status: <wert>` — nur kleingeschriebene
  Enum-Werte sind gültig (`Note` ist ungültig, `note` nicht).
- `tags must be a non-empty list` — mindestens ein Tag setzen.
- Scope: `wiki/` plus `index.md`, `log.md`, `SCHEMA.md`. `raw/` und `README.md`
  sind ausgenommen — eine Meldung auf diese Pfade wäre ein Linter-Bug.

**Secret-Scan (gitleaks)** — Fund entfernen, Wert rotieren, nur noch als
Verweis notieren (nie Klartext, siehe [[SCHEMA]]).

## 2 · Lint lokal reproduzieren

```bash
bash scripts/lint-frontmatter.sh .
bash scripts/lint-wikilinks.sh .
```

Beide Linter listen ALLE Verstöße (G-BRAIN04) — die Ausgabe ist die
vollständige Fix-Liste, kein iteratives Raten nötig.

## 3 · Site-Build rot?

Der Build läuft erst nach grünem Lint-Job (G-BRAIN05). Lokal testen:

```bash
mkdir -p /tmp/build/content
cp -R index.md log.md SCHEMA.md wiki /tmp/build/content/
cp site.Dockerfile /tmp/build/Dockerfile
docker build -t brain-site-test /tmp/build
```

`raw/` gehört nicht ins Staging (G-BRAIN06) — die publizierte Quartz-Site
enthält nur gelintete Inhalte.

Ziele und Mess-Kommandos: [[quality-goals]] · How-to: [[usage]].
````

- [ ] **Step 2: `llm-workflows.md` mit vollständigem Inhalt anlegen**

````markdown
---
type: runbook
tags: [llm, workflow]
status: active
source:: Bachelorprojekt openspec/changes/brain-quality-goals (T001608)
---
# LLM-Workflows — den Brain maschinell anreichern

## Ingest-Weg

Im Hauptrepo (Bachelorprojekt) existiert die Skill `brain-ingest` samt
Worklist; die Gruppe `ssot-specs` listet alle OpenSpec-SSOT-Specs als
Ingest-Kandidaten (G-BRAIN11 in [[quality-goals]]). Rohmaterial landet in
`raw/`, destillierte Seiten in `wiki/` — Details in [[usage]].

## Agent-Konventionen (Pflicht)

1. **source::-Pflicht:** Jede kompilierte Seite trägt mindestens eine
   `source::`-Zeile auf ihre Quelle ([[cheatsheet]]).
2. **Kompilieren, nicht verschieben:** Quellinhalte bleiben im
   Ursprungs-Repository ([[SCHEMA]]); Wiki-Seiten fassen zusammen.
3. **Kein Orphan:** Neue Seiten aus [[index-moc]] (oder einem thematischen MOC)
   verlinken.
4. **Lint vor Push:** Beide Skripte lokal ausführen ([[cheatsheet]]).
5. **Journal:** Pro Commit ein [[log]]-Eintrag (G-BRAIN09).

## Prompt-Vorlagen

### Prompt 1 — Neue Wiki-Seite anlegen

```text
Lege im brain-Repo eine neue Wiki-Seite an. Thema: <Thema>.
1. Lies SCHEMA.md (Frontmatter-Pflicht, Wikilink-Formen, Sprachkonvention).
2. Erzeuge wiki/<slug>.md (Slug: kebab-case, englisch) mit type/tags/status
   (Start: draft) und mindestens einer source::-Zeile auf die Quelle.
3. Verlinke die Seite aus wiki/index-moc.md (kein Orphan).
4. Fuehre bash scripts/lint-frontmatter.sh . und bash scripts/lint-wikilinks.sh . aus.
5. Ergaenze einen log.md-Eintrag (Datum, was, warum).
```

### Prompt 2 — Bestehende Seite verdichten

```text
Verdichte die Wiki-Seite wiki/<slug>.md, ohne Wissen zu verlieren.
Regeln: Frontmatter nur bei status aendern, source::-Zeilen erhalten,
bestehende Wikilinks weiterverwenden oder bewusst entfernen (Ziel-Seiten
muessen ueber index-moc erreichbar bleiben). Danach beide Lint-Skripte
ausfuehren und einen log.md-Eintrag ergaenzen.
```

### Prompt 3 — MOC pflegen

```text
Pruefe wiki/index-moc.md gegen den Bestand unter wiki/:
1. Liste Seiten, die von keiner anderen Seite verlinkt sind (Orphans).
2. Gruppiere thematisch; lege ab ca. 10 ungruppierten Seiten einen neuen
   MOC (type: moc) an und verlinke ihn aus index.md (max. 2 Hops).
3. Beide Lint-Skripte ausfuehren, log.md-Eintrag ergaenzen.
```

### Prompt 4 — raw → wiki destillieren

```text
Destilliere raw/<datei>.md in gelintete Wiki-Seiten (kompilieren, nicht
verschieben — siehe SCHEMA.md):
1. Extrahiere die wiederverwendbaren Erkenntnisse; eine Seite pro Konzept.
2. Jede neue Seite: Frontmatter, source::-Rueckverweis auf die
   Ursprungsquelle, Verlinkung aus einem MOC.
3. Loesche die raw-Datei nach dem Destillat (Backlog-Frische: 14 Tage).
4. Beide Lint-Skripte ausfuehren, log.md-Eintrag ergaenzen.
```

### Prompt 5 — OpenSpec-SSOT-Sync

```text
Synchronisiere eine Hauptrepo-Spec ins brain-Wiki:
Quelle: Bachelorprojekt openspec/specs/<spec-slug>.md (SSOT — bleibt dort).
1. Kompiliere sie zu wiki/<spec-slug>.md: Purpose als Kurzfassung,
   Requirements als Stichpunkte — keine Volltext-Kopie.
2. Frontmatter: type: note, tags: [ssot, spec], status: active.
3. Pflicht-Zeile: source:: Bachelorprojekt openspec/specs/<spec-slug>.md
4. Verlinke die Seite aus wiki/index-moc.md; beide Lint-Skripte ausfuehren;
   log.md-Eintrag ergaenzen.
Kandidatenliste: Ingest-Worklist-Gruppe ssot-specs im Hauptrepo.
```

Ziele: [[quality-goals]] · Troubleshooting: [[first-aid]].
````

- [ ] **Step 3: Gezielter Test grün**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/brain-quality-goals.bats -f 'llm-workflows'`
Expected: PASS (5 Prompt-Header gezählt, OpenSpec-Erwähnung vorhanden).

- [ ] **Step 4: Commit**

```bash
git add templates/brain/wiki/first-aid.md templates/brain/wiki/llm-workflows.md
git commit -m "feat(brain): first-aid + llm-workflows runbook pages (5 prompt templates) [T001608]"
```

---

### Task 8: `README.md` (neu) + `SCHEMA.md`-Nachträge

**Files:**
- Create: `templates/brain/README.md`
- Modify: `templates/brain/SCHEMA.md`

**Interfaces:**
- Consumes: Slug `quality-goals` (Task 5), Lint-Scope-Semantik (Task 3).
- Produces: README ohne Frontmatter und ohne Wikilinks (nur relative Markdown-Links — GitHub-Rendering; der Frontmatter-Lint exempted README, der Wikilink-Lint scannt es trotzdem).

- [ ] **Step 1: `README.md` mit vollständigem Inhalt anlegen**

````markdown
# brain

Gemeinsames LLM-Wiki (Karpathy-Pattern) von Patrick und Gekko. Rohmaterial
landet in `raw/`, destillierte Wissensseiten in `wiki/`; eine Quartz-Site
publiziert den Wiki-Inhalt (ohne `raw/`) automatisch bei jedem Push auf main.

- Konventionen (verbindlich): [SCHEMA.md](SCHEMA.md)
- Einstieg & How-to: [wiki/usage.md](wiki/usage.md)
- Spickzettel: [wiki/cheatsheet.md](wiki/cheatsheet.md)
- Qualitätsziele G-BRAIN01–11: [wiki/quality-goals.md](wiki/quality-goals.md)
- CI rot? [wiki/first-aid.md](wiki/first-aid.md)
- LLM-Anreicherung: [wiki/llm-workflows.md](wiki/llm-workflows.md)

Qualitäts-Gates (Wikilink-/Frontmatter-Lint, Secret-Scan) laufen auf jeden
Push/PR; der Site-Build startet nur nach grünem Lint.
````

- [ ] **Step 2: `SCHEMA.md` — Frontmatter-Scope präzisieren (Edit 1)**

Alt (Abschnitt „Frontmatter-Pflichtfelder", einleitender Satz):

```text
Jede `.md`-Datei unter `wiki/` (und die Hub-Seiten `index.md`, `log.md`) trägt einen
YAML-Frontmatter-Block mit mindestens:
```

Neu:

```text
Jede `.md`-Datei unter `wiki/` sowie die Hub-Seiten `index.md`, `log.md` und
`SCHEMA.md` tragen einen YAML-Frontmatter-Block mit mindestens den folgenden
Feldern — `raw/` und `README.md` sind vom Frontmatter-Lint ausgenommen:
```

- [ ] **Step 3: `SCHEMA.md` — Wikilink-Formen ergänzen (Edit 2, ans Ende des Abschnitts „Wikilinks" anfügen)**

```text
Erlaubte Formen: `[[index-moc]]` (plain), `[[quality-goals|Anzeigetext]]`
(Alias) und `[[SCHEMA#wikilinks]]` (Anker) — `scripts/lint-wikilinks.sh`
prüft in allen drei Formen den Slug-Teil vor `|` bzw. `#`. Auch Links in
Code-Fences werden geprüft; Platzhalter-Beispiele daher als `[[<slug>]]`
mit spitzen Klammern notieren, diese Form matcht der Linter nicht.
```

- [ ] **Step 4: `SCHEMA.md` — drei neue Abschnitte vor „## Vertraulichkeit" einfügen (Edit 3)**

```text
## Sprachkonvention

Prosa auf Deutsch, Fachbegriffe und Bezeichner auf Englisch (Slugs,
type-Werte, tags, Code). Etablierte englische Begriffe werden nicht
zwangsübersetzt.

## Slug-Konvention

Dateinamen unter `wiki/` sind der Slug: kebab-case (`a-z`, `0-9`, `-`),
englisch, sprechend, ohne Datumspräfix. Der Slug ist zugleich der
Wikilink-Zielname.

## Qualitätsziele

Struktur- und Organisationsziele (G-BRAIN01 bis G-BRAIN11) sind in
[[quality-goals]] definiert — Gates erzwingt die CI, Targets werden dort
mit kopierbaren Mess-Kommandos dokumentiert.
```

- [ ] **Step 5: Plausibilitäts-Check**

Run: `grep -c 'quality-goals' templates/brain/SCHEMA.md && test -f templates/brain/README.md && echo ok`
Expected: Zähler ≥ 2 und `ok`.

- [ ] **Step 6: Commit**

```bash
git add templates/brain/README.md templates/brain/SCHEMA.md
git commit -m "feat(brain): README landing + SCHEMA language/slug/quality-goal conventions [T001608]"
```

---

### Task 9: Hubs verlinken (`index.md`, `index-moc.md`, `log.md`) — Suite GREEN

**Files:**
- Modify: `templates/brain/index.md`
- Modify: `templates/brain/wiki/index-moc.md`
- Modify: `templates/brain/log.md`
- Test: `tests/spec/brain-quality-goals.bats` (komplett)

**Interfaces:**
- Consumes: alle fünf neuen Slugs (Task 5–7); erst nach diesem Task lösen sich alle Wikilinks im Template auf.
- Produces: Hub-Verlinkung, die der Test „seed ships the five doc pages plus README, linked from both hubs" und die Selbst-Konformität voraussetzen.

- [ ] **Step 1: `index.md` vollständig ersetzen**

````markdown
---
type: moc
tags: [index, meta]
status: active
source:: brain-foundation (self)
---
# brain — Index

Willkommen im gemeinsamen LLM-Wiki von Patrick und Gekko. Diese Seite ist der
Einstiegs-Hub des Repos.

- [[SCHEMA]] — Struktur- und Frontmatter-Konventionen (verbindlich lesen, bevor Seiten
  angelegt oder verändert werden).
- [[index-moc]] — thematischer Wiki-Hub (Maps of Content).
- [[log]] — Änderungs-Journal.
- [[quality-goals]] — Qualitätsziele G-BRAIN01–11 (Gates + Targets).
- [[usage]] — How-to: Seiten anlegen, raw→wiki, log-Pflege.
- [[cheatsheet]] — Frontmatter-Templates, Wikilink-Syntax, Lint-Kommandos.
- [[first-aid]] — Erste Hilfe bei roter CI.
- [[llm-workflows]] — Prompt-Vorlagen und Agent-Konventionen für LLM-Anreicherung.

Rohmaterial liegt unter `raw/`, kompilierte Wissensseiten unter `wiki/`.
````

- [ ] **Step 2: `wiki/index-moc.md` vollständig ersetzen**

````markdown
---
type: moc
tags: [moc, meta]
status: active
source:: brain-foundation (self)
---
# Wiki — Map of Content

Thematischer Hub der `wiki/`-Seiten.

## Meta & Qualität

- [[quality-goals]] — Qualitätsziele G-BRAIN01–11 (Entscheidung: Gates + Targets).

## Arbeiten mit dem Wiki

- [[usage]] — Seiten anlegen, raw→wiki, log-Pflege.
- [[cheatsheet]] — Frontmatter-Templates, Wikilink-Syntax, Lint-Kommandos.
- [[first-aid]] — Erste Hilfe bei roter CI.
- [[llm-workflows]] — LLM-Anreicherung: Prompt-Vorlagen + Agent-Konventionen.

## Beispiele

- [[example-note]] — Beispielseite, demonstriert gültiges Frontmatter + Wikilink.

Übergeordneter Einstieg: [[index]].
````

- [ ] **Step 3: `log.md` — Journal-Eintrag anhängen (lebt G-BRAIN09 vor)**

Ans Ende der Liste anfügen:

```text
- 2026-07-03: Qualitätsziele G-BRAIN01–11 definiert ([[quality-goals]]), Lint-Gates
  repariert (Alias/Anker-Wikilinks, tags-Pflicht, Scope, Sammel-Diagnose), Site-Build
  lint-gekoppelt ohne raw/-Publikation; Nutzungs-Doku [[usage]], [[cheatsheet]],
  [[first-aid]], [[llm-workflows]] ergänzt (brain-quality-goals, T001608).
```

- [ ] **Step 4: Beide Linter direkt über das Template laufen lassen**

```bash
bash templates/brain/scripts/lint-frontmatter.sh templates/brain
bash templates/brain/scripts/lint-wikilinks.sh templates/brain
```

Expected: beide exit 0, keine FAIL-Zeile (Selbst-Konformität aller Seed-Seiten).

- [ ] **Step 5: Gesamte neue Suite GREEN**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/brain-quality-goals.bats`
Expected: PASS — alle 16 Tests grün.

- [ ] **Step 6: Regression Bestandssuite**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/brain-foundation.bats`
Expected: PASS (15 Tests).

- [ ] **Step 7: Commit**

```bash
git add templates/brain/index.md templates/brain/wiki/index-moc.md templates/brain/log.md
git commit -m "feat(brain): hubs link the new doc pages, journal entry added [T001608]"
```

---

### Task 10: Verifikation (CI-Gates) + Test-Inventar

**Files:**
- Modify: `website/src/data/test-inventory.json` (regeneriert via `task test:inventory`)

**Interfaces:**
- Consumes: alle vorherigen Tasks abgeschlossen und committet.
- Produces: grüner CI-äquivalenter Stand des Branches.

- [ ] **Step 1: Test-Inventar regenerieren und committen (CI-Inventar-Check)**

```bash
task test:inventory
git add website/src/data/test-inventory.json
git commit -m "chore(tests): regenerate test inventory for brain-quality-goals.bats [T001608]"
```

- [ ] **Step 2: Gezielte Tests der geänderten Domains**

```bash
task test:changed
```

Expected: PASS. Hinweis: Die Smart-Selection matcht `templates/brain/**` nicht direkt — die neue BATS-Datei im selben PR stellt sicher, dass `test:factory` (Glob `tests/spec/*.bats`) die Fixtures ausführt.

- [ ] **Step 3: Generierte Artefakte aktualisieren**

```bash
task freshness:regenerate
```

Expected: exit 0; etwaige regenerierte Artefakte mitcommitten.

- [ ] **Step 4: CI-Äquivalent Freshness + S1–S4-Ratchet**

```bash
task freshness:check
```

Expected: PASS (keine Baseline-Einträge hinzugefügt; beide `.sh`-Dateien weit unter Limit 500).

- [ ] **Step 5: OpenSpec-Validierung**

```bash
bash scripts/openspec.sh validate
```

Expected: grün (Delta `openspec/changes/brain-quality-goals/specs/brain-foundation.md` ist rein additiv).

- [ ] **Step 6: Abschluss-Commit (falls Step 3 Artefakte regeneriert hat)**

```bash
git status --short
git add -A && git commit -m "chore: regenerate freshness artifacts [T001608]" || echo "nichts zu committen"
```

---

## Abschluss-Hinweis: Dual-Target (dokumentarisch, KEIN Implementierungs-Task)

Nach dem Merge dieses PRs folgt ein **separater PR ins live-Repo `Paddione/brain`** mit denselben Linter-/Workflow-/Seiten-Änderungen (T001578-Präzedenz gegen Template↔live-Drift; Design-Entscheidung Dual-Target). Dessen Merge triggert dort `build-site.yml` → neue Quartz-Site inkl. Doku-Seiten. Bis dahin driften Template und live-Repo bewusst kurz. Die Umsetzung liegt außerhalb dieses Plans.
