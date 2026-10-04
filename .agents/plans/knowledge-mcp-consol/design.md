---
ticket_id: null
plan_ref: null
status: active
date: 2026-10-04
---

# Design: knowledge-MCP Consolidation (Schritt 2) — T900998

- Status: approved for spec-doc (2026-10-04)
- Ticket: T900998 (feat, mittel, areas agents)
- Epic: T900560 (in_progress)
- Struktur: Mono-Plan, Stream-Partials (disjunkte Files, max 9 Partials)

## 1. Ziel

Ein konsolidierter knowledge-MCP-Tool-Plan statt dreier paralleler
Workstreams: Toolset-Ebene (T900983, staged), devflow-mcp-Server
(T900985, staged) und K3-Embed-Store/Rerank (T900993, in_progress).
Der Plan führt die Ströme in einem Ticket und einem Branch zusammen.

## 2. Stream-Zuschnitt (vorläufig, Phase-A-Intel fixiert exakt)

- S1 toolset-Delta: `scripts/toolset/**`, `docs/agent-guide/registry/*`,
  Tool-Probes, tool_tiers, Drift-Check, Rendering je Rolle.
  Basis: staged Plan `.agents/plans/toolset-tool-level` (T900983).
- S2 devflow-mcp-Delta: `scripts/devflow-mcp/**`, referenzierende
  Skills/Docs (`mcp-tool-guide`, `dev-flow-plan`, `implementer-handoff`).
  Basis: staged Plan `.agents/plans/devflow-mcp` (T900985).
- S3 embed-Reste: `scripts/mcp/cbm-embed-*.py`, `cbm-graph-rerank.py`,
  Eval-Docs unter `docs/brain/` — nur was nach dem T900993-Merge
  noch offen ist. Basis: Worktree-Plan
  `.agents/plans/k3-embed-store-rerank/` (T900993).

Partials berühren einander nicht (Kollisions-Guard T002444);
Tests je Stream separat (`tests/spec/devflow-mcp/`,
`tests/spec/toolset-registry/`, `tests/spec/cbm-*`).

## 3. Supersede-Mechanik

- `.agents/plans/devflow-mcp` (T900985) und
  `.agents/plans/toolset-tool-level` (T900983) werden als superseded
  archiviert; beide Tickets werden auf den Konsolidierungs-Plan
  referenziert (kein File-Overlap mit neuen Partials).
- T900993 per Merge-first: 8 ungepushte Commits pushen, per PR nach
  `main` mergen, Ticket auf shipped setzen; nur offene Reste wandern
  in S3. Branch `feature/k3-symbol-embed-rerank-T900993` (14 Commits
  vor main, Worktree sonst sauber) wird danach eingezogen.

## 4. Sequenz

1. `main`-Sync (`pull --rebase`, tracked clean vorausgesetzt).
2. T900993 merge-first (Push, PR, Merge, Ticket shipped).
3. Phase A auf `main`: Proposal, `intel.json` via
   `scripts/plan-intel.sh`, Prior-Art (ADR-006 einziger Treffer;
   Guards vorhanden), Plan unter
   `.agents/plans/knowledge-mcp-consol/`, Frontmatter via
   `scripts/vda.sh frontmatter`.
4. Phase B: `scripts/worktree-create.sh` →
   `feature/knowledge-mcp-consol-T900998`, Lock claimen,
   Scaffold-Commit + Push.
5. Phase C: Stream-Partials schreiben → committen → stagen →
   enqueuen; danach plan-lint, Embedding, finaler Push.
   Ausstieg: Branch gepusht, Ticket `plan_staged`, kein PR
   (Übergabe an `dev-flow-execute`).

## 5. Guards / Eval

- `plan-lint.sh` hartes Gate pro Partial.
- BATS-Suiten je Stream müssen grün bleiben.
- Kollisions-Check: keine zwei Partials teilen eine Datei.
- CI-Gate vor Merge: `task test:changed` + `task freshness:check` +
  `task workspace:validate`. Keine direkten Pushes nach `main`.

## 6. Out of Scope

- Spec-Umbau als eigenes Ticket danach (Evidenz:
  `scripts/batch-workflow-gen.sh:72` schreibt
  `.agents/plans/${slug}/tasks.md`, `:88` hartes plan-lint-Gate).
- `ml/*` (9.6G fremde Trainings-Artefakte, ungetrackt) unangetastet.
- Keine Credential-/Secret-Berührung.

## 7. Entscheidungs-Log

- Schritt 2 zuerst, Spec-Umbau danach separat (User-Vorgabe).
- Neu planen via dev-flow-plan (statt staged T900985 exekutieren).
- Konsolidierung (statt Delta/Supersede/Spike).
- T900993 Scope-Migration (statt Dependency/Warten/Teilen).
- Migration per Merge-first (Pushback wegen 8 ungepushter Commits).
- Mono-Plan mit Stream-Partials (statt Epic/Sub-Tickets,
  Kaskade oder T900985-Branch-Reuse).

## 8. Offene Punkte für Phase A

- Exakte File-Grenzen S1/S2/S3 aus `intel.json` ableiten.
- Partial-Anzahl und -Namen (Obergrenze 9, Tests separat).
- Archivierungs-Form der supersedeten Pläne ( Commit- oder
  Ticket-Vermerk).
