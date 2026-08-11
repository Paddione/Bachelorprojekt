# p7 — Archiv-Commit ohne SKIP_MAIN_COMMIT_GUARD dokumentieren (T003287)

## Ziel

Der Archiv-Workflow (merge → archive → commit → push) ist auf main ausgelegt,
aber der pre-commit-Hook blockiert main-Commits. Der Bypass per
SKIP_MAIN_COMMIT_GUARD=1 umgeht den Schutz.

## Steps

1. **Analyse.** Archiv-Workflow in `docs/agent-guide/openspec-workflow.md` und
   `docs/agent-guide/README.md` prüfen: wie läuft der Archiv-Commit, warum auf main?

2. **GREEN.** Runbook-Option dokumentieren, die ohne Env-Bypass auskommt —
   z.B. Chore-Branch `chore/archive-<slug>` + PR, oder die allowlistete
   `chore(plans):`-Commit-Konvention auf main (prüfen, was der Main-Commit-Guard
   tatsächlich blockiert und welche Ausnahme allowlistet ist).

3. **Verifikation.** Der dokumentierte Weg funktioniert ohne SKIP_MAIN_COMMIT_GUARD=1;
   der Guard bleibt für reguläre main-Commits aktiv.

## Acceptance

- Doku beschreibt einen Archiv-Weg ohne Env-Bypass.
- Main-Commit-Guard bleibt aktiv für reguläre Commits.
