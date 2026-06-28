# Proposal: plan-intel-bundle

## Why

Spec- und Plan-Erstellung im `dev-flow`-Kreislauf schreiben heute gegen vage Beschreibungen statt
gegen echte Typen. Es gibt **keinen strukturierten Intel-Reuse**: der Code-Explorer (`dev-flow-plan`
A.1) liefert Prosa, der Plan-Subagent (Schritt 3.7) bekommt nur Spec + Assets + Quality-Gates und
re-exploriert ad hoc, und der Implementer (`dev-flow-execute` Schritt 2) startet wieder bei null.
Folge: Pläne referenzieren erfundene Signaturen/Typen, S1-Budgets werden geraten, DB-/API-Contracts
fehlen — und jede Phase verbrennt Kontext mit derselben Exploration.

## What

Einführung eines typisierten **Plan Intel Bundle (PIB)** — `openspec/changes/<slug>/intel.json`,
gegen ein JSON-Schema validiert — das einmal in der Plan-Phase aus den vorhandenen Intel-Quellen
befüllt wird und von **beiden** Phasen (plan + execute) als Pflicht-Kontext konsumiert wird:

- **Schema-Vertrag:** `plan-intel-bundle.schema.json` (draft 2020-12) + `.d.ts`-Spiegel +
  CI-validierte `intel.example.json`-Fixture (`jq`-strukturell, kein `ajv`).
- **Acht typisierte Sektionen:** `meta`, `impact_files` (mit vorberechneten S1-Budgets), `symbols`
  (Code-Signaturen/Typen), `call_graph`, `db_tables`, `api_contracts`, `external_types`, `risks` —
  jede an eine konkrete Quelle gebunden (codebase-memory, LSP, mcp-postgres, context7, baseline.json).
- **Quellen-Mapping-Doc:** `.claude/skills/references/plan-intel-bundle.md` (Skills verlinken hierher).
- **Wiring plan:** neuer Schritt „A.1.5 Intel-Gathering"; Schritt 3.7 injiziert `intel.json` als
  Pflicht-Kontext in den Plan-Subagenten („nur reale Typen aus `intel.json`, nichts erfinden").
- **Wiring execute:** Schritt 2 lädt `intel.json` als Pflicht-Implementer-Kontext → kein Re-Explorieren.
- **Gate:** `tests/spec/dev-flow-plan.bats` (rot→grün) validiert Schema, Fixture, Schema↔`.d.ts`-Parität
  und beide Skill-Wirings.

YAGNI: kein Generator-Script, kein neuer Subagent, keine `dev-flow-chore`-Änderung, keine neue Dependency.

Design-Spec: `docs/superpowers/specs/2026-06-29-plan-intel-bundle-design.md`.

_Ticket: T001323_
