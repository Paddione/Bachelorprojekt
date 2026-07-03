---
title: "brain-foundation — Implementation Plan"
ticket_id: T001568
domains: [infra, test, security]
status: active
file_locks: [scripts/brain-bootstrap.sh, tests/spec/brain-foundation.bats, templates/brain/]
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# brain-foundation — Implementation Plan

_Ticket: T001568 · Epic brain-llm-wiki (Change 1/7) · Branch `feature/brain-foundation`_
_Design: `docs/superpowers/specs/2026-07-03-brain-foundation-design.md` (Decisions D1–D7)_
_Spec-Delta: `openspec/changes/brain-foundation/specs/brain-foundation.md`_

## File Structure

**Neu (11) — alle Dateien sind Neu-Anlagen (loc=0, nicht baselined; wirksame S1-Schwelle = statisches Extension-Limit):**

| Datei | Typ / Limit | S1-Budget |
|---|---|---|
| `scripts/brain-bootstrap.sh` | `.sh` / 500 | 400 (intel.json — bewusst < 500 gehalten) |
| `tests/spec/brain-foundation.bats` | `.bats` / ungated | 0 (ungated, kein Ratchet) |
| `templates/brain/SCHEMA.md` | `.md` / ungated | 0 (ungated) |
| `templates/brain/index.md` | `.md` / ungated | 0 (ungated) |
| `templates/brain/log.md` | `.md` / ungated | 0 (ungated) |
| `templates/brain/wiki/example-note.md` | `.md` / ungated | 0 (ungated) |
| `templates/brain/wiki/index-moc.md` | `.md` / ungated | 0 (ungated) |
| `templates/brain/raw/.gitkeep` | keep / ungated | 0 (ungated) |
| `templates/brain/scripts/lint-wikilinks.sh` | `.sh` / 500 | 400 (intel.json) |
| `templates/brain/scripts/lint-frontmatter.sh` | `.sh` / 500 | 400 (intel.json) |
| `templates/brain/.github/workflows/ci.yml` | `.yml` / ungated | 0 (ungated) |

> S1-Disziplin: Alle drei Bash-Skripte werden bewusst kompakt (< 400 Zeilen) gehalten — kein Split
> nötig, `wc -l` bleibt weit unter der 500-Limit-Schwelle. Markdown- und YAML-Seeds unterliegen
> keinem Zeilen-Ratchet.
> S3-Disziplin: In keinem Snippet stehen Brand-Domain-Literale — Domains sind erst im Quartz-Folge-Change relevant.
> S4-Disziplin: `scripts/brain-bootstrap.sh` wird in Task 5 über einen `brain:bootstrap`-Taskfile-Eintrag
> erreichbar gemacht (kein Orphan-Skript); die Template-`scripts/*.sh` werden von `templates/brain/.github/workflows/ci.yml` aufgerufen.

## Task 1 — RED: BATS-Spec `tests/spec/brain-foundation.bats` anlegen (Failing-Test)

**target_files:** `tests/spec/brain-foundation.bats`

Neue Spec-Datei nach BATS-Konvention (eine `.bats`-Datei pro OpenSpec-SSOT-Spec; Vorlage
`tests/spec/software-factory.bats`). Kein ticket-nummerierter Dateiname. Die Tests treiben die noch
nicht existierenden Artefakte `scripts/brain-bootstrap.sh`, `templates/brain/scripts/lint-wikilinks.sh`
und `templates/brain/scripts/lint-frontmatter.sh` — sie laufen deshalb ROT.

Testfälle (alle offline, in `mktemp`-Verzeichnissen):

```bash
#!/usr/bin/env bats
# tests/spec/brain-foundation.bats
# SSOT: openspec/specs/brain-foundation.md
setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  BOOTSTRAP="$REPO_ROOT/scripts/brain-bootstrap.sh"
  LINT_WL="$REPO_ROOT/templates/brain/scripts/lint-wikilinks.sh"
  LINT_FM="$REPO_ROOT/templates/brain/scripts/lint-frontmatter.sh"
  WORK="$(mktemp -d)"
}
teardown() { rm -rf "$WORK"; }

@test "bootstrap seeds the full Karpathy layout" {
  run bash "$BOOTSTRAP" "$WORK/brain"
  [ "$status" -eq 0 ]
  [ -f "$WORK/brain/SCHEMA.md" ]
  [ -f "$WORK/brain/index.md" ]
  [ -f "$WORK/brain/log.md" ]
  [ -d "$WORK/brain/raw" ]
  [ -d "$WORK/brain/wiki" ]
  [ -f "$WORK/brain/scripts/lint-wikilinks.sh" ]
  [ -f "$WORK/brain/scripts/lint-frontmatter.sh" ]
  [ -f "$WORK/brain/.github/workflows/ci.yml" ]
}

@test "bootstrap is idempotent — second run exits 0 and keeps seed" {
  run bash "$BOOTSTRAP" "$WORK/brain"; [ "$status" -eq 0 ]
  run bash "$BOOTSTRAP" "$WORK/brain"
  [ "$status" -eq 0 ]
  [ -f "$WORK/brain/SCHEMA.md" ]
  [ -f "$WORK/brain/wiki/example-note.md" ]
}

@test "bootstrap local mode performs no gh/network side effects" {
  run bash "$BOOTSTRAP" "$WORK/brain"
  [ "$status" -eq 0 ]
  [[ "$output" != *"repo create"* ]]
}

@test "lint-frontmatter flags a missing mandatory field" {
  mkdir -p "$WORK/w/wiki"
  printf -- '---\ntype: note\ntags: [x]\n---\nbody\n' > "$WORK/w/wiki/bad.md"
  run bash "$LINT_FM" "$WORK/w"
  [ "$status" -ne 0 ]
  [[ "$output" == *"missing required frontmatter field: status"* ]]
}

@test "lint-frontmatter passes a well-formed page" {
  mkdir -p "$WORK/w/wiki"
  printf -- '---\ntype: note\ntags: [x]\nstatus: active\n---\nbody\n' > "$WORK/w/wiki/ok.md"
  run bash "$LINT_FM" "$WORK/w"
  [ "$status" -eq 0 ]
}

@test "lint-wikilinks flags a dead link" {
  mkdir -p "$WORK/w/wiki"
  printf -- '---\ntype: note\ntags: [x]\nstatus: active\n---\nsee [[ghost]]\n' > "$WORK/w/wiki/a.md"
  run bash "$LINT_WL" "$WORK/w"
  [ "$status" -ne 0 ]
  [[ "$output" == *"dead wikilink: [[ghost]]"* ]]
}

@test "lint-wikilinks passes when every link resolves" {
  mkdir -p "$WORK/w/wiki"
  printf -- '---\ntype: note\ntags: [x]\nstatus: active\n---\nsee [[b]]\n' > "$WORK/w/wiki/a.md"
  printf -- '---\ntype: note\ntags: [x]\nstatus: active\n---\nhi\n' > "$WORK/w/wiki/b.md"
  run bash "$LINT_WL" "$WORK/w"
  [ "$status" -eq 0 ]
}

@test "seeded example pages satisfy their own frontmatter + wikilink lint" {
  run bash "$BOOTSTRAP" "$WORK/brain"; [ "$status" -eq 0 ]
  run bash "$WORK/brain/scripts/lint-frontmatter.sh" "$WORK/brain"; [ "$status" -eq 0 ]
  run bash "$WORK/brain/scripts/lint-wikilinks.sh" "$WORK/brain"; [ "$status" -eq 0 ]
}

@test "ci.yml wires both linters + a secret scan on push and pull_request" {
  run bash "$BOOTSTRAP" "$WORK/brain"; [ "$status" -eq 0 ]
  ci="$WORK/brain/.github/workflows/ci.yml"
  grep -q 'lint-wikilinks.sh' "$ci"
  grep -q 'lint-frontmatter.sh' "$ci"
  grep -qi 'gitleaks' "$ci"
  grep -q 'push' "$ci"
  grep -q 'pull_request' "$ci"
}

@test "bootstrap reads collaborator from --collaborator flag" {
  grep -q -- '--collaborator' "$BOOTSTRAP"
}
```

**Step (RED) — Test läuft rot, weil Skripte/Templates noch fehlen:**

```bash
cd /tmp/wt-brain-foundation
tests/unit/lib/bats-core/bin/bats tests/spec/brain-foundation.bats
# expected: FAIL — scripts/brain-bootstrap.sh und die Linter existieren noch nicht
```

## Task 2 — Seed-Markdown: SCHEMA.md, index.md, log.md, wiki-Beispielseiten, raw/

**target_files:** `templates/brain/SCHEMA.md`, `templates/brain/index.md`, `templates/brain/log.md`, `templates/brain/wiki/example-note.md`, `templates/brain/wiki/index-moc.md`, `templates/brain/raw/.gitkeep`

`SCHEMA.md` (Verfassung, DE-Prosa/EN-Fachbegriffe, Decisions D2/D3/D7) dokumentiert:

- Frontmatter-Pflichtfelder: `type` ∈ `note|moc|entity|decision|runbook`, `tags` (non-empty), `status` ∈ `draft|active|archived`.
- Wikilinks als `[[slug]]`; `source::`-Rückverweise auf externe Quellen (typisierte Kante).
- SSOT-Regel „kompilieren, nicht verschieben": Quellen bleiben im Ursprungs-Repo; Wiki-Seiten referenzieren nur.
- Workflows Ingest / Query / Lint (Kurzbeschreibung; Details in Folge-Changes).
- Hinweis: Nach dem Seed ist das brain-Repo SSOT für seinen Inhalt (Templates sind Einmal-Seeder, D4).

Jede Beispielseite trägt gültiges Frontmatter, damit sie den eigenen Lint besteht:

```markdown
---
type: note
tags: [example, seed]
status: active
source:: <origin-repo-url> (self)
---
# Example Note

Beispiel-Notiz. Verweist auf die Hub-Seite [[index-moc]].
```

`wiki/index-moc.md` ist die MOC-Hub-Seite (`type: moc`), verlinkt `[[example-note]]`.
`index.md` (Repo-Entry-Hub, `type: moc`) verlinkt `[[index-moc]]`. `log.md` (`type: note`) ist das
Änderungs-Journal (eine Startzeile). `raw/.gitkeep` hält das leere `raw/`-Verzeichnis im Git.

> Konsistenzprüfung: Alle Frontmatter-Blöcke enthalten `type`, `tags`, `status`; alle `[[slug]]`
> zeigen auf existierende Seiten (`index-moc`, `example-note`, `index`) — passend zu den Task-1-Asserts
> `seeded example pages satisfy their own frontmatter + wikilink lint`.

## Task 3 — Seed-Linter: lint-wikilinks.sh + lint-frontmatter.sh

**target_files:** `templates/brain/scripts/lint-wikilinks.sh`, `templates/brain/scripts/lint-frontmatter.sh`

Beide POSIX-bash, offline, nehmen ein Zielverzeichnis als `$1` (default `.`), scannen `*.md` rekursiv.

`lint-frontmatter.sh` — prüft pro `.md`: führender `---`-Block vorhanden, Felder `type`/`tags`/`status`
present, `type`/`status` mit erlaubtem Enum-Wert. Fehlt ein Feld, wird exakt die von Task 1 erwartete
Zeile ausgegeben und `rc=1` gesetzt:

```bash
#!/usr/bin/env bash
set -euo pipefail
root="${1:-.}"; rc=0
while IFS= read -r f; do
  fm="$(awk 'NR==1&&$0!="---"{exit} /^---$/{c++; if(c==2) exit; next} c==1' "$f")"
  for field in type tags status; do
    grep -qE "^${field}:" <<<"$fm" || { echo "FAIL: $f missing required frontmatter field: $field"; rc=1; }
  done
  t="$(grep -oE '^type: *[a-z]+' <<<"$fm" | awk '{print $2}')"
  [[ -z "$t" || "$t" =~ ^(note|moc|entity|decision|runbook)$ ]] || { echo "FAIL: $f invalid type: $t"; rc=1; }
  s="$(grep -oE '^status: *[a-z]+' <<<"$fm" | awk '{print $2}')"
  [[ -z "$s" || "$s" =~ ^(draft|active|archived)$ ]] || { echo "FAIL: $f invalid status: $s"; rc=1; }
done < <(find "$root" -name '*.md' -type f)
exit "$rc"
```

`lint-wikilinks.sh` — sammelt zuerst alle Seiten-Slugs (Basename ohne `.md` aller `*.md`, inkl.
`index`/`log`/`SCHEMA`), scannt dann jede Datei nach `[[slug]]` und meldet nicht auflösbare Links mit
exakt der von Task 1 erwarteten Zeile:

```bash
#!/usr/bin/env bash
set -euo pipefail
root="${1:-.}"; rc=0
mapfile -t slugs < <(find "$root" -name '*.md' -type f -exec basename {} .md \; | sort -u)
in_slugs() { local s="$1"; for k in "${slugs[@]}"; do [[ "$k" == "$s" ]] && return 0; done; return 1; }
while IFS= read -r f; do
  while IFS= read -r link; do
    slug="${link#\[\[}"; slug="${slug%\]\]}"
    in_slugs "$slug" || { echo "FAIL: $f dead wikilink: [[$slug]]"; rc=1; }
  done < <(grep -oE '\[\[[A-Za-z0-9._-]+\]\]' "$f" || true)
done < <(find "$root" -name '*.md' -type f)
exit "$rc"
```

> Konsistenzprüfung gegen Task-1-Asserts: `lint-frontmatter` gibt `missing required frontmatter field: status`
> aus (matcht `bad.md`-Test) und `rc=0` für den wohlgeformten Fall; `lint-wikilinks` gibt
> `dead wikilink: [[ghost]]` aus (matcht `a.md`-Test) und `rc=0`, wenn `[[b]]` → `b.md` auflöst.
> Beide bleiben deutlich unter dem 500-Zeilen-Limit (`.sh`), Budget 400 gemäß intel.json.

## Task 4 — Seed-CI: templates/brain/.github/workflows/ci.yml

**target_files:** `templates/brain/.github/workflows/ci.yml`

Workflow für das brain-Repo (läuft dort, nicht im Bachelorprojekt). Triggert auf `push` und
`pull_request`, ruft beide Linter und einen Secret-Scan (gitleaks-Action) auf — Decision D6-Gate:

```yaml
name: brain-ci
on:
  push:
  pull_request:
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: wikilink lint
        run: bash scripts/lint-wikilinks.sh .
      - name: frontmatter lint
        run: bash scripts/lint-frontmatter.sh .
      - name: secret scan
        uses: gitleaks/gitleaks-action@v2
```

> Konsistenzprüfung: Task-1-Test `ci.yml wires …` grept nach `lint-wikilinks.sh`, `lint-frontmatter.sh`,
> `gitleaks`, `push`, `pull_request` — alle im Snippet oben vorhanden.

## Task 5 — Bootstrap-Skript `scripts/brain-bootstrap.sh` (lokaler Modus, idempotent)

**target_files:** `scripts/brain-bootstrap.sh`, `Taskfile.yml`

Idempotentes Seeder-Skript: kopiert `templates/brain/**` (inkl. Dotfiles wie `.github/`) in ein
Zielverzeichnis. Ohne `--create-remote` rein lokal, kein Netzwerk, kein `gh`/`gh-axi`-Aufruf.
Setzt Ausführbar-Bits auf die geseedeten `scripts/*.sh`. Re-Run überschreibt Seed-Dateien
verlustfrei (idempotent) und exit 0.

```bash
#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE_DIR="$SCRIPT_DIR/../templates/brain"
CREATE_REMOTE=0; COLLABORATOR=""; TARGET=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --create-remote) CREATE_REMOTE=1 ;;
    --collaborator)  COLLABORATOR="$2"; shift ;;
    *)               TARGET="$1" ;;
  esac
  shift
done
seed() {  # seed <dest> — idempotent copy of the template tree
  local dest="$1"
  mkdir -p "$dest"
  cp -R "$TEMPLATE_DIR/." "$dest/"
  chmod +x "$dest"/scripts/*.sh 2>/dev/null || true
}
```

- **Lokaler Modus:** `brain-bootstrap.sh <target-dir>` → `seed "$TARGET"`, exit 0.
- Guards: kein `TARGET` und kein `--create-remote` → Usage + exit 2.

`Taskfile.yml`: neuen Task `brain:bootstrap` ergänzen (S4 — Skript darf kein Orphan sein), der
`bash scripts/brain-bootstrap.sh {{.CLI_ARGS}}` aufruft.

> S1: `scripts/brain-bootstrap.sh` bleibt < 400 Zeilen (Budget 400 laut intel.json).

## Task 6 — Bootstrap `--create-remote`: gh-axi-Repo-Erstellung + parametrisierter Collaborator

**target_files:** `scripts/brain-bootstrap.sh`

Remote-Zweig (Decision D4, gh-axi bevorzugt, `gh` als Fallback für nicht abgedeckte Flows).
Erstellt privates Repo, seedet in ein Temp-Checkout, committet+pusht, fügt Collaborator hinzu.
Der Handle kommt ausschließlich aus `--collaborator` — kein Literal im Skript.

```bash
if [[ "$CREATE_REMOTE" -eq 1 ]]; then
  : "${COLLABORATOR:?--collaborator <handle> required for --create-remote}"
  work="$(mktemp -d)"; seed "$work"
  gh_bin() { command -v gh-axi >/dev/null 2>&1 && echo gh-axi || echo gh; }
  "$(gh_bin)" repo create Paddione/brain --private --disable-wiki || true
  ( cd "$work" && git init -q && git add -A \
      && git commit -qm "chore(brain): seed Karpathy LLM-wiki foundation [T001568]" \
      && git branch -M main \
      && git remote add origin "https://github.com/Paddione/brain.git" \
      && git push -u origin main )
  gh api -X PUT "repos/Paddione/brain/collaborators/${COLLABORATOR}" -f permission=push
fi
```

- `--collaborator` ist Pflicht im Remote-Modus (Fail-closed via `: "${COLLABORATOR:?…}"`).
- Der Collaborator-Handle steht nirgends hardcodiert — Task-1-Assert `grep -q -- '--collaborator'`
  bestätigt die Verdrahtung; der Handle wird nur aus `${COLLABORATOR}` gelesen.
- **Manueller Smoke (nur bei echtem Setup, nicht in CI):**

```bash
cd /tmp/wt-brain-foundation
bash scripts/brain-bootstrap.sh --create-remote --collaborator "$GEKKO_HANDLE"
# erwartet: privates Repo Paddione/brain existiert, Gekko ist Collaborator, main gepusht
```

## Task 7 — GREEN + Final Verification

**target_files:** `tests/spec/brain-foundation.bats`, `website/src/data/test-inventory.json`

- [x] **GREEN:** Die Task-1-BATS-Spec ist jetzt grün (Bootstrap + Linter + Seed existieren):

```bash
cd /tmp/wt-brain-foundation
tests/unit/lib/bats-core/bin/bats tests/spec/brain-foundation.bats
# erwartet: alle @test ok
```

- [x] **Test-Inventar regenerieren + mitcommitten** (neue Test-Datei → CI-Inventar-Check):

```bash
task test:inventory
git add website/src/data/test-inventory.json tests/spec/brain-foundation.bats
```

- [x] **OpenSpec validieren:**

```bash
bash scripts/openspec.sh validate 2>&1 | tail -5
```

- [ ] **Mandatory CI-Gates:**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
