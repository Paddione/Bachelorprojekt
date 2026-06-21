# Proposal: projekttickets-cockpit

## Why

Ein `project`/`feature`-Container (Engineering-Welt) erscheint heute nur als Sidebar-Zeile mit Rollup-Zahl im Cockpit. Es gibt keine aggregierte Vollansicht eines einzelnen Containers: Rollup-Breakdown, Plan (`ticket_plans.content` wird nirgends gerendert), DoR/Lastenheft und die angereicherte Kind-Liste sind über drei Ansichten + drei APIs verstreut. Die generische `/admin/tickets/[id]`-Seite ist leaf-/coaching-zentriert und ihre Status-Maps sind veraltet (es fehlen `planning`, `plan_staged`, `qa_review`, `awaiting_deploy`).

## What

Die bestehende Route `/admin/tickets/[id].astro` wird zur Container-Vollansicht ausgebaut — die neuen Sektionen (Rollup-Header, Plan-Panel, DoR-Panel, gruppierte Kind-Liste) erscheinen conditional nur bei `type ∈ {project, feature}`. Vier fokussierte Komponenten unter `website/src/components/admin/` rendern diese Sektionen; ein neues reines pg-Modul `website/src/lib/tickets/container-detail.ts` liefert die Daten (`getContainerRollup` über `v_cockpit_rollup`, `getTicketPlan` mit strikt gefiltertem `content`, `getContainerDor`). Die veralteten Status-Maps in `[id].astro` werden durch die `cockpit-labels.ts`-SSOT ersetzt. Zusätzlich erhält der Sidekick einen Admin-only Eintrag „Projekttickets" (href auf `/admin/cockpit`) mit Count-Badge aus einem neuen `/api/admin/cockpit/container-count`-Endpoint. `admin.ts` (S1-Budget 0) und `cockpit-db.ts` bleiben unverändert.

_Ticket: T000950_
