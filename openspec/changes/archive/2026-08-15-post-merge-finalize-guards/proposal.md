# Proposal: post-merge-finalize-guards

## Why

PR #4539 (T006284) hat das Post-Merge-Finalize-Skript
`scripts/devflow-post-merge-finalize.sh` als idempotente Abschluss-Einheit
eingeführt. Das Review-Gate hat drei Lücken gefunden, die die zwei zentralen
Zusagen des Skripts untergraben: (1) Der `--pr`-Pfad schließt Tickets auch für
**offene** PRs — die Drift „Ticket=done bei PR=OPEN" (T001149-M1/T001092), die das
Skript gerade verhindern soll. (2) Ein zweiter Lauf im Fenster „Schritt 8 erledigt,
Archiv-PR noch offen" wiederholt die OpenSpec-Archivierung, wechselt dabei den
Branch des geteilten Arbeitsbaums und bricht FATAL ab, bevor der Cleanup läuft —
die Idempotenz-Zusage (Bereits-Erledigtes überspringen) gilt damit nicht für den
Archiv-Schritt. (3) Relative Pfadzugriffe machen das Skript vom Aufrufverzeichnis
abhängig — falsche cwd, falsches Verhalten.

## What

- **Merge-Status-Guard im `--pr`-Pfad:** Vor den Closure-Schritten (4–6) prüft das
  Skript den PR-State per `gh pr view "$PR_NUM" --json state -q .state`; nur
  `MERGED` führt zur Closure, sonst Skip (analog Auto-Pfad, fail-safe bei
  nicht erreichbarem `gh`).
- **Archiv-Idempotenz (Schritt 8):** Existiert der Archiv-Branch bereits auf
  origin (`git ls-remote --exit-code`), überspringt das Skript die
  Archiv-Sektion. Zusätzlich wird der Branch des Arbeitsbaums nach der
  Archiv-Sektion restauriert, statt auf dem Archiv-Branch stehen zu bleiben.
- **cwd-Unabhängigkeit:** `cd "$REPO_DIR"` zu Skriptbeginn und explizites
  `--repo "$REPO_DIR"` beim `branch-reaper.sh`-Aufruf.
- **Failing Tests** in `tests/spec/agent-skills/post-merge-finalize-guards.bats`
  (Source-Grep-Modus, dokumentierte T002448-M4-Ausnahme — der Laufzeitpfad
  braucht Cluster-/DB-Zugriff, der in CI fehlt).
- **Delta-Spec** `specs/agent-skills.md` (MODIFIED): die bestehende Requirement
  „Post-Merge-Finalisierung als idempotente Skript-Einheit" wird um die drei
  Schärfungen expliziert.

_Ticket: T006348_ (type=fix, severity=minor, areas: devflow, scripts)
