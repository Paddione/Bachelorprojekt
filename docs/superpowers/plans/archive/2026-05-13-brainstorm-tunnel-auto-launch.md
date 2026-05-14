# Brainstorm Tunnel Auto-Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Edit `.claude/skills/dev-flow/SKILL.md` so the Feature path automatically patches `helper.js` for `wss://`, starts the brainstorm server, publishes the tunnel to `https://brainstorm.mentolder.de`, and directs the user there — all before invoking `superpowers:brainstorming`.

**Architecture:** Single file edit — the dev-flow skill's Feature path gains a pre-launch block (Schritt 1a) that runs three bash commands and captures server JSON, then a revised brainstorming step (Schritt 1b) that invokes the skill with an override context preventing double-start and localhost URLs. The existing "Visual Companion" section is reframed as a troubleshooting appendix.

**Tech Stack:** Bash skill text (no code files), existing `scripts/superpowers-helper-patch.sh`, existing `task brainstorm:publish`, existing `start-server.sh` from superpowers plugin.

---

### Task 1: Replace Feature path Schritt 1 with pre-launch + override block

**Files:**
- Modify: `.claude/skills/dev-flow/SKILL.md` lines 40–42 (the current step 1 bullet under `### Feature-Pfad`)

- [ ] **Step 1: Open the skill file and locate the Feature path step 1**

  The block to replace starts at "1. **Brainstorming.** Rufe `superpowers:brainstorming` auf." and ends at the closing bullet line "...`xdg-open` lokal zu fahren, siehe Sektion **Visual Companion via brainstorm.mentolder.de** unten."

  Exact old text:
  ```
  1. **Brainstorming.** Rufe `superpowers:brainstorming` auf. Ergibt eine Spec in `docs/superpowers/specs/`.
     - Visual-Companion-Artefakte (HTML-Mockups, Diagramme, Vergleichsbilder) werden vom lokalen brainstorming-Server ausgeliefert. Damit Patrick sie im Browser durchklicken kann statt `xdg-open` lokal zu fahren, siehe Sektion **Visual Companion via brainstorm.mentolder.de** unten.
  ```

- [ ] **Step 2: Replace with the pre-launch + override block**

  New text to insert in place of the old step 1:
  ```
  1. **Brainstorming pre-launch (Schritt 1a — vor brainstorming-Skill-Aufruf).**

     ```bash
     # a) wss:// sicherstellen (idempotent)
     bash scripts/superpowers-helper-patch.sh
     ```

     Falls exit ≠ 0: Abbruch. Mitteilen: "wss:// patch failed — run `bash scripts/superpowers-helper-patch.sh` manually and retry."

     ```bash
     # b) Server starten — Bash-Tool im Vordergrund, Ausgabe ist eine JSON-Zeile
     START_SCRIPT=$(find ~/.claude/plugins/cache/claude-plugins-official/superpowers \
       -name start-server.sh | sort -V | tail -1)
     RESULT=$(bash "$START_SCRIPT" --project-dir /home/patrick/Bachelorprojekt)
     PORT=$(echo "$RESULT" | jq -r '.port')
     SCREEN_DIR=$(echo "$RESULT" | jq -r '.screen_dir')
     STATE_DIR=$(echo "$RESULT" | jq -r '.state_dir')
     ```

     Falls `$PORT` leer oder kein JSON-Output: Abbruch. Mitteilen: "brainstorm server konnte nicht gestartet werden — prüfe ob das superpowers Plugin installiert ist."

     ```bash
     # c) Tunnel publishen — Bash-Tool mit run_in_background: true
     task brainstorm:publish -- $PORT
     ```

     Falls der Tunnel sofort mit Fehler endet: Warnung "Tunnel konnte nicht aufgebaut werden — `task brainstorm:status` ausführen." Brainstorming läuft terminal-only weiter (kein Abbruch).

     Patrick mitteilen: **"Brainstorming-Companion läuft unter https://brainstorm.mentolder.de — jetzt im Browser öffnen."**

  2. **Brainstorming (Schritt 1b).** Rufe `superpowers:brainstorming` auf. Ergibt eine Spec in `docs/superpowers/specs/`.

     Direkt nach dem Skill-Aufruf folgenden Override-Kontext voranstellen (vor der ersten brainstorming-Antwort):

     > "Visual-Companion-Server läuft bereits (Port `$PORT`). `screen_dir=$SCREEN_DIR`, `state_dir=$STATE_DIR`. Rufe `start-server.sh` nicht nochmals auf. Wenn du den User zur Browser-URL dirigierst, nenne immer `https://brainstorm.mentolder.de` — niemals `http://localhost:*`."
  ```

  Note: the old step 2 onwards (Plan, Frontmatter-Hook, etc.) becomes step 3 onwards — renumber accordingly.

- [ ] **Step 3: Renumber the downstream steps**

  After inserting the new steps 1 and 2, the old steps 2–10 become steps 3–11. Update only the leading numbers; content is unchanged.

  Old → New mapping:
  - old `2. **Plan.**` → `3. **Plan.**`
  - old `3. **Frontmatter-Hook.**` → `4. **Frontmatter-Hook.**`
  - old `4. **Execution-Mode wählen.**` → `5. **Execution-Mode wählen.**`
  - old `5. **Implementation.**` → `6. **Implementation.**`
  - old `6. **Lokale Verifikation.**` → `7. **Lokale Verifikation.**`
  - old `7. **Pre-Merge Preview auf dev k3d.**` → `8. **Pre-Merge Preview auf dev k3d.**`
  - old `8. **PR.**` → `9. **PR.**`
  - old `9. **Auto-Merge**` → `10. **Auto-Merge**`
  - old `10. **Post-Merge.**` → `11. **Post-Merge.**`

- [ ] **Step 4: Verify numbering is clean**

  Run:
  ```bash
  grep -n '^\([0-9]\+\)\.' /home/patrick/Bachelorprojekt/.claude/skills/dev-flow/SKILL.md | head -30
  ```
  Expected: Feature path shows 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11 in order with no gaps or duplicates.

---

### Task 2: Reframe the "Visual Companion" section as troubleshooting appendix

**Files:**
- Modify: `.claude/skills/dev-flow/SKILL.md` — the `## Visual Companion via brainstorm.mentolder.de` section header and its opening paragraph

- [ ] **Step 1: Update the section header**

  Old:
  ```
  ## Visual Companion via brainstorm.mentolder.de
  ```

  New:
  ```
  ## Visual Companion via brainstorm.mentolder.de — Diagnose & manuelle Bedienung
  ```

- [ ] **Step 2: Replace the section intro paragraph**

  The current intro under the header reads:

  > "Der `superpowers:brainstorming`-Server bindet per Default `127.0.0.1:<random-port>` und schreibt Klicks aus dem Browser über WebSocket nach `$STATE_DIR/events`. Damit der Klick-Loop auch im Browser des Users funktioniert (und nicht nur auf `localhost`), gibt es eine sish-Reverse-Tunnel-Bridge auf dem mentolder-Cluster."

  Replace with:

  > "Diese Sektion ist für Diagnose und manuelle Eingriffe. Der normale Ablauf im Feature-Pfad (Schritt 1a) richtet den Tunnel automatisch ein. Hier stehen die Hintergründe und Notfallbefehle."

- [ ] **Step 3: Verify the section still contains the "Setup einmalig" and "Pro Session" subsections unchanged**

  Run:
  ```bash
  grep -n "Setup einmalig\|Pro Session\|Diagnose\|ws://.*wss://" \
    /home/patrick/Bachelorprojekt/.claude/skills/dev-flow/SKILL.md
  ```
  Expected: all four patterns appear at least once.

---

### Task 3: Final verification and commit

**Files:**
- Read: `.claude/skills/dev-flow/SKILL.md` (full read to sanity-check)

- [ ] **Step 1: Read the full Feature-Pfad section and confirm structure**

  Run:
  ```bash
  sed -n '/### Feature-Pfad/,/### Fix-Pfad/p' \
    /home/patrick/Bachelorprojekt/.claude/skills/dev-flow/SKILL.md
  ```
  Expected output must contain (in order):
  1. `Schritt 1a` block with `superpowers-helper-patch.sh`, `start-server.sh`, `brainstorm:publish`
  2. `Schritt 1b` block with the override-context quote
  3. Steps numbered 3–11 for the remainder of the Feature path

- [ ] **Step 2: Confirm no `localhost` URL remains in the new brainstorming steps**

  Run:
  ```bash
  sed -n '/### Feature-Pfad/,/### Fix-Pfad/p' \
    /home/patrick/Bachelorprojekt/.claude/skills/dev-flow/SKILL.md \
    | grep "localhost"
  ```
  Expected: zero matches (the only localhost references live in the "Pro Session" subsection of the Visual Companion appendix, which is outside this range).

- [ ] **Step 3: Confirm wss:// patch command is present**

  Run:
  ```bash
  grep -c "superpowers-helper-patch.sh" \
    /home/patrick/Bachelorprojekt/.claude/skills/dev-flow/SKILL.md
  ```
  Expected: `3` (once in Schritt 1a, once in the error message, once in the `ws://`→`wss://` Auto-Patch subsection of the appendix).

- [ ] **Step 4: Commit**

  ```bash
  git add .claude/skills/dev-flow/SKILL.md
  git commit -m "feat(dev-flow): auto-launch brainstorm tunnel in Feature path brainstorming step"
  ```
