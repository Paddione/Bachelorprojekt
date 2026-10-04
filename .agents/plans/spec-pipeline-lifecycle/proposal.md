# Proposal: Spec-Pipeline Lifecycle — Receipt + Delete (T900998-Nachfolger T900999)

WARUM: Ausgefuehrte Plaene bleiben als .md-Ordner im Repo liegen
(84 Ordner auf origin/main) — niemand ordnet sie nach Completion ein.
Archivierung in `tickets.ticket_plans` existiert (finalize Schritt 7),
die Loeschung aus dem Repo fehlt.

WAS: Nach Merge schreibt finalize ein Receipt (Frontmatter +
Check-Evidenz + Merge-SHA) in die DB, danach wird der Plan-Ordner per
`git rm` ueber einen Sammel-Cleanup-PR entfernt. Fail-closed: kein
Delete ohne verifizierten Record. Staged (>N Tage inaktiv) und
supersedete Plaene fallen unter dieselbe Regel.

Design-Spec: `docs/superpowers/specs/2026-10-04-spec-pipeline-lifecycle-design.md`
(Branch `docs/spec-pipeline-lifecycle-T900999`, Review freigegeben).
Ticket: T900999 (feat, User-Richtung: Lifecycle Receipt + Delete zuerst;
Worker-Track und Maschinen-Format als separate Tickets danach).
