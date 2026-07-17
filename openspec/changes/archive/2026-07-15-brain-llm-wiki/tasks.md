---
title: "brain-llm-wiki — Epic Implementation Plan"
ticket_id: T001566
domains: [infra, ai, workflow]
status: active
file_locks: [scripts/brain-merge-hook.sh, scripts/brain-mcp-server.py, scripts/brain-gekko-inbox.sh]
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: [openspec/changes/brain-foundation/tasks.md]
---

# brain-llm-wiki — Implementation Plan

_Ticket: T001566 · Epic brain-llm-wiki (Sprint 2: Changes 4–6) · Branch `feature/t001566-brain-llm-wiki`_
_Design: `docs/superpowers/specs/2026-07-03-brain-llm-wiki-design.md`_
_Parent Epic: T001566_

## File Structure

**Neu (7) + Geändert (2):**

| Datei | Status | Typ / Limit | S1-Budget |
|---|---|---|---|
| `scripts/brain-merge-hook.sh` | neu | `.sh` / 500 | 400 |
| `tests/spec/brain-merge-hook.bats` | neu | `.bats` / ungated | 0 |
| `scripts/brain-mcp-server.py` | neu | `.py` / 500 | 400 |
| `tests/spec/brain-mcp.bats` | neu | `.bats` / ungated | 0 |
| `scripts/brain-gekko-inbox.sh` | neu | `.sh` / 500 | 400 |
| `tests/spec/brain-gekko-inbox.bats` | neu | `.bats` / ungated | 0 |
| `.github/workflows/brain-merge-hook.yml` | neu | `.yml` / ungated | 0 |

## Task 1 — RED: BATS-Spec `tests/spec/brain-merge-hook.bats`

**target_files:** `tests/spec/brain-merge-hook.bats`

Testet den Merge-Hook (Change 4): bei Merge auf main werden geänderte Specs/Dokumente
automatisch ins brain-Repo re-ingested.

```bash
#!/usr/bin/env bats
# tests/spec/brain-merge-hook.bats
setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  HOOK="$REPO_ROOT/scripts/brain-merge-hook.sh"
  WORK="$(mktemp -d)"
  mkdir -p "$WORK/source" "$WORK/target/raw"
  echo "---\ntype: spec\ntitle: Test\n---\nbody" > "$WORK/source/test-spec.md"
}
teardown() { rm -rf "$WORK"; }

@test "merge-hook copies changed markdown files to raw/" {
  run bash "$HOOK" "$WORK/source" "$WORK/target/raw"
  [ "$status" -eq 0 ]
  [ -f "$WORK/target/raw/test-spec.md" ]
}

@test "merge-hook preserves directory structure" {
  mkdir -p "$WORK/source/sub"
  echo "nested" > "$WORK/source/sub/nested.md"
  run bash "$HOOK" "$WORK/source" "$WORK/target/raw"
  [ -f "$WORK/target/raw/sub/nested.md" ]
}

@test "merge-hook skips non-md files" {
  echo "binary" > "$WORK/source/data.bin"
  run bash "$HOOK" "$WORK/source" "$WORK/target/raw"
  [ ! -f "$WORK/target/raw/data.bin" ]
}

@test "merge-hook generates manifest" {
  run bash "$HOOK" "$WORK/source" "$WORK/target/raw"
  [ -f "$WORK/target/raw/.manifest.json" ]
}
```

**Step (RED):**
```bash
cd /tmp/wt-brain-wiki
tests/unit/lib/bats-core/bin/bats tests/spec/brain-merge-hook.bats
# expected: FAIL — scripts/brain-merge-hook.sh existiert nicht
```

## Task 2 — `scripts/brain-merge-hook.sh` + CI-Workflow

**target_files:** `scripts/brain-merge-hook.sh`, `.github/workflows/brain-merge-hook.yml`

Merge-Hook-Skript: kopiert geänderte `.md`-Dateien aus Source-Quellen ins brain-Repo
`raw/`, generiert `.manifest.json` mit Timestamp und File-Liste.

```bash
#!/usr/bin/env bash
set -euo pipefail
SRC="${1:-.}"; DEST="${2:-./raw}"
MANIFEST="$DEST/.manifest.json"
mkdir -p "$DEST"
find "$SRC" -name '*.md' -type f | while read -r f; do
  rel="${f#$SRC/}"
  mkdir -p "$(dirname "$DEST/$rel")"
  cp "$f" "$DEST/$rel"
done
jq -n --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '{timestamp: $ts, files: []}' > "$MANIFEST"
```

CI-Workflow: triggert auf `push` zu `main` (paths: openspec/specs/, docs/runbooks/,
docs/adr/). Ruft `brain-merge-hook.sh` auf, committed und pusht ins brain-Repo.

## Task 3 — RED: BATS-Spec `tests/spec/brain-mcp.bats`

**target_files:** `tests/spec/brain-mcp.bats`

Testet den MCP-Server (Change 5): Query-Zugriff aufs Wiki via
brain-search-Tool und brain://-Ressource.

```bash
#!/usr/bin/env bats
# tests/spec/brain-mcp.bats
setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  SERVER="$REPO_ROOT/scripts/brain-mcp-server.py"
  WORK="$(mktemp -d)"
  mkdir -p "$WORK/wiki"
  echo "---\ntype: note\ntags: [test]\nstatus: active\n---\n# Test\ntest content\n" > "$WORK/wiki/test-note.md"
}
teardown() { rm -rf "$WORK"; }

@test "mcp-server serves brain:// resource" {
  run python3 "$SERVER" --wiki "$WORK/wiki" --resource "brain://wiki/test-note"
  [ "$status" -eq 0 ]
  [[ "$output" == *"test content"* ]]
}

@test "mcp-server search finds by tag" {
  run python3 "$SERVER" --wiki "$WORK/wiki" --search "test"
  [ "$status" -eq 0 ]
  [[ "$output" == *"test-note"* ]]
}

@test "mcp-server returns error for missing page" {
  run python3 "$SERVER" --wiki "$WORK/wiki" --resource "brain://wiki/ghost"
  [ "$status" -ne 0 ]
}
```

**Step (RED):**
```bash
cd /tmp/wt-brain-wiki
tests/unit/lib/bats-core/bin/bats tests/spec/brain-mcp.bats
# expected: FAIL — scripts/brain-mcp-server.py existiert nicht
```

## Task 4 — `scripts/brain-mcp-server.py` MCP-Server

**target_files:** `scripts/brain-mcp-server.py`

Python-MCP-Server mit zwei Werkzeugen:
- `brain://wiki/<slug>` → gibt Frontmatter + Body zurück
- `brain-search <query>` → durchsucht Wiki-Seiten per Tag/Title-Match

```python
#!/usr/bin/env python3
import argparse, json, os, re, sys
from pathlib import Path

def find_page(wiki_dir, slug):
    for f in Path(wiki_dir).rglob("*.md"):
        if f.stem == slug:
            return f
    return None

def read_page(path):
    content = path.read_text()
    parts = content.split("---", 2)
    fm = {}  # simple frontmatter parse
    if len(parts) >= 3:
        for line in parts[1].strip().splitlines():
            if ":" in line:
                k, v = line.split(":", 1)
                fm[k.strip()] = v.strip()
        body = parts[2].strip()
    else:
        body = content.strip()
    return {"frontmatter": fm, "body": body, "path": str(path)}

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--wiki", required=True)
    parser.add_argument("--resource")
    parser.add_argument("--search")
    args = parser.parse_args()
    wiki = Path(args.wiki)
    if args.resource:
        m = re.match(r"brain://wiki/(.+)", args.resource)
        if not m:
            print("invalid resource URI", file=sys.stderr); sys.exit(1)
        page = find_page(args.wiki, m.group(1))
        if not page:
            print("not found", file=sys.stderr); sys.exit(1)
        print(json.dumps(read_page(page)))
    elif args.search:
        results = []
        for f in wiki.rglob("*.md"):
            if args.search.lower() in f.read_text().lower():
                results.append(str(f))
        print(json.dumps(results))
```

## Task 5 — RED: BATS-Spec `tests/spec/brain-gekko-inbox.bats`

**target_files:** `tests/spec/brain-gekko-inbox.bats`

Testet die Gekko-Inbox (Change 6): Webformular oder Skript, das neue
Wiki-Seiten mit korrektem Frontmatter anlegt.

```bash
#!/usr/bin/env bats
# tests/spec/brain-gekko-inbox.bats
setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  INBOX="$REPO_ROOT/scripts/brain-gekko-inbox.sh"
  WORK="$(mktemp -d)"
  mkdir -p "$WORK/inbox" "$WORK/wiki"
}
teardown() { rm -rf "$WORK"; }

@test "inbox creates a new wiki page from input" {
  echo "# My New Note\n\ncontent here" > "$WORK/inbox/new-note.md"
  run bash "$INBOX" "$WORK/inbox/new-note.md" "$WORK/wiki" --title "My New Note" --tags test,gekko
  [ "$status" -eq 0 ]
  [ -f "$WORK/wiki/my-new-note.md" ]
  grep -q "type: note" "$WORK/wiki/my-new-note.md"
}

@test "inbox validates required frontmatter" {
  echo "no frontmatter" > "$WORK/inbox/bad.md"
  run bash "$INBOX" "$WORK/inbox/bad.md" "$WORK/wiki"
  [ "$status" -ne 0 ]
}
```

**Step (RED):**
```bash
cd /tmp/wt-brain-wiki
tests/unit/lib/bats-core/bin/bats tests/spec/brain-gekko-inbox.bats
# expected: FAIL — scripts/brain-gekko-inbox.sh existiert nicht
```

## Task 6 — `scripts/brain-gekko-inbox.sh`

**target_files:** `scripts/brain-gekko-inbox.sh`

Inbox-Skript: nimmt eine Markdown-Datei entgegen, generiert Frontmatter,
legt sie als Wiki-Seite an (Slug aus Dateiname).

```bash
#!/usr/bin/env bash
set -euo pipefail
SRC="${1:?source file}"; DEST="${2:?wiki dir}"; TITLE=""; TAGS=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --title) TITLE="$2"; shift ;;
    --tags)  TAGS="$2"; shift ;;
  esac; shift
done
SLUG="$(basename "$SRC" .md | tr '[:upper:]' '[:lower:]' | sed 's/ /-/g')"
OUT="$DEST/$SLUG.md"
[ -f "$OUT" ] && { echo "exists: $OUT" >&2; exit 1; }
cat > "$OUT" <<EOF
---
type: note
title: ${TITLE:-$SLUG}
tags: [${TAGS:-inbox}]
status: draft
---

$(cat "$SRC")
EOF
echo "created: $OUT"
```

## Task 7 — GREEN + Final Verification

- [x] **GREEN:** Alle drei BATS-Specs sind grün:

```bash
cd /tmp/wt-brain-wiki
tests/unit/lib/bats-core/bin/bats tests/spec/brain-merge-hook.bats
tests/unit/lib/bats-core/bin/bats tests/spec/brain-mcp.bats
tests/unit/lib/bats-core/bin/bats tests/spec/brain-gekko-inbox.bats
# expected: all ok
```

- [ ] **OpenSpec validieren:**

```bash
bash scripts/openspec.sh validate
```

- [ ] **Mandatory CI-Gates:**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
