---
title: "worktree-git-op-finish — Implementation Plan"
ticket_id: T015784
domains: [scripts-infra]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# worktree-git-op-finish — Implementation Plan

_Ticket: T015784_

## File Structure

```
scripts/worktree-git-op-guard.sh                       (geändert — --finish, Abschluss-Verifikation)
tests/spec/agent-skills/worktree-git-op-finish.bats    (neu — RED bereits committet)
openspec/changes/worktree-git-op-finish/               (Proposal + MODIFIED-Delta)
```

**S1-Budget.** `.sh`-Limit ist 800 Zeilen (`docs/code-quality/gates.yaml:61`),
`scripts/worktree-git-op-guard.sh` steht bei 136 und ist nicht gebaselined. Wirksame Schwelle ist
das Limit: 664 Zeilen Spielraum. Der Zuwachs liegt bei rund 60 Zeilen.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Der Test liegt als eigene Datei vor und prüft Kommando-Output
      und den realen Zustand danach (Zustandsverzeichnis, Refs) gegen ein Fixture-Repo.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/worktree-git-op-finish.bats
# expected: FAIL (rot — --finish existiert nicht, der Guard weist die Option per Usage-Fehler
# mit Exit 2 ab; Tests 1–3 scheitern an `[ "$status" -eq 0 ]`)
```

- [ ] **Task 1 — `--finish` im Argumentparser.**
      Neues Flag neben `--quiet` und `--worktree` (heute Zeile 24–32), Default `finish=false`.
      `usage()` um das Flag ergänzen. Der Kopfkommentar des Skripts beschreibt heute das
      Reparatur-Verbot unbedingt — er wird auf „Default meldet, `--finish` schließt die sichere
      Schnittmenge ab" präzisiert, damit Kommentar und Verhalten nicht auseinanderlaufen.

- [ ] **Task 2 — `_finishable` als Prüffunktion der Schnittmenge.**
      Gibt 0 zurück, wenn **alle drei** Bedingungen gelten, sonst ungleich 0:

      1. Die Operation ist ein Rebase (`op_kind` beginnt mit `rebase`) — Merges und Cherry-Picks
         fallen raus.
      2. Keine offenen Konflikte: `git diff --name-only --diff-filter=U` ist leer. Der Wert liegt
         in der Schleife bereits als `$unresolved_files` vor und wird wiederverwendet, statt ein
         zweites Mal erhoben zu werden.
      3. Keine Kommandos mehr offen: `rebase-merge/git-rebase-todo` ist leer oder nicht vorhanden
         (`git rev-parse --git-path` für den Pfad, wie überall sonst im Skript).
      4. Working Tree nach Generat-Allowlist sauber — derselbe Filter wie in
         `scripts/worktree-clean-check.sh`. **Das Skript aufrufen, den Filter nicht kopieren:**
         `repo-hygiene-ops.md` hält ausdrücklich fest, dass `ALLOWLIST=` in
         `scripts/branch-reaper.sh` die maßgebliche Quelle ist und Zweitschreibungen nachgezogen
         werden müssen. Eine dritte Kopie wäre genau die Drift, die dort beschrieben ist.

      > Zu 3: `git-rebase-todo` ist beim Merge-Backend nach dem letzten Pick leer — das ist der
      > „No commands remaining"-Zustand aus dem Fundfall.

- [ ] **Task 3 — Abschluss ausführen und am Positiv-Signal verifizieren.**
      Wo `_finishable` greift und `--finish` gesetzt ist: `git -C "$wt" rebase --continue` mit
      `GIT_EDITOR=true` (sonst blockiert der Editor bei der Commit-Message).

      Den Exit-Code **nicht** als Urteil nehmen — `git rebase --continue` wurde mit rc=0 **und**
      `error: update_ref failed` beobachtet. Stattdessen beide positiven Signale prüfen:

      1. das Rebase-Zustandsverzeichnis existiert nicht mehr, **und**
      2. `git rev-parse <branch>` == `git rev-parse HEAD`.

      Greifen beide: den Worktree **nicht** als Befund zählen (er ist abgeräumt), eine Zeile
      ausgeben, die den Abschluss benennt. Greift eines nicht: als Befund zählen und die
      stderr-Ausgabe von `--continue` mitgeben — der Lauf endet dann ungleich 0.

      `$branch` ist an dieser Stelle bereits aufgelöst (Zeile 92–99 liest bei detached HEAD
      `rebase-merge/head-name`) und trägt die Form `refs/heads/<name>`; für `rev-parse` ist das
      direkt verwendbar.

- [ ] **Task 4 — Meldeverhalten unverändert lassen, wo nicht abgeschlossen wurde.**
      Ohne `--finish` und außerhalb der Schnittmenge bleibt die bestehende Ausgabezeile
      (`worktree=… branch=… operation=…`) und die Zählung in `found_count` wie sie ist. Die
      Zusage „Der Guard repariert nichts" gilt für den Default weiter und ist durch
      `tests/spec/agent-skills/worktree-mid-rebase-guard.bats` abgesichert — dieser Test darf
      nicht brechen.

- [ ] **Task 5 — Runbook-Hinweis in `repo-hygiene-ops.md` §1.**
      Der Abschnitt nennt den Guard heute mit dem Zusatz, dass er nichts repariert. Ergänzen, dass
      `--finish` den maschinell sicheren Fall abräumt und was er dabei verifiziert — sonst
      existiert die Fähigkeit, ohne dass der Hygiene-Lauf sie kennt.

- [ ] **Task 6 — Regressionstests grün.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/worktree-git-op-finish.bats
# alle 6 Tests grün
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/worktree-mid-rebase-guard.bats
# unverändert grün — insbesondere "Der Guard repariert nicht"
```

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
