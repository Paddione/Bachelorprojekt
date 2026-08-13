## Task 1: Worktree-Health-Vorcheck + Hygiene-Runbook (T002994, T002995, T002998)

**Purpose:** Die drei Hygiene-Fixes: (1) Integritäts-Vorcheck des gemeinsamen Objektspeichers
vor jedem Worktree-/Branch-Lauf (T002994), (2) Dirty-Befunde erst nach zweiter Messung melden
(T002995), (3) Porcelain-basierte Worktree-Iteration statt Dateisystem-Glob mit
Orphan-Befund (T002998). Gemeinsamer Kern: ein positives, verifiziertes Signal statt
Abwesenheit eines Fehlers.

**Files:**
- `scripts/git-worktree-health.sh` (neu)
- `scripts/worktree-clean-check.sh`
- `.claude/skills/references/repo-hygiene-ops.md`
- `.claude/skills/references/ticket-ops-procedures.md`

**Steps:**

### Step 1: `scripts/git-worktree-health.sh` anlegen (neu)

Bash-Skript mit Exit-Code-Kontrakt wie `worktree-clean-check.sh` (0 sauber, 1 Befund,
2 nicht prüfbar) und zwei Subkommandos:

- `objects` (T002994):
  - Repo-Anker: `git rev-parse --git-dir` — nicht auflösbar → Exit 2 mit
    "kein Repository" (Fail-Closed, kein Urteil).
  - Vorcheck: `find "$(git rev-parse --git-dir)/objects" -type f -size 0` → nicht leer ist
    ein Befund.
  - Vertiefung: `git fsck --no-reflogs --no-progress` → nicht ausführbar → Exit 2;
    Fehlerausgabe → Befund.
  - Bei Befund: Rettungssequenz aus T002994 ausgeben:
    a) letzten gültigen Commit aus `.git/worktrees/<name>/logs/HEAD` in
       `.git/worktrees/<name>/HEAD` schreiben,
    b) `git rebase --abort` im betroffenen Worktree,
    c) `find .git/objects -type f -size 0 -delete` (löscht nichts Werthaltiges — die
       Dateien sind bereits unlesbar),
    d) `git reflog expire --stale-fix --all`,
    e) Gegenprobe: `git fsck --no-reflogs` sauber + `git fetch` wieder funktionsfähig.
  - Hinweis: verbleibende `invalid reflog entry`-Meldungen sind kosmetisch.
- `orphans` (T002998):
  - Registrierte Worktrees: `git worktree list --porcelain` (nur `worktree `-Zeilen).
  - On-disk-Kandidaten: `.worktrees/*`-Verzeichnisse relativ zum Repo-Root
    (`git rev-parse --show-toplevel`).
  - Differenzmenge (Verzeichnis ohne Registrierung) → Zeile pro Orphan:
    `ORPHAN-WORKTREE: <pfad> (kein Eintrag in 'git worktree list')` → Exit 1.
  - Kein `.worktrees/`-Verzeichnis → Exit 0 ("keine Kandidaten").
- Gemeinsam: `set -euo pipefail` nicht verwenden, wo der Exit-Code eines Kommandos
  getrennt ausgewertet werden muss — stattdessen `cmd && rc=0 || rc=$?`-Muster wie in
  `worktree-clean-check.sh` Zeile 33.

### Step 2: `scripts/worktree-clean-check.sh` — Zweitmessung

- Liefert der erste `git status --porcelain`-Lauf nicht-leere nicht-allowlistete Residuen,
  einen zweiten Lauf ausführen.
- Nur Residuen, die BEIDE Läufe identisch melden → Befund (Exit 1).
- Erster Lauf mit Residuen, zweiter leer → Exit 0 mit Hinweis auf stdout:
  "Stat-Cache aufgefrischt, keine persistenten Änderungen (T002995)".
- Bestehender Exit-Code-Kontrakt (0/1/2) bleibt unverändert; der erste Lauf
  (Zeile 33-38) wird in eine Funktion `_status_once` extrahiert, die beide Läufe
  gemeinsam nutzt.

### Step 3: repo-hygiene-ops.md — §0 Vorcheck, §1 Zweitmessung + Orphan + Porcelain

- §0 ("Arbeitsbaum & Stashes"): VOR dem Worktree-/Branch-Abschnitt einen Integritäts-Schritt
  einfügen: `bash scripts/git-worktree-health.sh objects` — Befund → Lauf stoppen und
  Rettungssequenz ausführen; die Sequenz als dokumentierten Weg (siehe Step 1).
- §0 Stash-Inventar (Punkt 2): Notiz ergänzen, dass `refs/stash` im gemeinsamen
  Git-Verzeichnis liegt und gelistete Einträge aus beliebigen Worktrees stammen können —
  Zuordnung nur über die Nachricht, und nur wenn benannt (T003070-Kontext).
- §1 ("Stale Git Worktrees"): 
  - Vor dem Remove-Loop `git-worktree-health.sh objects` aufrufen (Verweis auf §0).
  - Dirty-Regel ergänzen: ein Befund aus `worktree-clean-check.sh` ist bereits
    zweitgemessen (Skript), für manuelle `git status --porcelain`-Kontrollen gilt:
    Befund durch zweiten Lauf bestätigen, bevor daraus ein Urteil wird (T002995).
  - Iterations-Regel: Schleifen über `git worktree list --porcelain` führen, nicht über
    `.worktrees/*/`; die Differenz zum Dateisystem ist selbst ein Befund →
    `git-worktree-health.sh orphans` (T002998).

### Step 4: ticket-ops-procedures.md — Glob-Schleife ersetzen

- Zeile ~417 (`for wt in .worktrees/*"<ext-id>"*; do [ -d "$wt" ] && { git -C "$wt"
  status --porcelain ...; }; done`): ersetzen durch Porcelain-Iteration über
  `git worktree list --porcelain` mit anschließendem Namensfilter auf `<ext-id>` UND
  `[ -e "$wt/.git" ]`-Guard, damit `git -C` nicht über die Aufwärtssuche das Elternrepo
  beantwortet (T002998).

**Verify:**
1. `bash scripts/git-worktree-health.sh objects` im Repo → exit 0 (sauberer Objektspeicher)
2. `bash scripts/git-worktree-health.sh orphans` im Repo → exit 0 oder listet echte Orphans
3. `bash scripts/worktree-clean-check.sh .` → exit 0 (kein Befund)
4. Fixture-Repro (T002995): Worktree mit mtime-desynchronisiertem Index → erster Lauf
   dirty, Skript meldet exit 0 mit Stat-Cache-Hinweis
5. Fixture-Repro (T002998): Orphan-Verzeichnis unter `.worktrees/` → `orphans` exit 1
6. `bash scripts/plan-lint.sh openspec/changes/batch-git-worktree-integrity/tasks.md` → PASS
7. `task test:changed` grün (bestehende Spec-Tests, z. B. worktree-clean-check-Suite)
