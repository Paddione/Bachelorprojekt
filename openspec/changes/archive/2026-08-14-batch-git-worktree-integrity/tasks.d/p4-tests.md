## Task 4: RED-Tests für alle 7 Fixes (T002994, T002995, T002998, T003069, T003070, T003105, T003131)

**Purpose:** Failing Tests (RED) für jeden Fix, die nach P1–P3 grün werden.
Ergebnis-basiert (T002448-M4): Assertions auf command output/exit codes, kein Source-Grep.
Vor P1–P3: **expected: FAIL** (rote BATS-Tests). Nach P1–P3: **PASS**.

**Files:**
- `tests/spec/batch-git-worktree-integrity.bats` (neu)

**Steps:**

### Step 1: T002994 — 0-Byte-Loose-Objects werden gemeldet

- Fixture-Repo via `init_git_repo`-Helper (Muster: `tests/spec/worktree-divergence-guard/`),
  eine 0-Byte-Datei unter `.git/objects/` anlegen.
- `bash scripts/git-worktree-health.sh objects` → **RED (vor Fix):** exit 0 oder Skript
  fehlt; **GREEN (nach Fix):** exit 1 + Rettungssequenz-Text (`logs/HEAD`, `reflog expire`).
- Negativtest: sauberes Repo → exit 0.

### Step 2: T002995 — transienter Dirty wird nicht gemeldet

- Fixture-Worktree: Datei mit Inhalt identisch zum Index, aber desynchronisierter mtime
  (`touch -d '2020-01-01' <datei>` nach dem Add).
- `bash scripts/worktree-clean-check.sh <fixture>` → **RED (vor Fix):** exit 1 (erster
  Lauf meldet Residuum); **GREEN (nach Fix):** exit 0 + Stat-Cache-Hinweis.
- Persistent-Dirty-Gegenprobe: echte Modifikation → exit 1 in beiden Läufen.

### Step 3: T002998 — Orphan-Verzeichnis wird benannt

- Fixture: Verzeichnis `.worktrees/fake-orphan` OHNE `.git` anlegen, nicht registriert.
- `bash scripts/git-worktree-health.sh orphans` → **RED (vor Fix):** exit 0 / nicht
  vorhanden; **GREEN (nach Fix):** exit 1, Ausgabe nennt `fake-orphan`.
- Negativtest: nur registrierte Worktrees → exit 0.

### Step 4: T003069 — Teil-Pop ist ein Befund

- Fixture-Repo: Stash mit zwei Dateien anlegen; eine Datei danach extern regenerieren
  (Commit, der sie verändert), sodass `git stash pop` teilweise anwendet.
- `bash scripts/git-stash-net.sh pop --by-message <pattern>` → **RED (vor Fix):** Skript
  fehlt; **GREEN (nach Fix):** exit 1, Eintrag bleibt in `git stash list`, Hinweis auf
  `git checkout "stash@{0}" -- <pfad>`.

### Step 5: T003070 — nachrichtenbasierte Auflösung trotz Index-Verschiebung

- Fixture: zwei benannte Stashes (`-m "T003070 safety net"`, `-m "other"`); zweiten
  Eintrag nach dem ersten pushen (Index von T003070 = 1).
- `bash scripts/git-stash-net.sh find --by-ticket T003070` → findet den Eintrag trotz
  Index 1. **RED (vor Fix):** Skript fehlt; **GREEN (nach Fix):** exit 0, Index korrekt.

### Step 6: T003105 — merge=ours-Rebase wird als Freshness-Risiko benannt

- Assertion auf den Skill-Text der BEIDEN Varianten: `.claude/skills/git-workflow/SKILL.md`
  und `.opencode/skills/opencode-git-workflow/SKILL.md` enthalten `merge=ours` und
  `task freshness:check` im Rebase-Kontext (T002448-M4-Ausnahme: Regel-Text ist das
  Verhalten). **RED (vor Fix):** `merge=ours` fehlt; **GREEN (nach Fix):** beide Treffer.

### Step 7: T003131 — Guard-SID-Parität, Dedup, Meldungsquelle

- `OPENCODE_SESSION_ID=<sid>` setzen, Lock mit derselben SID anlegen (agent-lock.sh
  claim mit `AGENT_LOCK_SID=<sid>` bzw. Env), Schreibversuch in den geclaimten Worktree →
  **RED (vor Fix):** Guard blockiert eigene Claims (SID-Mismatch durch fehlende
  OPENCODE_SESSION_ID-Auflösung); **GREEN (nach Fix):** Schreiben erlaubt.
- Fremder TARGET außerhalb → Meldung enthält "agent-locks/*.json" (Quellenangabe).
- branch- + worktree-Scope-Lock auf denselben Pfad → Worktree erscheint EINMAL in der
  Liste (Dedup-Regression aus T003116).

### Step 8: Test-Inventar aktualisieren

- `bash scripts/build-test-inventory.sh` — neue Datei registrieren, FA-SF-Test-IDs vergeben.

### Step 9: Merge-Gate — task test:changed

- `task test:changed` ausführen — Smart-Selection: neue Spec-Datei + geänderte Scripts/Skills laufen
- Erwartung: grün, keine Regression in anderen Spec-Dateien

### Step 10: Merge-Gate — task freshness:regenerate

- `task freshness:regenerate` ausführen — generierte Artefakte (test-inventory.json u. a.) neu bauen
- Erwartung: läuft durch, Artefakte aktuell

### Step 11: Merge-Gate — task freshness:check

- `task freshness:check` ausführen — CI-Äquivalent: keine stale Artefakte, S1-Ratchet grün
- Erwartung: grün; rot → Regenerate-Zyklus wiederholen, bevor der PR erstellt wird

**Verify:**
1. `bash tests/unit/lib/bats-core/bin/bats tests/spec/batch-git-worktree-integrity.bats`
   → 7 RED (erwartete Failures) VOR P1–P3, 7 GREEN NACH P1–P3
2. `task test:changed` grün (keine Regression in anderen Spec-Dateien)
