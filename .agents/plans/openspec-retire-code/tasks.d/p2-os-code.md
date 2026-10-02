# p2 — OpenSpec aus Code, CI und Skills lösen (2/7)

Ticket: T900725. Kontext: `design.md`. 45 Dateien.

## Regeln

Verhalten ändert sich: OpenSpec wird als Mechanismus entfernt (ADR-010).
Pläne liegen bereits unter `.agents/plans/<slug>/`, das bleibt.

Pro Datei entscheiden und die erste passende Regel anwenden:

1. **Test prüft OpenSpec-Verhalten** (Validator, Archiv, Propose, Delta, `openspec/specs`-Inhalt,
   `openspec-status.json`) → den `@test`-Block löschen. Bleibt kein Test übrig → Datei löschen (`git rm`).
2. **Test nutzt `openspec/` nur als Beispiel-/Fixture-Pfad** → auf einen Pfad unter `.agents/plans/`
   oder eine Fixture unter `tests/fixtures/` umstellen, Testaussage beibehalten.
3. **Skript/Code liest oder schreibt `openspec/`** → diesen Zweig entfernen. Dient eine Funktion,
   ein Task oder ein Skript nur OpenSpec → komplett entfernen samt Aufrufern (Taskfile, CI, Hooks).
4. **CI-Workflow/Job/Step nur für OpenSpec** → löschen. Required-Check-Namen nicht umbenennen
   (das macht A3b), nur Schritte darin entfernen.
5. **Config-Eintrag** (renovate, commitlint-Scope, gitleaks-Allowlist, vitest-Include, package.json-Script) → Eintrag löschen.
6. **Kommentar/Prosa** → wie A1a: Verweis streichen.

Nach jeder Datei: `grep -in openspec <datei>` ist leer (oder Datei gelöscht). Für geänderte
`.bats`-Dateien `bats <datei>` ausführen. Für geänderte Skripte `bash -n` bzw. `shellcheck`.

## Dateien

- `components/website/src/components/admin/DorPanel.svelte`
- `components/website/src/components/admin/DorPanel.test.ts`
- `components/website/src/components/admin/OpenSpecProposalsPanel.svelte`
- `components/website/src/components/admin/__tests__/OpenSpecProposalsPanel.test.ts`
- `components/website/src/components/cockpit/DispatchLogPanel.svelte`
- `components/website/src/components/leitstand/decks/DeckWissen.svelte`
- `components/website/src/lib/knowledge-db.test.ts`
- `components/website/src/lib/knowledge-db.ts`
- `components/website/src/lib/sdlc/factory-floor.test.ts`
- `components/website/src/lib/sdlc/leitstand-purpose-registry.ts`
- `components/website/src/lib/sdlc/openspec/proposal.ts`
- `components/website/src/lib/sdlc/repo-root.ts`
- `components/website/src/lib/sdlc/tickets/cockpit-db.ts`
- `components/website/src/lib/tickets/cockpit-types.ts`
- `components/website/src/lib/tickets/final-grilling.ts`
- `components/website/src/pages/sdlc/api/cockpit/actions.test.ts`
- `components/website/src/pages/sdlc/api/openspec/save-proposal.test.ts`
- `components/website/src/pages/sdlc/api/openspec/save-proposal.ts`
- `components/website/src/pages/sdlc/api/openspec/search.test.ts`
- `components/website/src/pages/sdlc/api/openspec/search.ts`
- `components/website/src/pages/sdlc/tickets/[id].astro`
- `components/website/vitest.config.ts`
- `docs/finetune/tandem-candidates.json`
- `k3d/k1-embed-job.yaml`
- `renovate.json5`
- `scripts/agent-lock-reap.sh`
- `scripts/batch-workflow-gen.sh`
- `scripts/brain-verify-refs.sh`
- `scripts/branch-reaper.sh`
- `scripts/check-commit-vs-diff.sh`
- `scripts/devflow-post-merge-finalize.sh`
- `scripts/find-changed-tests.sh`
- `scripts/find-dead-selections.sh`
- `scripts/finetune/train.py`
- `scripts/fix-archive-plan-status.sh`
- `scripts/health-goals-check.sh`
- `scripts/hooks/worktree-write-guard.sh`
- `scripts/knowledge/ingest-markdown.mjs`
- `scripts/knowledge/lib-context-retrieve.mjs`
- `scripts/lib/archive-staged-scope.sh`
- `scripts/lib/finalize-frontmatter.sh`
- `scripts/lib/openspec-archive-args.sh`
- `scripts/lib/ticket-help.sh`
- `scripts/llm/agent-bench/bench.mjs`
- `scripts/llm/agent-bench/cases/f1-store-cleanup/case.json`

## Abschluss

```bash
bats tests/spec/os-retirement-code.bats
```

Der Test wird erst grün, wenn alle Partials fertig sind. Für diesen Partial reicht, dass keine Datei dieser Liste mehr gemeldet wird.
