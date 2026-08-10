## Task 4: M1 + M4 + M10 — Dokumentation aktualisieren

**Purpose:** Drei Dokumentationslücken schließen: Divergence-Guard-Fallunterscheidung, gitleaks-Setup-Hinweis, Ticket-Closure-Deliverable-Check.

**Files:**
- `.opencode/skills/opencode-flow-execute/SKILL.md`
- `CLAUDE.md`

**Steps:**

### Step 1: M1 — Fallunterscheidung in opencode-flow-execute
- `.opencode/skills/opencode-flow-execute/SKILL.md` Zeile 60:
  ```bash
  (cd "$MAIN_REPO" && git fetch origin main:main)
  ```
  Ersetzen durch:
  ```bash
  # Im Worktree (main nicht ausgecheckt):
  (cd "$MAIN_REPO" && git fetch origin main:main)
  # Im Hauptcheckout (main ausgecheckt): stattdessen
  # (cd "$MAIN_REPO" && git pull --ff-only origin main)
  ```

### Step 2: M4 — gitleaks in Setup-Doku aufnehmen
- `CLAUDE.md`: Unter "Critical Footguns" oder neuem Abschnitt "Entwicklungs-Setup"
  einen Eintrag ergänzen:
  ```
  - **gitleaks** fehlt lokal → `apt install gitleaks`. Ohne es wird der lokale
    Pre-Commit-Secret-Scan stillschweigend übersprungen (CI ist fail-closed).
    Ein versehentlich committeter Schluessel fällt erst nach dem Push in CI auf.
  ```

### Step 3: M10 — Ticket-Closure Deliverable-Check dokumentieren
- `CLAUDE.md` unter "Merge = closure" (T001092) ergänzen:
  ```
  Vor manuellem `done`/`shipped` prüfen: Sind alle im Plan deklarierten
  Deliverables auf `origin/main`? (git log mit den Dateipfaden, ob sie im
  letzten Merge-Commit auftauchen.)
  ```
  Redaktioneller Hinweis, kein automatisierter Guard.

**Verify:**
1. `task freshness:check` — keine generierten Artefakte betroffen (Docs-only)
2. `grep -c 'gitleaks' CLAUDE.md` → ≥1 (Eintrag existiert)
3. Manuelle Sichtprüfung der drei Änderungen
