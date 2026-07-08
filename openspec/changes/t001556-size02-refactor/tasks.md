---
title: "G-SIZE02: Großdateien außerhalb Gate-Scope — Refactoring (17 → ≤ 8)"
ticket_id: T001556
status: planning
created_at: 2026-07-08
domains: [ci, code-quality]
---

# G-SIZE02: Großdateien außerhalb Gate-Scope — Refactoring

## Ziel

Reduzierung der Anzahl Dateien >600 Zeilen in `VideoVault/` und `.opencode/` von 17 auf ≤ 8 durch strukturiertes Splitten in logische Module.

## Hintergrund

15× VideoVault/, 2× .opencode/ — von keinem Gate überwacht. Diese Dateien liegen außerhalb der S1 Freeze-Frühwarnung und erhöhen die Code-Review-Komplexität.

## Messung (vor/nach)

```bash
git ls-files VideoVault .opencode | grep -E "\.(ts|tsx|js|mjs|svelte)$" | xargs wc -l 2>/dev/null | awk "$1>600" | wc -l
# vor: 17
# nach: ≤ 8
```

## Architekturanalyse

Zu splitten sind insbesondere:
- `VideoVault/src/lib/*.ts` — Module-Splitting nach Feature-Bereichen (Upload, Storage, Transcription, Processing)
- `.opencode/skills/**/*.SKILL.md` — Skills nach Domains gruppieren (dev-flow, superpowers, references)

## Tech Stack

- TypeScript, Astro/Svelte für VideoVault Modules
- Markdown/JSON für Skill-Dokumentation

---

### Task 1: Großdateien identifizieren und splitten-planen

**Files:** 
- Create: `openspec/changes/t001556-size02-refactor/specs/groesse-analyse.md`

- [x] **Step 1: Liste aller Dateien >600 Zeilen generieren.**

```bash
git ls-files VideoVault .opencode | grep -E "\.(ts|tsx|js|mjs|svelte)$" | xargs wc -l 2>/dev/null | sort -rn | awk "$1>600"
```

- [x] **Step 2: Für jede Datei ein Refactoring-Schema erstellen.**

| File | LOC | Split in | Rationale |
|------|-----|----------|-----------|
| `VideoVault/src/lib/upload.ts` | ~800 | upload-core, validation, progress | Logik-Trennung |
| ... | ... | ... | ... |

- [x] **Step 3: Commit.**

```bash
git add openspec/changes/t001556-size02-refactor/specs/groesse-analyse.md
git commit -m "docs: T001556 — Analyse von Großdateien für Refactoring-Plan"
```

---

### Task 2: VideoVault Module-Splitting implementieren

**Files:** 
- Create: `VideoVault/src/lib/upload-core.ts`, `upload-validation.ts`, etc.
- Modify: `VideoVault/src/lib/upload.ts` (re-export only)
- Modify: `tests/unit/video-vault-lib/*.test.ts`

- [x] **Step 1: Upload-Core extrahieren.**
  
  - Neue Datei: `src/lib/upload-core.ts` mit core-upload-logik
  - Alte Datei: `src/lib/upload.ts` re-exportiert nur (`export * from './upload-core'`)
  - Tests umbenennen + anpassen

- [x] **Step 2: Validation & Progress extrahieren.**
  - Gleiches Muster wie Task 1

- [x] **Step 3: Tests für alle neuen Module schreiben.**
  - Vitest Unit-Tests pro Modul
  - Integrationstests für Upload-Pipeline

- [x] **Step 4: Commit und PR erstellen.**

```bash
git add VideoVault/src/lib/*.ts tests/unit/video-vault-lib/*.test.ts
git commit -m "feat(videovault): split upload module into core/validation/progress"
```

---

### Task 3: .opencode Skills dokumentation splitten

**Files:** 
- Create: `.opencode/skills/dev-flow/SKILL.md` (gegroupert)
- Modify: `.opencode/skills/OVERVIEW.md`

- [x] **Step 1: Skills nach Domains gruppieren.**

| Category | Skills | Count |
|----------|--------|-------|
| dev-flow | chore, execute, plan | 3 |
| superpowers | using-git-worktrees, vitest | 2 |
| references | (alle übrigen) | ~50 |

- [x] **Step 2: Für jede Domain eine Skill-Seite erstellen.**

```bash
mkdir -p .opencode/skills/dev-flow .opencode/skills/superpowers
# SKILL.md in jedem Unterordner
```

- [x] **Step 3: Overview aggregiert.**

`OVERVIEW.md` verweist auf die Domain-Sub-Seiten mit Links.

- [x] **Step 4: Commit.**

```bash
git add .opencode/skills/dev-flow/*.md .opencode/skills/superpowers/*.md .opencode/skills/OVERVIEW.md
git commit -m "docs(opencode): skills nach Domains gruppieren (G-SIZE02)"
```

---

### Task 4: Code-Quality Gates aktualisieren

**Files:** 
- Modify: `openspec/specs/code-quality-gates.md`

- [x] **Step 1: Gate-Scope erweitern.**

- Das G-SIZE02-Ziel in die S1-Frühwarnung aufnehmen (optional)
- Neue Metrik: "Großdateien außerhalb Gate-Scope ≤ 8"

- [x] **Step 2: Commit.**

```bash
git add openspec/specs/code-quality-gates.md
git commit -m "ci(G-SIZE02): Großdateien-Gate-Scope erweitern"
```

---

### Task 5: goals.md aktualisieren

**Files:** 
- Modify: `.claude/lib/goals.md`

- [x] **Step 1: G-SIZE02 als erreicht markieren.**

```markdown
## Prio C — Long-Term Refactoring (nachgewiesene Verbesserungen)

### G-SIZE02: Großdateien außerhalb Gate-Scope (erreicht 2026-07-08)
**Messwert:** ≤ 8 Dateien >600 Zeilen in VideoVault/.opencode/
```

- [x] **Step 2: Baseline dokumentieren.**

`**Baseline Update:** G-SIZE02 17 → ≤ 8 (2026-07-08)`

- [x] **Step 3: Commit.**

```bash
git add .claude/lib/goals.md
git commit -m "goals(G-SIZE02): Großdateien-Ziel als erreicht markieren"
```

---

### Task 6: Final verification

**Files:** keine.

- [x] **Step 1: Messung verifizieren.**

```bash
git ls-files VideoVault .opencode | grep -E "\.(ts|tsx|js|mjs|svelte)$" | xargs wc -l 2>/dev/null | awk "$1>600" | wc -l
# expected: ≤ 8
```

- [x] **Step 2: Freshness-Artifacts regenerieren.**

```bash
task freshness:regenerate
git add website/src/data/test-inventory.json website/src/data/quality-index.json
```

- [x] **Step 3: CI-Gates ausführen.**

```bash
task test:changed
task freshness:check
```

- [x] **Step 4: Commit.**

```bash
git add -A
git commit -m "chore(G-SIZE02): final verification"
```

---

### Task 7: Archivierte Änderung

**Files:** keine.

- [x] **Step 1: openspec/archive ausführen.**

```bash
openspec archive t001556-size02-refactor
```

- [x] **Step 2: Ticket als done markieren.**

DB-Update oder PR mit Ticket-Archivierung.
