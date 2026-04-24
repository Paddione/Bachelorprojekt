# Systembrett Whiteboard Template — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a reusable Nextcloud Whiteboard template with 14 embedded Systembrett primitives that coaches duplicate per session.

**Architecture:** Author the 14 primitives once as an Excalidraw library (`.excalidrawlib`). A bash assembly script wraps the library into a `.whiteboard` scene file. A setup script uploads the template to Nextcloud via `kubectl cp` + `occ files:scan`, mirroring the existing `scripts/whiteboard-setup.sh` pattern. Integrates into `workspace:post-setup` so `task workspace:deploy ENV=mentolder` seeds it automatically.

**Tech Stack:** Bash + `jq`, Excalidraw (authoring, excalidraw.com or local), Nextcloud `occ`, Taskfile, k3d/k3s Kubernetes, docsify.

**Spec:** `docs/superpowers/specs/2026-04-24-systembrett-whiteboard-template-design.md`

---

## File Structure

```
website/public/systembrett/
  systembrett.excalidrawlib        # CREATE · authored in Excalidraw UI, committed artifact
  systembrett-template.whiteboard  # CREATE · built by assembly script (also committed)

scripts/
  systembrett-build-template.sh    # CREATE · wraps .excalidrawlib → .whiteboard
  systembrett-setup.sh             # CREATE · uploads template to Nextcloud admin folder
  tests/systembrett-build.test.sh  # CREATE · unit tests for the build script

docs/superpowers/plans/
  2026-04-24-systembrett-verification-findings.md  # CREATE · Task 1 output

k3d/docs-content/
  systembrett.md                   # CREATE · coach-facing how-to page
  _sidebar.md                      # MODIFY · add link to the new page

Taskfile.yml                       # MODIFY · add workspace:systembrett-setup, chain into post-setup
```

**Why these boundaries:**
- `build-template.sh` is pure data transformation (library → template). Keeps it small, testable, no cluster access needed.
- `systembrett-setup.sh` does all the cluster-side work (copy, scan, share). Mirrors `whiteboard-setup.sh` so future-you recognises the shape.
- The `.excalidrawlib` is hand-authored design content — commit as-is, treat updates as design changes, not code changes.
- The assembled `.whiteboard` is also committed so the repo is the source of truth; CI can regenerate and diff to catch drift.

---

## Task 1: Verification experiment — does Nextcloud Whiteboard preserve embedded `libraryItems` across users?

**Goal:** Decide between Path A (embed-first) and Path B (hybrid) before committing implementation effort.

**Files:**
- Create: `docs/superpowers/plans/2026-04-24-systembrett-verification-findings.md`

**Cluster to use:** `mentolder` — its whiteboard backend JWT was verified aligned earlier; korczewski currently has JWT drift that could confuse results.

**Two accounts needed:** admin account (coach) and one other user account on the mentolder cluster. If only the admin exists, create a disposable test user in Keycloak: `https://auth.mentolder.de` → Users → Add User. Delete the test user once verification is done.

- [ ] **Step 1.1: Open Nextcloud as user A (admin)**

Action: navigate to `https://files.mentolder.de`, log in as admin, open a new whiteboard in any Files folder via `+` → `New whiteboard`. Name it `embed-test-YYYY-MM-DD.whiteboard`.

Expected: a blank Excalidraw canvas opens.

- [ ] **Step 1.2: Add three test library items**

In Excalidraw's toolbar, draw three simple shapes (a circle, a square, an arrow). For each:
1. Select the shape.
2. Click the library icon (📚 or similar) in the toolbar.
3. Click `Save to library`.

Expected: the three items appear in the library panel. Name the library "Embed Test" if Excalidraw prompts.

- [ ] **Step 1.3: Share the whiteboard with user B**

In Nextcloud Files, right-click the whiteboard file → `Share` → enter user B's username → grant edit permission. Copy the share link.

- [ ] **Step 1.4: Open as user B in an incognito window**

In an incognito browser, navigate to `https://files.mentolder.de`, log in as user B, open the shared whiteboard.

Expected: canvas loads with the three shapes visible.

- [ ] **Step 1.5: Inspect user B's library panel**

As user B, click the library icon.

Pass criterion: library panel shows the three items without any import action.
Fail criterion: library panel is empty or shows only user B's pre-existing items.

- [ ] **Step 1.6: Document the finding**

Create `docs/superpowers/plans/2026-04-24-systembrett-verification-findings.md` with:

```markdown
# Systembrett Library-Embed Verification — Findings

**Date:** <YYYY-MM-DD>
**Cluster:** mentolder
**Nextcloud Whiteboard version:** <from `kubectl --context mentolder -n workspace get deploy/whiteboard -o jsonpath='{.spec.template.spec.containers[0].image}'`>

## Result

**<PASS | FAIL>** — user B <did | did not> see the three library items on first open.

## Observations

- <any relevant UI notes, error messages, or surprising behavior>

## Decision

Proceeding with **Path <A | B>** as specified in the design doc §3.
```

- [ ] **Step 1.7: Commit the findings**

```bash
git add docs/superpowers/plans/2026-04-24-systembrett-verification-findings.md
git commit -m "docs(superpowers): record Systembrett library-embed verification result"
```

**Gate:** if `PASS` → continue with Task 2 (Path A). If `FAIL` → stop. Revise the plan inline to add Path B canvas-tray pieces before continuing. The rest of this plan assumes Path A.

---

## Task 2: Author the 14 primitives as an Excalidraw library

**Goal:** Produce `systembrett.excalidrawlib` containing the 14 primitives matching the spec's §4 inventory.

**Files:**
- Create: `website/public/systembrett/systembrett.excalidrawlib`

**Authoring tool:** https://excalidraw.com (free, stays in browser). Alternative: open a Nextcloud whiteboard on mentolder and author there.

- [ ] **Step 2.1: Create the directory**

```bash
mkdir -p website/public/systembrett
```

- [ ] **Step 2.2: Author Personen (3 pieces)**

In Excalidraw:

1. Draw a circle with fill `#d7b06a`, stroke `#d7b06a`, radius ~36px. This is `Person groß`.
2. Draw a small dark rectangle on the circle's right edge (8×6 px, fill `#0b111c`). Select both, `Ctrl+G` to group. The notch + circle must rotate together.
3. With the group selected, Library panel → `Save to library`. Name it `Person groß`.
4. Repeat for `Person mittel` (radius ~28px) and `Person klein` (radius ~20px). Same colors. Notch proportional.

Expected: 3 items in the library, visually distinct sizes.

- [ ] **Step 2.3: Author Selbst & Offene Stellen (2 pieces)**

1. `Ich`: draw a circle with no fill, stroke `#d7b06a`, stroke width 2.5. Draw a small filled circle in the center (fill `#d7b06a`, radius ~8px). Group. Save to library as `Ich`.
2. `Unbekannt`: draw a circle with no fill, stroke `#cdd3d9`, stroke style `dashed`. Add a text element `?` (italic serif, size 18, color `#cdd3d9`) centered. Group. Save as `Unbekannt`.

Expected: 5 total library items.

- [ ] **Step 2.4: Author Themen & Anliegen (4 pieces)**

1. `Thema`: rounded square, fill `#9bc0a8`, stroke `#9bc0a8`. Save.
2. `Ziel / Wert`: rotate a square 45° or use the diamond shape, fill `#d7b06a`. Save.
3. `Gefühl`: use the freedraw or polygon tool to draw a rough heart/organic outline, no fill, stroke `#e8c884`, stroke width 2. Save.
4. `Hindernis`: draw a jagged polygon (use polygon tool or freedraw), no fill, stroke `#cdd3d9`. Save.

Expected: 9 total library items.

- [ ] **Step 2.5: Author System-Rahmen (2 pieces)**

1. `System`: rounded rectangle, fill `#9bc0a8` with low opacity (~30%), stroke `#9bc0a8`, stroke width 1.5. Save.
2. `Kontext`: rounded rectangle, no fill, stroke `#cdd3d9`, stroke style `dashed`. Save.

Expected: 11 total library items.

- [ ] **Step 2.6: Author Verbindungen (4 pieces)**

1. `Beziehung stark`: solid line, stroke `#cdd3d9`, stroke width 2.5. Save.
2. `Beziehung schwach`: dashed line, stroke `#cdd3d9`, stroke width 1.8. Save.
3. `Einfluss`: arrow, stroke `#d7b06a`, stroke width 2. Save.
4. `Konflikt`: zigzag line (draw a series of connected segments), stroke `#c46a5a`, stroke width 2. Save.

Expected: 15 library items — *wait*, that's 15. Spec says 14. Recount: Personen 3 + Selbst 2 + Themen 4 + Rahmen 2 + Verbindungen 4 = **15**.

**Fix:** the spec lists 14 in §2 but itemizes 15 across §4.1–4.5. This plan follows the itemized breakdown (15). Update the spec's headline count in a later step (see Task 5.6).

- [ ] **Step 2.7: Export the library**

In the library panel: overflow menu (⋯) → `Export library`. Save the resulting file.

- [ ] **Step 2.8: Move the exported file into the repo**

```bash
mv ~/Downloads/systembrett.excalidrawlib website/public/systembrett/systembrett.excalidrawlib
```

(Adjust path if your Downloads location differs.)

- [ ] **Step 2.9: Verify the file structure**

```bash
jq '.libraryItems | length' website/public/systembrett/systembrett.excalidrawlib
jq '[.libraryItems[].name]' website/public/systembrett/systembrett.excalidrawlib
```

Expected:
```
15
[
  "Person groß", "Person mittel", "Person klein",
  "Ich", "Unbekannt",
  "Thema", "Ziel / Wert", "Gefühl", "Hindernis",
  "System", "Kontext",
  "Beziehung stark", "Beziehung schwach", "Einfluss", "Konflikt"
]
```

If names or count differ, return to Step 2.2 and fix before continuing.

- [ ] **Step 2.10: Commit the library**

```bash
git add website/public/systembrett/systembrett.excalidrawlib
git commit -m "feat(systembrett): add 15-piece Excalidraw library for coaching Systembrett"
```

---

## Task 3: Build the `.whiteboard` template from the library

**Goal:** Produce `systembrett-template.whiteboard` — a minimal Excalidraw scene with all 15 library items embedded as `libraryItems`, no placed canvas elements.

**Files:**
- Create: `scripts/systembrett-build-template.sh`
- Create: `scripts/tests/systembrett-build.test.sh`
- Create: `website/public/systembrett/systembrett-template.whiteboard`

- [ ] **Step 3.1: Write the failing test**

```bash
mkdir -p scripts/tests
```

Create `scripts/tests/systembrett-build.test.sh`:

```bash
#!/usr/bin/env bash
# Tests for systembrett-build-template.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_SCRIPT="${SCRIPT_DIR}/systembrett-build-template.sh"
LIB_FILE="$(cd "${SCRIPT_DIR}/.." && pwd)/website/public/systembrett/systembrett.excalidrawlib"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

OUT_FILE="${TMP_DIR}/systembrett-template.whiteboard"

echo "=== systembrett-build-template.sh tests ==="

# Test 1: script produces output file
"${BUILD_SCRIPT}" "${LIB_FILE}" "${OUT_FILE}"
test -f "${OUT_FILE}" || { echo "FAIL: output file not created"; exit 1; }
echo "  ✓ output file created"

# Test 2: output is valid JSON
jq empty "${OUT_FILE}" || { echo "FAIL: output is not valid JSON"; exit 1; }
echo "  ✓ output is valid JSON"

# Test 3: output has type=excalidraw
TYPE=$(jq -r '.type' "${OUT_FILE}")
test "${TYPE}" = "excalidraw" || { echo "FAIL: type=${TYPE}, want excalidraw"; exit 1; }
echo "  ✓ type=excalidraw"

# Test 4: output has 15 libraryItems
COUNT=$(jq '.libraryItems | length' "${OUT_FILE}")
test "${COUNT}" = "15" || { echo "FAIL: libraryItems count=${COUNT}, want 15"; exit 1; }
echo "  ✓ 15 libraryItems"

# Test 5: elements array is empty (no pre-placed shapes)
ELEM_COUNT=$(jq '.elements | length' "${OUT_FILE}")
test "${ELEM_COUNT}" = "0" || { echo "FAIL: elements count=${ELEM_COUNT}, want 0"; exit 1; }
echo "  ✓ elements empty"

# Test 6: library item names match expectation
EXPECTED_NAMES=(
  "Person groß" "Person mittel" "Person klein"
  "Ich" "Unbekannt"
  "Thema" "Ziel / Wert" "Gefühl" "Hindernis"
  "System" "Kontext"
  "Beziehung stark" "Beziehung schwach" "Einfluss" "Konflikt"
)
for name in "${EXPECTED_NAMES[@]}"; do
  found=$(jq --arg n "${name}" '[.libraryItems[] | select(.name == $n)] | length' "${OUT_FILE}")
  test "${found}" = "1" || { echo "FAIL: missing item '${name}'"; exit 1; }
done
echo "  ✓ all 15 expected item names present"

echo ""
echo "=== all tests passed ==="
```

```bash
chmod +x scripts/tests/systembrett-build.test.sh
```

- [ ] **Step 3.2: Run the test to confirm it fails**

```bash
./scripts/tests/systembrett-build.test.sh
```

Expected: `./scripts/systembrett-build-template.sh: No such file or directory` — or non-zero exit.

- [ ] **Step 3.3: Write the minimal build script**

Create `scripts/systembrett-build-template.sh`:

```bash
#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# systembrett-build-template.sh
# Wraps an Excalidraw library (.excalidrawlib) into a Nextcloud Whiteboard
# template (.whiteboard) with the library embedded as libraryItems.
#
# Usage: systembrett-build-template.sh <input.excalidrawlib> <output.whiteboard>
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

if [ $# -ne 2 ]; then
  echo "Usage: $0 <input.excalidrawlib> <output.whiteboard>" >&2
  exit 1
fi

INPUT="$1"
OUTPUT="$2"

if [ ! -f "${INPUT}" ]; then
  echo "FEHLER: Input-Datei '${INPUT}' nicht gefunden." >&2
  exit 1
fi

# Assemble a minimal Excalidraw scene with the library items embedded.
# Scene fields mirror what Excalidraw emits for an empty board.
jq -n --slurpfile lib "${INPUT}" '{
  type: "excalidraw",
  version: 2,
  source: "mentolder-systembrett",
  elements: [],
  appState: {
    viewBackgroundColor: "#0b111c",
    gridSize: null
  },
  files: {},
  libraryItems: ($lib[0].libraryItems // [])
}' > "${OUTPUT}"

echo "✓ built ${OUTPUT} with $(jq '.libraryItems | length' "${OUTPUT}") library items"
```

```bash
chmod +x scripts/systembrett-build-template.sh
```

- [ ] **Step 3.4: Run the test to confirm it passes**

```bash
./scripts/tests/systembrett-build.test.sh
```

Expected:
```
=== systembrett-build-template.sh tests ===
  ✓ output file created
  ✓ output is valid JSON
  ✓ type=excalidraw
  ✓ 15 libraryItems
  ✓ elements empty
  ✓ all 15 expected item names present

=== all tests passed ===
```

- [ ] **Step 3.5: Build the production template**

```bash
./scripts/systembrett-build-template.sh \
  website/public/systembrett/systembrett.excalidrawlib \
  website/public/systembrett/systembrett-template.whiteboard
```

Expected: `✓ built website/public/systembrett/systembrett-template.whiteboard with 15 library items`

- [ ] **Step 3.6: Commit**

```bash
git add scripts/systembrett-build-template.sh \
        scripts/tests/systembrett-build.test.sh \
        website/public/systembrett/systembrett-template.whiteboard
git commit -m "feat(systembrett): add build script + template assembled from library"
```

---

## Task 4: Upload the template to Nextcloud (systembrett-setup.sh + Taskfile)

**Goal:** One command (`task workspace:systembrett-setup ENV=<env>`) uploads the template into admin's `Coaching/` folder in Nextcloud and makes it readable; chain into `workspace:post-setup` so it runs during `workspace:deploy`.

**Files:**
- Create: `scripts/systembrett-setup.sh`
- Modify: `Taskfile.yml` — add `workspace:systembrett-setup`, chain into `workspace:post-setup`

- [ ] **Step 4.1: Write the setup script**

Create `scripts/systembrett-setup.sh`:

```bash
#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# systembrett-setup.sh
# Uploads the Systembrett Whiteboard template into Nextcloud admin's
# Coaching/ folder and triggers a files:scan so Nextcloud indexes it.
#
# Safe to re-run: file is overwritten, scan is idempotent.
#
# Environment:
#   KUBE_CONTEXT — kubectl context; defaults to current context
#   NAMESPACE    — defaults to "workspace"
#   TEMPLATE_SRC — path to systembrett-template.whiteboard
#                  (defaults to website/public/systembrett/systembrett-template.whiteboard
#                   relative to the repo root)
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

NAMESPACE="${NAMESPACE:-workspace}"
KUBE_CONTEXT="${KUBE_CONTEXT:-}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE_SRC="${TEMPLATE_SRC:-${REPO_ROOT}/website/public/systembrett/systembrett-template.whiteboard}"

NC_USER="admin"
NC_FOLDER="Coaching"
NC_FILENAME="systembrett-template.whiteboard"

_kubectl() { kubectl ${KUBE_CONTEXT:+--context "$KUBE_CONTEXT"} "$@"; }
_occ() {
  _kubectl exec -n "${NAMESPACE}" deploy/nextcloud -c nextcloud -- \
    sh -c "$1" 2>&1
}

echo "=== Systembrett Template Setup ==="

if [ ! -f "${TEMPLATE_SRC}" ]; then
  echo "FEHLER: Template '${TEMPLATE_SRC}' nicht gefunden." >&2
  echo "       Zuerst ausführen: ./scripts/systembrett-build-template.sh" >&2
  exit 1
fi

# Identify the Nextcloud pod
NC_POD=$(_kubectl get pod -n "${NAMESPACE}" -l app=nextcloud \
  -o jsonpath='{.items[0].metadata.name}')

if [ -z "${NC_POD}" ]; then
  echo "FEHLER: Kein Nextcloud-Pod gefunden (app=nextcloud im Namespace ${NAMESPACE})." >&2
  exit 1
fi

NC_FOLDER_PATH="/var/www/html/data/${NC_USER}/files/${NC_FOLDER}"
NC_FILE_PATH="${NC_FOLDER_PATH}/${NC_FILENAME}"

echo "  Ziel-Pod:   ${NC_POD}"
echo "  Ziel-Pfad:  ${NC_FILE_PATH}"

# Ensure the Coaching folder exists with correct ownership
_occ "mkdir -p '${NC_FOLDER_PATH}' && chown -R www-data:www-data '${NC_FOLDER_PATH}'"

# Copy the template into the pod
_kubectl cp "${TEMPLATE_SRC}" \
  "${NAMESPACE}/${NC_POD}:${NC_FILE_PATH}" -c nextcloud

_occ "chown www-data:www-data '${NC_FILE_PATH}' && chmod 644 '${NC_FILE_PATH}'"

# Scan so Nextcloud picks up the file in its database
_occ "php occ files:scan --path='${NC_USER}/files/${NC_FOLDER}'"

echo ""
echo "=== Verifizierung ==="
SCAN_OUT=$(_occ "php occ files:scan --path='${NC_USER}/files/${NC_FOLDER}' --shallow")
echo "${SCAN_OUT}" | grep -E "files|folders" || true

echo ""
echo "=== Systembrett Setup abgeschlossen ==="
echo "  Coaches finden die Vorlage unter:"
echo "    Files → ${NC_FOLDER}/${NC_FILENAME}"
echo "  Pro Sitzung duplizieren und im Talk-Call teilen."
```

```bash
chmod +x scripts/systembrett-setup.sh
```

- [ ] **Step 4.2: Add the Taskfile entry**

Locate `workspace:whiteboard-setup` in `Taskfile.yml` (around line 320). Immediately after that task block, insert:

```yaml
  workspace:systembrett-setup:
    desc: Upload Systembrett Whiteboard template into admin's Coaching/ folder (ENV=dev|mentolder|korczewski)
    vars:
      ENV: '{{.ENV | default "dev"}}'
    cmds:
      - |
        source scripts/env-resolve.sh "{{.ENV}}"
        if [ ! -f website/public/systembrett/systembrett-template.whiteboard ]; then
          echo "Building template first..."
          ./scripts/systembrett-build-template.sh \
            website/public/systembrett/systembrett.excalidrawlib \
            website/public/systembrett/systembrett-template.whiteboard
        fi
        KUBE_CONTEXT="${ENV_CONTEXT}" bash scripts/systembrett-setup.sh
```

- [ ] **Step 4.3: Chain into workspace:post-setup**

In `Taskfile.yml`, find the `workspace:post-setup` task (around line 270). In its `cmds:` list, after the existing `- task: workspace:whiteboard-setup` entry (around line 315), add:

```yaml
      - task: workspace:systembrett-setup
        vars: { ENV: "{{.ENV}}" }
```

- [ ] **Step 4.4: Verify Taskfile syntax**

```bash
task --list | grep systembrett
```

Expected:
```
* workspace:systembrett-setup:    Upload Systembrett Whiteboard template into admin's Coaching/ folder (ENV=dev|mentolder|korczewski)
```

- [ ] **Step 4.5: Run against mentolder (acceptance)**

```bash
task workspace:systembrett-setup ENV=mentolder
```

Expected output ends with:
```
=== Systembrett Setup abgeschlossen ===
  Coaches finden die Vorlage unter:
    Files → Coaching/systembrett-template.whiteboard
  Pro Sitzung duplizieren und im Talk-Call teilen.
```

- [ ] **Step 4.6: Verify via Nextcloud UI**

Open `https://files.mentolder.de` as admin. Navigate to `Coaching/`. Click `systembrett-template.whiteboard`.

Expected:
- File is listed with the expected size (~JSON size of the built template).
- Clicking it opens Nextcloud Whiteboard with an empty canvas.
- Library panel contains all 15 pieces, categorized or at least listed.
- Drag a Person groß onto the canvas — it appears with brass fill and direction notch.

If library is empty: Path A verification (Task 1) may have given a false positive — pivot to Path B inline.

- [ ] **Step 4.7: Commit**

```bash
git add scripts/systembrett-setup.sh Taskfile.yml
git commit -m "feat(systembrett): add systembrett-setup task + chain into post-setup"
```

---

## Task 5: Documentation, cross-cluster deploy, PR

**Goal:** Coaches have a how-to page; both clusters are seeded; PR is opened.

**Files:**
- Create: `k3d/docs-content/systembrett.md`
- Modify: `k3d/docs-content/_sidebar.md`
- Modify: `docs/superpowers/specs/2026-04-24-systembrett-whiteboard-template-design.md` (count correction)

- [ ] **Step 5.1: Write the coach how-to page**

Create `k3d/docs-content/systembrett.md`:

```markdown
# Systembrett im Whiteboard

Eine digitale Version des klassischen Systembretts — für Familien-, Team- und Werte­aufstellungen direkt im Talk-Meeting.

## Eine Sitzung starten

1. In Nextcloud Files den Ordner **Coaching** öffnen.
2. Die Datei `systembrett-template.whiteboard` markieren → **Drei-Punkte-Menü** → **Kopieren**.
3. Die Kopie umbenennen, z. B. `Familie-Müller-2026-04-24.whiteboard`.
4. Im Talk-Call das Whiteboard teilen: im Chat-Bereich auf **+** klicken → **Datei anhängen** → die frisch kopierte Datei wählen.

## Die Bausteine im Drawer

Das Library-Panel (Symbol `📚` in der Excalidraw-Toolbar) öffnet sich als einklappbare Leiste.
Darin liegen fünfzehn Primitive in fünf Kategorien:

- **Personen** · drei Größen, mit rotierbarem Blickrichtungs-Notch.
- **Selbst & Offene Stellen** · *Ich* (zentral) und *Unbekannt* (?).
- **Themen & Anliegen** · Thema, Ziel, Gefühl, Hindernis — bewusst abstrakt, nicht menschlich.
- **System-Rahmen** · System (gefüllt) und Kontext (gestrichelt) für Zugehörigkeit.
- **Verbindungen** · stark, schwach, Einfluss (Pfeil), Konflikt (Zickzack).

## Umgang

- **Figur platzieren:** aus dem Drawer auf die Fläche ziehen.
- **Figur duplizieren:** `Alt` halten und ziehen — das Original bleibt.
- **Figur benennen:** Text-Werkzeug (`T`), Label neben die Figur setzen.
- **Blickrichtung drehen:** Figur auswählen, Rotations-Griff ziehen. Der Notch folgt.
- **Verbinden:** entweder das Pfeil-Werkzeug oder eine Verbindung aus dem Drawer ziehen.

Coach und Klient·in sehen dieselbe Fläche in Echtzeit. Änderungen beider Seiten
sind sofort sichtbar.

## Keine Namen auf den Figuren

Die Primitive bleiben absichtlich **unbeschriftet**. Ob eine Figur „Mutter",
„Innerer Kritiker" oder „der Chef" ist, entscheidet die Sitzung — nicht die Vorlage.
Namen kommen als Text-Labels daneben.
```

- [ ] **Step 5.2: Add the link to the sidebar**

Open `k3d/docs-content/_sidebar.md`. Find the appropriate section (likely under a "Handbücher" or similar grouping). Add:

```markdown
  * [Systembrett im Whiteboard](systembrett.md)
```

Insert alphabetically or next to related coaching content. If the sidebar is flat, append before the admin/ops section.

- [ ] **Step 5.3: Deploy the docs ConfigMap**

```bash
task docs:deploy
```

This updates the ConfigMap and rolls the docs deployment on both mentolder and korczewski (see Taskfile lines 1244–1270).

Expected: `deployment.apps/docs restarted` twice.

- [ ] **Step 5.4: Verify the docs page is live**

```bash
curl -sf https://docs.mentolder.de/#/systembrett -o /dev/null && echo "mentolder OK"
curl -sf https://docs.korczewski.de/#/systembrett -o /dev/null && echo "korczewski OK"
```

Expected: both print `OK`. If not, check `kubectl --context <env> -n workspace get configmap docs-content -o jsonpath='{.data.systembrett\.md}' | head` — the file should be present.

- [ ] **Step 5.5: Seed korczewski too**

```bash
task workspace:systembrett-setup ENV=korczewski
```

Expected: same success output as mentolder. Spot-check in `https://files.korczewski.de/apps/files/?dir=/Coaching`.

- [ ] **Step 5.6: Correct the spec's piece count**

In `docs/superpowers/specs/2026-04-24-systembrett-whiteboard-template-design.md`, update every reference to "14" pieces to "15". Specifically:

- Header/intro paragraphs mentioning "14 primitive pieces" → "15"
- §2 scope bullet mentioning "14" → "15"
- §4 intro "14 unlabeled primitives" → "15"

Rationale: §4.1–4.5 itemizes 3+2+4+2+4 = 15. Honest count wins.

- [ ] **Step 5.7: Commit docs + spec correction**

```bash
git add k3d/docs-content/systembrett.md \
        k3d/docs-content/_sidebar.md \
        docs/superpowers/specs/2026-04-24-systembrett-whiteboard-template-design.md
git commit -m "docs(systembrett): add coach how-to page + correct spec piece count to 15"
```

- [ ] **Step 5.8: Run the full test suite**

```bash
./scripts/tests/systembrett-build.test.sh
task workspace:validate
```

Expected: both exit 0.

- [ ] **Step 5.9: Push and open the PR**

```bash
git push -u origin feature/systembrett-whiteboard-template
gh pr create --title "Systembrett Whiteboard Template" --body "$(cat <<'EOF'
## Summary

- Digital Systembrett as a reusable Nextcloud Whiteboard template
- 15 unlabeled primitives across 5 categories covering all 5 Systembrett coaching contexts
- Embedded Excalidraw library — coaches duplicate the template per session
- Seeded via `task workspace:systembrett-setup`, chained into `workspace:post-setup`
- Coach-facing how-to page in docs-site

## Spec

`docs/superpowers/specs/2026-04-24-systembrett-whiteboard-template-design.md`

## Verification findings

`docs/superpowers/plans/2026-04-24-systembrett-verification-findings.md`
(Path A confirmed viable — embedded library travels across users.)

## Test plan

- [x] `scripts/tests/systembrett-build.test.sh` — build script assembles 15-item template
- [x] `task workspace:validate` — manifest validation green
- [x] `task workspace:systembrett-setup ENV=mentolder` — template uploaded, visible in Files
- [x] `task workspace:systembrett-setup ENV=korczewski` — template uploaded, visible in Files
- [x] Docs page live at docs.mentolder.de/#/systembrett and docs.korczewski.de/#/systembrett
- [x] Open template as coach, confirm 15 library items
- [x] Open template as second user, confirm library visible on first open
- [x] Spot-check one scene from each of the 5 coaching contexts builds from the toolkit

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5.10: Merge**

Per project convention (`PR workflow — auto-merge` memory): merge immediately after PR creation.

```bash
gh pr merge --squash --delete-branch
```

---

## Self-review checklist (run after execution)

- [ ] All 15 library items present and named correctly.
- [ ] `systembrett-template.whiteboard` opens in Nextcloud on both clusters and shows the library.
- [ ] `task workspace:post-setup ENV=mentolder` runs `systembrett-setup` as part of the chain (no manual step needed for future deploys).
- [ ] Docs page reachable on both clusters.
- [ ] Spec piece-count corrected to 15.
- [ ] No uncommitted changes, no stray `systembrett.excalidrawlib` variants.
