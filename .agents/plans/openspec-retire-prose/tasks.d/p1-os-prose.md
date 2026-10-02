# p1 — OpenSpec-Prosa entfernen (1/7)

Ticket: T900724. Kontext: `design.md`. 64 Dateien.

## Regeln

Nur Prosa und Kommentare, kein Verhalten ändern.

Für jede Datei der Liste jede Erwähnung von OpenSpec entfernen (`openspec/…`-Pfade, `openspec`-Wort,
`openspec-*`-Skills, `/opsx:*`, „SSOT-Delta“/„Spec-Delta“ mit OpenSpec-Pfad):

1. Zeile ist nur ein Verweis (z. B. `# SSOT-Delta: openspec/changes/x/…`, `# Spec: openspec/specs/x.md`) → Zeile löschen.
2. Satz besteht nur aus dem Verweis → Satz löschen.
3. Satz hat weiteren Inhalt → nur den OpenSpec-Teil streichen, Rest grammatisch lassen.
4. Keinen neuen Verweis erfinden, nichts umformulieren, was nicht OpenSpec betrifft.
5. In `.bats`-Dateien nur Kommentarzeilen und `@test`-Titel ändern. Ändert sich ein `@test`-Titel,
   bleibt die Ticket-ID am Anfang erhalten.

Nach jeder Datei: `grep -in openspec <datei>` ist leer.

## Dateien

- `.agents/docs/README.md`
- `.claude/lib/README.md`
- `.claude/lib/behaviors/inject-plan-context.md`
- `.claude/lib/goals.md`
- `.githooks/post-commit`
- `.gitlab-ci-images/ci-node22.Dockerfile`
- `.gitlab-ci.yml`
- `.lavish/kit/adapter.js`
- `.lavish/kit/canvas-store.js`
- `.lavish/kit/daemon/routes/epics.ts`
- `.opencode/plugins/opencode-review-src/.claude/commands/opsx/apply.md`
- `.opencode/plugins/opencode-review-src/.claude/commands/opsx/archive.md`
- `.opencode/plugins/opencode-review-src/.claude/commands/opsx/explore.md`
- `.opencode/plugins/opencode-review-src/.claude/commands/opsx/propose.md`
- `.opencode/plugins/opencode-review-src/.claude/skills/openspec-apply-change/SKILL.md`
- `.opencode/plugins/opencode-review-src/.claude/skills/openspec-archive-change/SKILL.md`
- `.opencode/plugins/opencode-review-src/.claude/skills/openspec-explore/SKILL.md`
- `.opencode/plugins/opencode-review-src/.claude/skills/openspec-propose/SKILL.md`
- `.opencode/plugins/opencode-review-src/.opencode/commands/opsx-apply.md`
- `.opencode/plugins/opencode-review-src/.opencode/commands/opsx-archive.md`
- `.opencode/plugins/opencode-review-src/.opencode/commands/opsx-explore.md`
- `.opencode/plugins/opencode-review-src/.opencode/commands/opsx-propose.md`
- `.opencode/plugins/opencode-review-src/.opencode/skills/openspec-apply-change/SKILL.md`
- `.opencode/plugins/opencode-review-src/.opencode/skills/openspec-archive-change/SKILL.md`
- `.opencode/plugins/opencode-review-src/.opencode/skills/openspec-explore/SKILL.md`
- `.opencode/plugins/opencode-review-src/.opencode/skills/openspec-propose/SKILL.md`
- `.opencode/prompts/glimmer-primary.md`
- `.opencode/prompts/orchestrator.md`
- `AGENTS.md`
- `CLAUDE.md`
- `GEMINI.md`
- `QWEN.md`
- `README.md`
- `Taskfile.yml`
- `components/brett/src/server/migrations/005_board_templates_full_staging.sql`
- `components/website/CLAUDE.md`
- `components/website/WEBSITE-STANDARDS.md`
- `components/website/src/db/migrate.ts`
- `components/website/src/lib/__tests__/setup.ts`
- `components/website/src/lib/sdlc/__tests__/leitstand-kpi.test.ts`
- `components/website/src/lib/website-db-projects.test.ts`
- `components/website/src/styles/sdlc-leitstand.css`
- `design/leitstand-ds/_tokens.css`
- `design/leitstand-ds/cards/kpi-tile.html`
- `design/leitstand-ds/cards/signal-set.html`
- `design/leitstand-ds/cards/station-card.html`
- `design/leitstand-ds/cards/statusband-preview.html`
- `design/leitstand-ds/cards/ticket-chip.html`
- `design/leitstand-ds/cards/tokens-overview.html`
- `dev-local/components/llm-services/kustomization.yaml`
- `docs/README.md`
- `docs/agent-guide/maps/agents-map.md`
- `docs/agent-guide/maps/networks-map.md`
- `docs/agent-guide/maps/toolset-map.md`
- `docs/agent-guide/visual-accessibility.md`
- `docs/brain/k3-code-graph.md`
- `docs/brain/k5-openspec.md`
- `docs/brain/k6-ticket-factory.md`
- `docs/code-quality/gates.yaml`
- `docs/db-audit/2026-07-09-index-and-nplus1-audit.md`
- `docs/diagrams/brain-architektur-gesamtbild.md`
- `docs/diagrams/k1-vector-db.md`
- `docs/finetune/tandem-model-evaluation.md`
- `docs/health-goals-history.md`

## Abschluss

```bash
bats tests/spec/os-retirement-prose.bats
```

Der Test wird erst grün, wenn alle Partials fertig sind. Für diesen Partial reicht, dass keine Datei dieser Liste mehr gemeldet wird.
