# Design Spec — AI-Agent Operating Guide & Guardrails: Foundation + Hub-Enrichment (F+B)

**Date:** 2026-05-31
**Branch:** `feature/agent-guide-foundation`
**Status:** approved design (brainstorming complete), spec for review
**Program:** "AI-Agent Operating Guide & Guardrails" — this is sub-project **F+B**, the first of six.

---

## 1. Problem & Motivation

An **inexperienced solo operator** needs to drive the AI agents in this repo to move the project
forward, without breaking production. Today there is no beginner-facing map of *"I want to do X →
which agent/skill do I use → what do I literally type → what could go wrong."* The knowledge is
scattered across `CLAUDE.md` (developer-only), 14 `SKILL.md` files, and tribal gotchas. The
admin **platform hub** (`/admin/platform`) lists the platform's components but their descriptions
are cryptic English placeholders ("SSO / OIDC identity provider"), useless to a beginner.

This program closes that gap across three surfaces (docs site, in-app help, repo maps) plus an
enforcement layer. **F+B is the foundation**: it produces the single source of truth (SSOT) that
every other surface renders from, and ships the first visible output — German descriptions in the
hub.

## 2. Audience persona

One inexperienced solo operator, working *inside* the repo (Claude Code), who knows *what* they
want ("change the website text", "fix this bug") but not *how* the tooling works. German-speaking.
Needs guardrails so they "can't do anything wrong."

## 3. Goals / Non-goals

**Goals (this sub-project):**
1. A single source of truth for the beginner-relevant knowledge: a **goal catalog**, a **tool
   catalog** (beginner-spine skills + 6 agents), and a **component catalog**.
2. A **4-tier danger taxonomy** and a **named guardrail catalog**, both reusable and machine-readable
   (they become the contract the enforcement layer consumes).
3. **Hub-enrichment**: proper easy-German descriptions for all platform `software_assets` and
   `hardware_assets`, applied reproducibly and automatically, respecting admin edits.

**Non-goals (explicitly deferred to downstream sub-projects):**
- Docs-site guide pages (S1), in-app help integration (S2), repo-map surface (S3), enforcement
  hooks/scripts (E). F+B only produces the data + taxonomy those consume.
- Any narrative/teaching prose. F+B is the structured core; teaching prose is hand-authored in S1.
- A public-facing component hub. The hub stays admin-only for now.
- Migrating or deprecating the legacy `bachelorprojekt.components` table (recommended later, not here).

## 4. Architecture — Hybrid SSOT

Single-source the **structured facts + danger/guardrail metadata**; hand-author narrative later (S1).

```
docs/agent-guide/
  registry/
    goals.yaml          # Lens 1 — "Ich will …" intents → flows
    tools.yaml          # Lens 2 — beginner-spine skills + 6 agents
    components.yaml      # Lens 3 — platform components (feeds the hub DB)
    taxonomy.yaml        # 4-tier danger taxonomy (definitions)
    guardrails.yaml      # named guardrail catalog
  schema/
    *.schema.json        # JSON Schema for each registry (CI-validatable)
  README.md              # how the registry is structured + how it's consumed
```

Consumers (downstream):
- **Hub DB** ← `components.yaml` (via generator → runtime ensure; see §8).
- **Enforcement layer (E)** ← `taxonomy.yaml` + `guardrails.yaml` (`enforced_by` ids).
- **Docs / in-app / repo surfaces (S1–S3)** ← all registries, rendered + hand-authored prose on top.

**Why YAML in `docs/`:** human-reviewable in PRs, language-neutral to tooling, no DB round-trip to
edit, and `build-docs.mjs` already auto-discovers repo sources so S1 can pick it up. JSON Schema
gives us cheap CI validation (the project has no yamllint/kubeconform, so we add a focused check).

## 5. Information architecture — goal-first, 3 lenses

**Lens 1 — Ziele ("Ich will …")** *(primary entry)*: curated catalog of real operator intents, each
mapped to the recommended flow, the literal example prompt, danger tier, and guardrails. Seed set:

| Ich will… | Weg | Tier |
|---|---|---|
| …den Website-Text/die Preise ändern | Admin-UI (kein Agent nötig) | 🟢 Sicher |
| …sehen, warum ein Dienst nicht läuft | `ops`-Agent (nur Logs/Status lesen) | 🟢 Sicher |
| …einen Bug beheben | `dev-flow-plan` → `dev-flow-execute` | 🟡 Vorsicht |
| …ein neues Feature bauen | `dev-flow-plan` → Review → `dev-flow-execute` | 🟡 Vorsicht |
| …eine bestehende Änderung ausrollen (deploy) | `infra`-Agent, **ENV= explizit** | 🟠 Nur mit Hilfe |
| …die Datenbank ändern/migrieren | `db`-Agent / `database-ops` | 🟠 Nur mit Hilfe |
| …ein Passwort/Secret ändern | `secret-rotation` | 🔴 Niemals allein |
| …den Cluster neu aufsetzen | `cluster-deployment` | 🔴 Niemals allein |

(Final list curated during implementation; the schema is the contract, not the exact rows.)

**Lens 2 — Werkzeuge**: reference cards for the beginner-spine skills (`dev-flow-plan`,
`dev-flow-execute`, `dev-flow-iterate`, `dev-flow-e2e`, plus the task-oracle) and the 6 routing
agents (`website`, `ops`, `infra`, `test`, `db`, `security`). Dangerous runbook skills
(`cluster-deployment`, `secret-rotation`, `fleet-ops`, `host-node-networking`) appear as
🟠/🔴 "stop & get help" cards, not full how-tos (those belong to a later, expert-facing scope).

**Lens 3 — Bausteine**: the platform components = the enriched hub.

## 6. Registry schemas

All `*_de` fields are German. Ids are kebab-case and stable (used as cross-references).

**goal** (`goals.yaml`):
`id`, `title_de` ("Ich will …"), `when_de`, `flow[]` (ordered steps; each references a tool `id`),
`example_prompt_de` (verbatim text to give the agent), `danger` (taxonomy id), `guardrails[]`
(guardrail ids), `related[]` (ids).

**tool** (`tools.yaml`):
`id`, `name_de`, `kind` (`skill` | `agent` | `task`), `summary_de` (one line), `what_for_de`,
`how_to_start_de` (what the operator types / how it's invoked), `what_could_go_wrong_de`, `danger`,
`guardrails[]`, `related[]`, `links[]`.

**component** (`components.yaml`):
`slug` (MUST equal `platform.software_assets.slug` / `hardware_assets.slug`), `kind`
(`software` | `hardware`), `name`, `emoji`, `summary_de` (short — written into the DB `description`
column, ≤140 chars to fit the card), `what_for_de` (longer, for the guide surfaces), `sensitivity`
(taxonomy id — e.g. Keycloak/secrets = high), `url`, `links[]`.

**taxonomy** (`taxonomy.yaml`): the 4 tiers (see §7), each `id`, `label_de`, `emoji`,
`meaning_de`, `doc_treatment` (how docs label it), `enforcement_default` (hint for E).

**guardrail** (`guardrails.yaml`): `id`, `name_de`, `rule_de`, `why_de`, `enforced_by`
(future hook id, or `docs-only`).

## 7. Danger taxonomy (4 tiers)

| id | Label | Bedeutung | Enforcement default (E) |
|----|-------|-----------|--------------------------|
| `safe` | 🟢 Sicher | Selbst machen, keine Gefahr. | none |
| `caution` | 🟡 Vorsicht | Checkliste abarbeiten, Agent bestätigt vor Aktion. | pre-flight confirm |
| `assisted` | 🟠 Nur mit Hilfe | Mit erfahrener Person / Doppel-Bestätigung. | double-confirm |
| `forbidden` | 🔴 Niemals allein | Von Enforcement blockiert, braucht Patrick. | hard block |

The same enum tags docs labels **and** future hook severities — `taxonomy.yaml` is the contract.

## 8. Hub-enrichment (B) — mechanism (REVISED from approved design)

**Discovery (verified 2026-05-31):** `platform.software_assets` / `hardware_assets` DDL lives only
in `website/src/db/migrations/2026052{1,2}_*.sql`. **No migration runner applies that directory** —
the shared-db ConfigMap init only runs `ensure-meetings/bachelorprojekt/knowledge-schema.sh`, and
`platform-db.ts` queries the tables without creating them. A new seed file there would never run.
Meanwhile `website-db.ts` has the canonical runtime pattern `ensureSchemaOnce(key, init)` doing
idempotent `CREATE TABLE IF NOT EXISTS`, used by ~20 website tables; `platform-db.ts` is the outlier
that skips it. `shared-db` is **per-brand** (`shared-db.${WORKSPACE_NAMESPACE}` → `workspace` vs
`workspace-korczewski`), so the `website` DB exists once per brand.

**Decision:** bring the platform tables into the existing runtime-ensure pattern instead of a dead
seed file. Concretely:

1. **`components.yaml`** is the SSOT for German descriptions (`summary_de` per slug).
2. A tiny generator `scripts/gen-platform-descriptions.mjs` emits
   `website/src/lib/platform-descriptions.generated.json` (`{ slug: summary_de }`) from
   `components.yaml`. (Keeps SSOT in YAML; avoids drift with the guide surfaces.)
3. `platform-db.ts` gains `ensurePlatformSchema()` (using `ensureSchemaOnce`) that:
   - `CREATE SCHEMA/TABLE IF NOT EXISTS` for `software_assets` + `hardware_assets` (DDL copied from
     the migration, so the table is reproducible even on a fresh DB — closes the wiring gap),
   - seeds missing rows `INSERT … ON CONFLICT (slug) DO NOTHING`,
   - sets German descriptions **only where safe**: `UPDATE … SET description = :de WHERE slug = :slug
     AND (description IS NULL OR description = :known_english_placeholder)` — never clobbers an admin
     edit.
   - `listSoftwareAssets()` / `listHardwareAssets()` call `ensurePlatformSchema()` first.

**Properties:** runs automatically on website startup; per-brand (each pod seeds its own DB);
idempotent; respects admin edits; SSOT stays in git. This expands B slightly beyond "a SQL file"
because the SQL-file path is non-functional — same outcome, correct mechanism.

**Alternative considered & rejected:** edit the migration `INSERT`s to German + document a manual
`psql` apply. Rejected — not automatic, not beginner-safe, and leaves the wiring gap unfixed.

## 9. Verification

- **Schema validation:** each registry validates against its JSON Schema; add a focused check
  (`task`/script) runnable locally and in CI (the repo currently has no yaml linting).
- **Cross-reference integrity:** every `flow[]`/`guardrails[]`/`related[]`/`danger` id resolves;
  every `components.yaml` slug exists in the seeded asset set (and vice-versa). A small validator
  enforces this.
- **Hub-enrichment:** unit-level — `ensurePlatformSchema()` is idempotent (run twice, no change) and
  the guarded `UPDATE` does not overwrite a non-placeholder description. Manual — the SoftwareTab
  card renders the German `summary_de`.
- **Content review:** Patrick reviews `components.yaml` German for accuracy + tone before merge.

## 10. Risks & open items

- **Scope creep into infra:** `ensurePlatformSchema()` takes over platform DDL ownership in code.
  Mitigation: DDL is a verbatim copy of the existing migration; `IF NOT EXISTS` makes it a no-op on
  prod where the table already exists. The dead migration files can be marked superseded (note in
  their header) but are left in place this round.
- **Placeholder-match fragility:** the guarded UPDATE keys off the *known* English placeholder
  strings. We snapshot the current English values into the generator so the match set is explicit;
  if a value was already hand-edited, we (correctly) skip it.
- **`build-docs.mjs` coupling:** S1 will consume the registry; F+B only guarantees the registry +
  schema exist and validate. No `build-docs.mjs` changes in F+B.

## 11. Downstream (what F+B unblocks)

- **S1 docs-site:** renders goals/tools/components as German pages + hand-authored decision map.
- **S2 in-app help:** maps `helpContent.ts` sections to registry ids.
- **S3 repo maps:** CLAUDE.md-adjacent Markdown generated/curated from the registry.
- **E enforcement:** PreToolUse hooks keyed to `taxonomy.yaml` + `guardrails.yaml` `enforced_by`.

## 12. Deliverables checklist (for the plan)

1. `docs/agent-guide/registry/{goals,tools,components,taxonomy,guardrails}.yaml`
2. `docs/agent-guide/schema/*.schema.json` + a validation script/task (+ CI wire-up)
3. `docs/agent-guide/README.md`
4. `scripts/gen-platform-descriptions.mjs` → `website/src/lib/platform-descriptions.generated.json`
5. `platform-db.ts`: `ensurePlatformSchema()` + call sites; guarded German seed
6. Tests: registry validation + `ensurePlatformSchema` idempotency/guard
7. Content: curated German for the beginner-spine tools, the goal catalog, and all components
