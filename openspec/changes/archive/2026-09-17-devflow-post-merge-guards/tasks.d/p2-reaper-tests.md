# p2 — Reaper-KEEP-Tests für ungemergte Commits (T900096)

- id: p2 · depends_on: [p1]
- target_file (D1, NUR): `tests/spec/ci-cd/branch-reaper-unmerged-keep.bats` (NEU)
- SSOT: `openspec/specs/agent-skills.md` · Ticket: T900096
- KEINE Implementation in diesem Partial.

## T1 — RED: neue BATS-Datei anlegen (Guard-Nachweis ohne Guard)

- Datei anlegen mit Header (SSOT `openspec/specs/agent-skills.md` + Ticket
  T900096, Requirement „Reaper keeps branches with commits outside main").
- Prüfmodus COMMAND OUTPUT VERIFICATION, keine Source-Greps: nur Exit-Code
  plus REAP-/KEEP-Zeilen der Reaper-Ausgabe (ERGEBNIS-Orientierung).
- Sandbox-Muster aus `branch-reaper.bats` / `branch-reaper-sweep.bats`
  übernehmen: `git init --bare` Remote + Clone-Fixture, ABSOLUTE Pfade,
  alle git-Aufrufe mit `-C`, `gh`-Stub ohne offene PRs (`echo '[]'`),
  `ticket.sh`-Stub mit `done` für alle genutzten IDs.
- Szenarien (nur belegte Flags `--dry-run --ticket T###### --repo <pfad>`):
  (a) Positiv-Anker, steht vorn (T002356-M1): voll in Remote-`main`
      gemergter Branch (Branch nach `main` mergen + `main` pushen) mit
      reiner Allowlist-Abweichung → genau eine `REAP`-Zeile (Altverhalten).
  (b) Branch mit Commits außerhalb `main` (Tip kein Ancestor von
      Remote-`main`), Blob-Diff voll allowlisted → KEINE `REAP`-Zeile,
      stattdessen `KEEP`-Zeile mit Unmerged-Begründung (T900096-Kontext).
  (c) Kombination in einem Lauf: gemergter Allowlist-Branch → `REAP`,
      ungemergter Allowlist-Branch → `KEEP` (Allowlist allein schützt
      nicht vor Löschen, ungemergte Commits schon).
- RED-Nachweis gegen Stand OHNE Guard (Repo-Root des Worktrees):

```bash
git stash push scripts/branch-reaper.sh
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/branch-reaper-unmerged-keep.bats
# expected: FAIL (red — ohne Guard reapt der alte Stand auch (b)/(c); nur der Anker (a) bleibt grün)
git stash pop
```

- Akzeptanz: Datei existiert, 3 Tests, RED-Lauf FAIL bei (b)/(c), (a) grün.

## T2 — GREEN: gleicher Lauf mit Guard

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/branch-reaper-unmerged-keep.bats
```

- Akzeptanz: alle 3 Tests grün am Worktree-Stand (mit Guard aus p1-Kontext).

## T3 — Nachbarn bleiben grün

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/branch-reaper*.bats
```

- Akzeptanz: Exit 0 — alle `branch-reaper*.bats` (inkl. neuer Datei)
  ohne Regression.
