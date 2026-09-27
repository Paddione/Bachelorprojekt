---
title: "langfuse-agent-tracing — Implementation Plan"
ticket_id: T900688
domains: [infra, agents, observability, test]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# langfuse-agent-tracing — Implementation Plan

Self-hosted Langfuse v4 auf devmesh plus Tracing aller Agent-Harnesses (Claude Code, OpenCode 2,
Pi, Codex) über die offiziellen Langfuse-Plugins. Secret-Masking zentral über einen OTel-Collector
vor dem OTLP-Ingest. Design und Entscheidungen D1–D7: `design.md`.

_Ticket: T900688_

## File Structure

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `dev-local/components/langfuse/kustomization.yaml` | 0 (neu) | n/a (S1-ungated) |
| `dev-local/components/langfuse/langfuse.yaml` | 0 (neu) | n/a (S1-ungated) |
| `dev-local/components/langfuse/clickhouse.yaml` | 0 (neu) | n/a (S1-ungated) |
| `dev-local/components/langfuse/valkey.yaml` | 0 (neu) | n/a (S1-ungated) |
| `dev-local/components/langfuse/minio.yaml` | 0 (neu) | n/a (S1-ungated) |
| `dev-local/components/langfuse/db-init.yaml` | 0 (neu) | n/a (S1-ungated) |
| `dev-local/components/langfuse/otel-redact.yaml` | 0 (neu) | n/a (S1-ungated) |
| `dev-local/core/kustomization.yaml` | 134 | n/a (S1-ungated) |
| `dev-local/core/ingress.yaml` | 40 | n/a (S1-ungated) |
| `environments/schema.yaml` | 1733 | n/a (S1-ungated) |
| `environments/sealed-secrets/dev.yaml` | 242 | n/a (S1-ungated) |
| `scripts/langfuse/client-env.sh` | 0 (neu) | n/a (neue Datei, Limit 800) |
| `scripts/langfuse/setup-harnesses.sh` | 0 (neu) | n/a (neue Datei, Limit 800) |
| `taskfiles/Taskfile.devmesh.yml` | 142 | n/a (S1-ungated) |
| `skills-lock.json` | 11 | n/a (S1-ungated) |
| `.opencode/skills/langfuse/` | 0 (neu, vendored) | n/a (S1-ungated) |
| `.claude/skills/langfuse` | 0 (neu, Symlink) | n/a (S1-ungated) |
| `docs/agent-guide/registry/skills.yaml` | existing | n/a (S1-ungated) |
| `docs/agent-guide/registry/vendor-lock.json` | existing | n/a (S1-ungated) |
| `.opencode/skills/OVERVIEW.md` | existing | n/a (S1-ungated) |
| `tests/spec/langfuse-agent-tracing.bats` | 0 (neu) | n/a (S1-ungated) |

Budgets geprüft mit `PLAN_LINT_SELFTEST=1 bash scripts/plan-lint.sh residual_budget <pfad>`
(leere Ausgabe = Extension nicht in `docs/code-quality/gates.yaml` → `s1.limits`). Die beiden neuen
`.sh`-Dateien bleiben deutlich unter dem Limit 800.

<!-- vitest: kein neuer Test nötig, weil keine Datei unter components/website/src geändert wird -->

## Partials

| id | file | role | target_files | depends_on | min_tier | ctx_tokens |
|----|------|------|--------------|------------|----------|------------|
| p1 | tasks.d/p1-manifests.md | impl | dev-local/components/langfuse/kustomization.yaml, dev-local/components/langfuse/langfuse.yaml, dev-local/components/langfuse/clickhouse.yaml, dev-local/components/langfuse/valkey.yaml, dev-local/components/langfuse/minio.yaml, dev-local/components/langfuse/db-init.yaml, dev-local/components/langfuse/otel-redact.yaml, dev-local/core/kustomization.yaml, dev-local/core/ingress.yaml | | 27b-local | 64000 |
| p2 | tasks.d/p2-secrets.md | impl | environments/schema.yaml, environments/sealed-secrets/dev.yaml | | 27b-local | 90000 |
| p3 | tasks.d/p3-harness-wiring.md | impl | scripts/langfuse/client-env.sh, scripts/langfuse/setup-harnesses.sh, taskfiles/Taskfile.devmesh.yml | p2 | 27b-local | 48000 |
| p4 | tasks.d/p4-skill.md | impl | skills-lock.json, .agents/skills/langfuse/ | | 4b-local | 16000 |
| p5 | tasks.d/p5-tests.md | tests | tests/spec/langfuse-agent-tracing.bats | p1, p2, p3, p4 | 27b-local | 40000 |

## Task: Rot-Grün-Anker

Der Failing-Test-Step liegt in p5 und läuft, bevor p1 bis p4 implementiert sind:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/langfuse-agent-tracing.bats
# expected: FAIL — dev-local/components/langfuse und scripts/langfuse/ existieren noch nicht
```

Erst wenn dieser Lauf rot ist, beginnt die Implementierung. Details in `tasks.d/p5-tests.md`.

## Task: Deploy und Live-Self-Audit

Nach dem Merge, gegen devmesh (Langfuse-Skill, `references/instrumentation.md` Schritt 3):

```bash
task devmesh:deploy
task devmesh:langfuse:setup
```

1. In jeder Harness (Claude Code, OpenCode, Pi, Codex) im Repo eine Session mit mindestens zwei
   Turns und einem Subagent-Aufruf fahren.
2. Traces abrufen: `LANGFUSE_HOST=https://langfuse.<DEVMESH_DOMAIN> npx langfuse-cli api traces list --limit 10`
   mit den Keys aus `~/.config/langfuse/agent-tracing.env`.
3. Gegen https://langfuse.com/docs/observability/best-practices (frisch abrufen) prüfen:
   Modellname, Token-Usage, sprechende Trace-Namen, `session_id`, Subagenten als `agent`-Observation
   verschachtelt, Secrets maskiert (Probe: Prompt mit `ghp_` + 36 Zeichen muss als
   `[REDACTED:github]` ankommen).
4. Lücken beheben, erneut laufen lassen, Trace-Links als Ticket-Kommentar an T900688.

## Task: Finale Verifikation

Nach Abschluss aller Partials:

```bash
task workspace:validate
task test:changed
task freshness:regenerate
task freshness:check
```
