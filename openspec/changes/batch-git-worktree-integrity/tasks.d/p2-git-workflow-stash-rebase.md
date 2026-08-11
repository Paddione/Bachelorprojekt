## Task 2: Git-Workflow-Konventionen — Stash-Lebenszyklus + Rebase-Freshness (T003069, T003070, T003105)

**Purpose:** Drei Skill-/Konventions-Fixes am Git-Lifecycle: (1) Teil-Pop nach Rebase wird
als Befund erkannt statt als Erfolg (T003069), (2) Stash-Disziplin bei geteiltem Stack —
nachrichtenbasierte Auflösung + Sicherungsnetz-Skript (T003070), (3) Freshness-Nachprüfung
nach jedem Rebase, weil `merge=ours` Artefakte still ersetzt (T003105).

**Files:**
- `.claude/skills/git-workflow/SKILL.md`
- `.opencode/skills/opencode-git-workflow/SKILL.md`
- `scripts/git-stash-net.sh` (neu)
- `scripts/worktree-create.sh`

**Steps:**

### Step 1: `scripts/git-stash-net.sh` anlegen (neu, T003070)

Nachrichtenbasierte Stash-Operationen als Referenz für Skills und worktree-create.sh.
Exit-Codes: 0 ok, 1 Befund (Teil-Pop / nicht vollständig angewendet), 2 kein Eintrag
gefunden (Fail-Closed — kein stilles "nichts gefunden = Erfolg").

- `find --by-ticket <id>`: `git stash list --format='%gd|%gs'` durchsuchen, Einträge
  ausgeben, deren Nachricht die Ticket-ID trägt (case-insensitiv, `T[0-9]{6}`-Form
  normalisiert). Ausgabe: `<index> <message>` pro Treffer; kein Treffer → exit 2.
- `pop --by-message <pattern>`:
  1. Eintrag per Nachricht-Regex suchen (nicht per Index).
  2. Vorher: Anzahl der Einträge mit dem Pattern zählen.
  3. `git stash pop <index>` — Ausgabe sichtbar lassen, Exit-Code getrennt messen.
  4. Nachher: zählen — Eintrag weg → exit 0; Eintrag noch da → exit 1 mit
     "Teil-Pop" + Wiederherstellungshinweis (`git stash show --stat`,
     `git checkout "stash@{0}" -- <pfad>`), Eintrag bleibt als Sicherungsnetz erhalten.
- `set -uo pipefail` verwenden, Exit-Codes von git-Aufrufen getrennt von Pipes messen.

### Step 2: `.claude/skills/git-workflow/SKILL.md` — Schritt 0 (Pull-First)

- Nach dem `git stash pop` im Pull-First-Block (Zeile 27) die positive Verifikation
  ergänzen: `git stash list` prüfen — der eigene Eintrag (per Nachricht identifiziert)
  MUSS verschwunden sein; `git stash list`-Kürzung um genau den eigenen Eintrag ist der
  Erfolgsbeleg (T003069).
- Verbleibt der Eintrag: **Befund, kein Erfolg** — Teil-Pop durch post-rewrite-Hook
  (z. B. regeneriertes Freshness-Artefakt unter website/src/data/); Wiederherstellung:
  `git stash show --stat "stash@{0}"` gegen den Arbeitsbaum halten, fehlende Datei gezielt
  zurückholen mit `git checkout "stash@{0}" -- <pfad>`.
- Stash-Disziplin-Absatz neu (T003070): `refs/stash` ist worktree-übergreifend geteilt
  (`git rev-parse --git-common-dir`) — bei Parallelarbeit Wegwerf-Commit auf dem eigenen
  Branch (`git commit -m wip`, später `git reset --soft HEAD~1`); wo ein Stash nötig
  bleibt: immer `-m` mit Ticket-ID und Auflösung über die Nachricht
  (`bash scripts/git-stash-net.sh pop --by-message ...`), nie über den Index `stash@{0}`.
- Rebase-Freshness-Regel (T003105): Nach JEDEM Rebase VOR dem Push `task freshness:check`
  erneut laufen lassen; rot → `task freshness:regenerate` → Artefakte stagen → Commit
  ergänzen. Explizit benennen: `merge=ours` (`.gitattributes`) löst ohne Konfliktmarker
  zugunsten einer Seite auf — ein grüner Rebase belegt die Vollständigkeit der Artefakte
  nicht; billige Gegenprobe: `git show --stat HEAD -- <artefaktpfade>`.

### Step 3: `.opencode/skills/opencode-git-workflow/SKILL.md` — dieselben drei Regeln

- Schritt 0 (Zeile 23-27): Stash-Pop-Verifikation + Teil-Pop-Befund + Wiederherstellung
  (identisch zu Step 2, T003069).
- Stash-Disziplin-Absatz (T003070) mit Verweis auf `scripts/git-stash-net.sh`.
- Schritt 1 + Schritt 5: Freshness-nach-Rebase-Regel (T003105) — nach jedem
  `git pull --rebase origin main` und jedem CONFLICTING-Rebase `task freshness:check`
  vor dem Push; der bestehende Regen-Zyklus in Schritt 5 (Zeile 157) wird als Standard
  für ALLE Rebase-Pfade zitiert.

### Step 4: `scripts/worktree-create.sh` — Auto-Stash per Nachricht poppen

- `_wc_stash_pop_or_warn` (Zeile 162): `git stash pop >/dev/null 2>&1` ersetzt durch
  nachrichtenbasierte Auflösung: `bash scripts/git-stash-net.sh pop --by-message
  'worktree-create-auto-stash'` (bzw. das Muster aus Step 1 direkt).
- Warn-Text (Zeile 168-173) aktualisieren: Referenzweg `git-stash-net.sh pop --by-message
  worktree-create-auto-stash` statt `git stash apply stash@{0}`; der Push-/Rebase-Pfad
  bleibt unverändert (der bestehende `_needs_pop`-Mechanismus aus T003078/T003097 bleibt).
- Keine Verhaltensänderung an der Stash-Erzeugung (`-m "worktree-create-auto-stash"`).

**Verify:**
1. `bash scripts/git-stash-net.sh find --by-ticket T003070` → exit 2 (kein Eintrag, Fail-Closed)
2. Fixture-Repo (T003070): zwei Stashes anlegen, Index durch fremden Push verschieben →
   `pop --by-message` findet und droppt den richtigen Eintrag
3. Fixture-Repo (T003069): Teil-Pop-Szenario → `pop --by-message` exit 1, Eintrag bleibt
4. `bash scripts/worktree-create.sh <konformer-branch> .worktrees/test-t003539` → Auto-Stash
   wird per Nachricht gepoppt, Warn-Text referenziert git-stash-net.sh
5. Skills-Diffs gegengelesen: beide Varianten enthalten die drei Regeln (T003069,
   T003070, T003105)
6. `bash scripts/plan-lint.sh openspec/changes/batch-git-worktree-integrity/tasks.md` → PASS
7. `task test:changed` grün (bestehende worktree-create-/divergence-guard-Suite)
