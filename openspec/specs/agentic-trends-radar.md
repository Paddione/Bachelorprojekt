# agentic-trends-radar

## Purpose

Workflow zur systematischen Erkennung und Bewertung aktueller Trends im
agentischen Software-Engineering. Das Workflow durchläuft 4 Phasen
(Sweep → Konsolidieren → Bewerten → Synthese), nutzt 5 parallele
Suchwinkel und produziert einen deutschen Radar-Report mit konkreten
Übernahme-Empfehlungen (adopt/trial/hold/skip) gegen den eigenen SDLC.

---

## Requirements

### Requirement: Four-Phase Workflow Structure

The system SHALL execute the trends-radar workflow in exactly 4 sequential phases:
1. **Sweep** — 5 parallel research agents with distinct search angles
2. **Konsolidieren** — dedup + ranking to max 10 distinct trends
3. **Bewerten** — SDLC-fit assessment per trend with verdict
4. **Synthese** — final radar report in Markdown

#### Scenario: All 4 phases are defined in workflow meta

- **GIVEN** the `agentic-trends-radar.js` workflow file
- **WHEN** reading the `meta.phases` array
- **THEN** it contains exactly 4 entries with titles Sweep, Konsolidieren, Bewerten, Synthese

### Requirement: Five Sweep Angles

The system SHALL run 5 parallel sweep agents, each with a distinct research angle:
- **vendor** — commercial coding tools (Anthropic, OpenAI, Cursor, Copilot, Google, Cognition)
- **research** — academic papers (arXiv, HuggingFace, SWE-bench)
- **community** — practitioner discourse (HN, Reddit, blogs)
- **oss** — open-source ecosystem (GitHub trending, MCP servers, agent frameworks)
- **practices** — engineering team SDLC transformations (blog posts, conference talks)

#### Scenario: 5 angle definitions exist

- **GIVEN** the `ANGLES` array in the workflow
- **WHEN** counting the entries
- **THEN** there are exactly 5 angles with keys `vendor`, `research`, `community`, `oss`, `practices`

### Requirement: Schema Contracts

The system SHALL enforce typed output schemas for each phase:
- `TRENDS_SCHEMA` — raw sweep output: `{trends: [{name, summary, sources, momentum}]}`
- `MERGED_SCHEMA` — deduped output: `{trends: [{...max 10}], dropped: [string]}`
- `VERDICT_SCHEMA` — assessment output: `{verdict, rationale, borrow_what, already_covered, effort, risks}`

#### Scenario: Verdict schema restricts verdict enum

- **GIVEN** the `VERDICT_SCHEMA`
- **WHEN** inspecting `verdict.enum`
- **THEN** it contains exactly `['adopt', 'trial', 'hold', 'skip']`

#### Scenario: Merged schema limits trends to 10

- **GIVEN** the `MERGED_SCHEMA`
- **WHEN** inspecting `trends.maxItems`
- **THEN** it is `10`

### Requirement: SDLC Self-Description Constant

The system SHALL embed a `OUR_SDLC` constant containing a concise description of the
project's SDLC (OpenSpec workflow, dev-flow skills, Software Factory pipeline, 6 domain
agents, MCP servers, BATS + Playwright testing, push-based deploy). This constant is
injected into consolidation and assessment prompts as evaluation context.

#### Scenario: OUR_SDLC mentions key SDLC components

- **GIVEN** the `OUR_SDLC` constant in the workflow
- **WHEN** searching for key terms
- **THEN** it contains mentions of OpenSpec, dev-flow, Software Factory, and agent routing

### Requirement: Verdict Scale with Integration Points

Each trend assessment SHALL produce a verdict on a 4-point scale (adopt/trial/hold/skip)
with a `borrow_what` field naming the concrete integration point (which skill, pipeline
phase, or component would be affected), an `effort` estimate (S/M/L), and `risks`.

#### Scenario: Adopt verdict includes concrete integration point

- **GIVEN** a trend assessed as `adopt`
- **WHEN** reading the `borrow_what` field
- **THEN** it names a specific skill, workflow, or component in the existing SDLC

### Requirement: Radar Report Output

The final synthesis phase SHALL produce a Markdown report with:
1. TL;DR (3-5 sentences)
2. Radar table (Trend | Momentum | Verdict | Aufwand)
3. Per-verdict sections with rationale, integration proposal, and risks
4. "Bereits abgedeckt" list (what we already have)
5. Recommended next steps as ticket candidates

#### Scenario: Report includes all 5 structural sections

- **GIVEN** the radar report output
- **WHEN** parsing the Markdown
- **THEN** it contains sections for TL;DR, radar table, verdict categories, already-covered list, and next steps

---

## Key Files

- `.claude/workflows/agentic-trends-radar.js` — workflow definition (143 lines)

---

<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-07-21 -->
