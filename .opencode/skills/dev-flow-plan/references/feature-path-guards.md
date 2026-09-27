# Feature-Pfad-Guards — dev-flow-plan (Detail)

Vollständige Guard-Liste des Feature-Pfads. Der SKILL.md nennt den Preflight
(Check merged ticket) inline; alles Weitere steht hier.

- **Preflight: Check merged ticket** (T002279) — beide Pfade, vor der Worktree-Anlage:
  `bash scripts/agent-lock.sh check-merged "$TICKET_EXT_ID"` (`rc=1` = auf `main` schon gefixt →
  Ticket `done`, abbrechen). Exit-Codes: [dev-flow-plan-phases](.agents/skills/references/dev-flow-plan-phases.md) §Preflight.
- **Kollisions-Check vor der Worktree-Anlage** (T002444): `bash scripts/agent-collision.sh check --branch "$BRANCH"` —
  meldet von anderen Sessions belegte Branches/Worktrees, bevor `scripts/worktree-create.sh` läuft.
- **Brainstorming ist nicht optional** — in keinem der beiden Pfade. Es entscheidet, was überhaupt
  gebaut wird; ein Plan ohne vorherige Klärung plant die falsche Sache sorgfältig.
- **Ticket vor Branch** (T001917, T002050): Steht die `TICKET_EXT_ID` fest, trägt der Branch sie als
  Suffix (`feature/<slug>-T002050`). Existiert noch kein Ticket, wird es **vor** der Worktree-Anlage
  erstellt — sonst schlägt `preflight-pr-scope.sh` beim PR fehl (PR-Titel-Ticket-ID ≠ Branch-Name).
- **Disjunkte Partials (D1):** Keine Datei darf in zwei Partials liegen — `scripts/plan-lint.sh`
  erzwingt das. Das letzte Partial ist **immer** die Tests-Rolle und trägt den
  STRUCT2-Failing-Test-Step. Obergrenze 9.
- **Plan-Mutation:** Ein gestagter Plan wird nicht still geändert — Änderungen gehen als eigener
  Commit, danach `stage-plan` erneut.
- **Slot-Angabe:** `stage-plan --partials N` setzt `slot_count` = Anzahl der Partials im Manifest.
- **Qualitäts-Gate vor Design-Assets:** Jedes synchronisierte SVG vor dem Ablegen prüfen —
  `currentColor` statt `<img>`-Einbettung, keine Stray-Hex-Werte, kein Root-`width/height`,
  Export-Vollständigkeit. Unpassende Assets werden **verworfen**, nicht mitkopiert (T000756).
