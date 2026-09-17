# Proposal: Batch — T900054-Fallout Windows-Tooling

## Kontext
Am 2026-09-04 wurden im Rahmen von T900054 (WSL/Windows-Tooling-Lauf) mehrere systemische Defekte identifiziert, die unter Windows-Bedingungen (WSL, MSYS, Git Bash) auftreten und kritische Risiken bergen: stille Datenkorruption, Tests die übergangen werden statt zu scheitern, und falsche Negativ-Meldungen im Deliverable-Check.

Alle drei Defekte sind **disjunkt** (unterschiedliche Dateien, keine Dateikonflikte) und können parallel implementiert werden.

## Teil 1 — M10-Deliverable-Check falsch-negativ [T900067]

**Problem:** Der M10-Deliverable-Check (Scripts/CLAUDE.md) gibt unter Git Bash auf Windows falsch-negativ aus, weil MSYS den Pfad `origin/main:<datei>` nicht auflöst. Ein nicht committetes, aber geändertes File wird als "in order" gemeldet.

**Betroffen:** `docs/CLAUDE.md` M10-Absatz, Scripte im Deliverable-Check

**Fix:** Pfadauflösung unter MSYS/Windows harden — `git rev-parse` statt substring-match, oder `git diff --quiet -- <path>` mit explizitem pathspec.

**Target spec:** `scripts.md` (delta auf SSOT), `ci-cd.md`

---

## Teil 2 — BATS-Testnamen mit Umlauten still-skip [T900068]

**Problem:** Ein `@test`-Name mit Umlaut wird vom mitgelieferten bats-Runner unter Windows nicht gefunden. Der Runner meldet `bats: unknown test name` und **ueberspringt** den Fall, statt zu scheitern. Exit-Code bleibt unberuehrt. Nur eine Warnzeile (`Executed N instead of expected M`) verraeat es.

**Betroffen:** `tests/unit/lib/bats-core/bin/bats`, `tests/CLAUDE.md`

**Fix:**
1. Guard im Runner: `Executed N instead of expected M` mit N != M als Fehler werten.
2. tests/CLAUDE.md um ASCII-Pflicht fuer `@test`-Namen ergaenzen.

**Target spec:** `spec-bats-agentic-ai.md` (delta auf SSOT), `e2e-testing.md`

---

## Teil 3 — Worktree-write-guard: stiller Hauptbaum-Treffer [T900066]

**Problem:** Ein geloeschter Worktree (`.git`-Datei verschwunden) laeuft git-Befehle **still** gegen den Hauptbaum — ohne Fehlermeldung. `git rev-parse --git-dir` gibt den Hauptbaum zurueck. Ein `git commit` aus dem "vermeintlichen" Worktree heraus geht gegen einen fremden Branch.

**Betroffen:** `scripts/hooks/worktree-write-guard.sh`, `scripts/lib/worktree-prune-safe.sh`

**Fix:**
1. Fail-closed-Guard: `git rev-parse --git-dir` und `git rev-parse --git-common-dir` gegen erwartete Pfade pruefen, bevor ein Commit/Write erfolgt. Wenn Abweichung → laut scheitern.
2. Ermittlung des Loeschungs-Ursa (Kandidaten: Hygiene-Skripte, `agent-lock`-Reaper, Factory-Cleanup) und Absicherung gegen loeschen von `locked` Worktrees.

**Target spec:** `scripts.md` (delta auf SSOT), `fix-sdlc-isolation.md` (falls vorhanden), `agent-skills.md`

---

## Risiko-Abschaetzung

| Partial | Risiko | Umfang |
|---------|--------|--------|
| p1 M10-Check | Niedrig — nur Script-Pfad, kein Runtime-Code | ~30 Zeilen |
| p2 BATS-Guard | Niedrig — bats-core-Wrapper + CLAUDE.md | ~40 Zeilen |
| p3 Worktree-Guard | Mittel — kritischer Guard, muss korrekt sein | ~60 Zeilen |

## Abgrenzung

- `a623e9939` (T900046, "protect cross-platform worktrees from prune destruction") loest TEIL 3 teilweise — aber nur die Prune-Seite, nicht den Write-Guard. Der Write-Guard (worktree-write-guard.sh) ist ein anderes Skript mit anderer Funktion.
- Keine Aenderungen am Runtime-Code der Applications (Factory, Website, etc.).

## Plan-Intel

### Teil 1 — M10-Check
- Script: Deliverable-Check im M10-Abschnitt von `docs/CLAUDE.md`
- Test: `tests/spec/software-factory/m10-deliverable-check.bats`
- File: `scripts/agent-guide/` Check-Routinen

### Teil 2 — BATS-Guard
- Script: `tests/unit/lib/bats-core/bin/bats` (Wrapper)
- Test: `tests/spec/runner/bats-runner.bats` (falls vorhanden), sonst neu
- File: `tests/CLAUDE.md` Naming-Rules

### Teil 3 — Worktree-Guard
- Script: `scripts/hooks/worktree-write-guard.sh`
- Lib: `scripts/lib/worktree-prune-safe.sh`
- Test: `tests/spec/worktree-cross-platform.bats` (bestehend), `tests/spec/worktree-write-guard.bats`
- File: `scripts/hooks/` Guard-SSOT
