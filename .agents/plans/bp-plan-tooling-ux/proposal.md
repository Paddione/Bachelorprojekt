# Proposal: bp-plan-tooling-ux

## Symptom (beobachtet, mit Beleg)

Drei wahrgenommene Reibungen an `plan-lint.sh` und
`devflow-post-merge-finalize.sh`, jeweils mit Reproducer im Worktree
`fix/bp-plan-tooling-ux` belegt:

1. `plan-lint.sh --json` meldet STRUCT2- und Partial-Budget-Verstoesse ohne
   Dateibezug und ohne Regeltext. Reproducer:
   `bash scripts/plan-lint.sh --json /tmp/struct2-repro.md` liefert
   `STRUCT2: no task contains a failing-test step (run a test + expect FAIL)` —
   weder die gepruefte Datei noch die ausgeschlossene Final-Verify-Regel
   (`does NOT count`) stehen in der Meldung.
2. Im Partial-Modus zeigt STRUCT2 auf die falsche Datei, sobald die letzte
   Manifest-Zeile nicht die Tests-Rolle traegt. Reproducer `/tmp/pmanifest`:
   zwei harte FAILs, der zweite nennt `tasks.d/p2-wrong.md` nicht, obwohl genau
   diese Datei geprueft wurde.
3. `devflow-post-merge-finalize.sh` Schritt 7 behandelt `status: draft` wie
   `completed` (`_plan_frontmatter_state` antwortet `completed`, Aufruf direkt
   gegen `scripts/lib/finalize-frontmatter.sh` belegt) — der Plan wird als
   `bereits completed` uebersprungen und nie markiert. Ein im Worktree nicht
   aufloesbarer Plan erzeugt nur `[warn]`, Exit bleibt 0.
4. `plan_stage` (devflow-mcp) nimmt kein Ziel-Repo entgegen: `server.mjs`
   verdrahtet `plan_stage: (args) => planStage(REPO, args)` und ignoriert ein
   `repo`-Argument, waehrend `context_for_task`, `search_code` und
   `graph_status` es per `resolveRepo` akzeptieren.

## Vermutete Ursache (Hypothese, vor Fix zu bestaetigen)

- STRUCT2-Fehlermeldungen wurden formuliert, als nur der Single-Modus
  existierte (`STRUCT2_FILE`-Umschaltung ohne Meldungsanpassung).
- `_plan_frontmatter_state` unterscheidet nur aktiv vs. alles andere; `draft`
  faellt in `completed`.
- Schritt-7-Warnpfad stammt aus der idempotenten Auslegung (Skip statt Fehler).
- `plan_stage`-Schema wurde bei der Multi-Repo-Erweiterung (Repo-Aliase,
  `resolveRepo`) nicht mitgezogen.

## Scope

Betroffene Dateien: `scripts/plan-lint.sh`,
`scripts/devflow-post-merge-finalize.sh`,
`scripts/lib/finalize-frontmatter.sh`,
`tests/py/spec/test_bp_plan_tooling_ux.py` (neu),
`tests/py/spec/native_ported/spec/devflow-mcp/test_plan_stage.py`,
`~/mcp-servers/devflow/server.mjs`, `~/mcp-servers/devflow/lib/plan-stage.mjs`.
Keine Aenderungen an Dotfiles oder `agent-workspace.py`.
