# Design: Spec-Pipeline Lifecycle — Receipt + Delete (T900999)

- Status: approved for spec-doc (2026-10-04)
- Ticket: T900999 (feat, mittel, areas agents)
- Vorgaenger: T900998 (done/shipped, #6252), T900993 (done/shipped, #6247)
- Richtung: Lifecycle Receipt + Delete (User-Entscheid 2026-10-04)

## 1. Ausgangslage (User-Vorgabe, woertlich)

Statt .md-Files, die nach Completion niemand einordnet: ausgefuehrte Plaene
gehoeren in ein Format, das Low-Quant-Instruct-Modelle muehelos ausfuehren
koennen — ggf. mit dynamischem Context-Rerank je Edit-Schritt. Am Ende kein
Rest-File, dafuer eine andere Validierungsform. Zusaetzlich: aktuelle
AI-Faehigkeiten nutzen — taskabhaengige Web-Suche ausserhalb des Repos und
Unit/Integration/E2E-Tests mit echter Intelligenz hinter Headed-Agentic-Runs.

## 2. Scope-Entscheid

Schritt 1 ist der Lifecycle (dieses Doc). Worker-Track (Web-Search,
Headed-E2E-Intelligenz) und Maschinen-Ausfuehrbarkeit (Rerank-Format)
laufen als eigene Tracks danach — sie aendern andere Systeme
(Toolset/Worker statt Plan-Dateien).

## 3. Recon-Befunde

- `scripts/batch-workflow-gen.sh:72` schreibt `.agents/plans/${slug}/tasks.md`
  (+ Design-Doc), `:88` ruft `plan-lint.sh` als hartes Gate.
- `plan-lint.sh` validiert nur, schreibt nie.
- Keine ADR, keine Spec-Guards zum Generator; einziger aktiver Aufrufer:
  `.agents/plans/openspec-retire-code/tasks.md` (p2).
- `ticket.sh archive-plan` (:226-315) archiviert in `tickets.ticket_plans`
  (`completed`/`post-merge`); `devflow-post-merge-finalize.sh` Schritt 7
  (:280-291) ruft es auf.
- Plan-Ordner bleiben danach im Repo liegen (84 Ordner auf origin/main) —
  das ist der Ueberhang. Receipt-Konzept als Vorbild existiert nur bei
  cbm-freshness, nicht fuer Plaene.

## 4. Design

1. Nach Merge schreibt finalize Schritt 7 ein Receipt nach
   `tickets.ticket_plans` (Plan-Frontmatter + Check-Evidenz + Merge-SHA),
   danach wird der Plan-Ordner per `git rm` entfernt.
2. Loeschung via Sammel-Cleanup-PR (Reaper-Sweep) — kein Direkt-Push
   nach main.
3. Fail-closed: kein `rm` ohne verifizierten DB-Record (Record-Check
   vor Delete, Abbruch sonst).
4. Staged Plaene (>N Tage inaktiv, N in Phase A festlegen) und
   supersedete Plaene (bei Nachfolger-Merge) fallen unter dieselbe
   Receipt+Delete-Regel.
5. Guards: neuer BATS-Guard (kein Delete ohne Record), plan-lint
   bleibt unberuehrt, M10-Deliverable-Check beachten.

## 5. Out of Scope

- Worker-Track (Web-Search, Headed-E2E) — separates Ticket.
- Maschinen-Ausfuehrbarkeit/Rerank-Format — separates Ticket.
- Plan-Inhalte, knowledge-MCP-Systeme, `ml/` (fremd).
- docs-Branch-Cleanup (`docs/knowledge-mcp-design-T900998`) — separat.

## 6. Sequenz

1. Phase A auf main: Proposal + `intel.json` (`plan-intel.sh`),
   Prior-Art steht (keine ADR).
2. Phase B: Worktree + Branch `feature/spec-pipeline-lifecycle-T900999`.
3. Phase C: max 5 Partials (finalize-Receipt, Cleanup-Sweep,
   Guard-Tests, Staged/Superseded-Regel, Doku) mit plan-lint-Gate,
   stagen, pushen, Ticket `plan_staged`.

## 7. Offene Punkte fuer Phase A

- Receipt-Schema (Felder in `tickets.ticket_plans`, Evidenz-Format).
- N (Staged-Inaktivitaets-Frist) + Sweep-Rhythmus.
- Exakte File-Grenzen der Partials aus `intel.json`.
