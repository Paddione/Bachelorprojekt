# Feature-Pfad-Guards — dev-flow-plan (Detail)

Vollständige Guard-Liste des Feature-Pfads. Den Pre-Commit-Guard (`plan-preflight.sh pre-commit`)
beschreibt der SKILL.md in Schritt 5; alles Weitere steht hier.

- **Kollisions-Check vor der Worktree-Anlage** (T002444): `bash scripts/agent-collision.sh check --branch "$BRANCH"` —
  meldet von anderen Sessions belegte Branches/Worktrees, bevor `scripts/worktree-create.sh` läuft.
- **Brainstorming ist nicht optional** — in keinem der beiden Pfade. Es entscheidet, was überhaupt
  gebaut wird; ein Plan ohne vorherige Klärung plant die falsche Sache sorgfältig.
- **Branch-Konvention:** Branch `feature/<slug>` bzw. `fix/<slug>` und Plan `.agents/plans/<slug>/` tragen
  denselben Slug — `dev-flow-execute` und `plan-runner.mjs --branch` leiten den Plan-Pfad daraus ab.
- **Disjunkte Partials (D1):** Keine Datei darf in zwei Partials liegen — `scripts/plan-lint.sh`
  erzwingt das. Das letzte Partial ist **immer** die Tests-Rolle und trägt den
  STRUCT2-Failing-Test-Step. Obergrenze 9.
- **Plan-Mutation:** Ein gestagter Plan wird nicht still geändert — Änderungen gehen als eigener
  Commit und Push auf denselben Branch.
- **Qualitäts-Gate vor Design-Assets:** Jedes synchronisierte SVG vor dem Ablegen prüfen —
  `currentColor` statt `<img>`-Einbettung, keine Stray-Hex-Werte, kein Root-`width/height`,
  Export-Vollständigkeit. Unpassende Assets werden **verworfen**, nicht mitkopiert (T000756).
