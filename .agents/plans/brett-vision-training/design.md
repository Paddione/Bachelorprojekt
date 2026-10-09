---
ticket_id: T901676
plan_ref: .agents/plans/brett-vision-training/tasks.md
status: active
date: 2026-10-09
---

# Design: brett-vision-training

Architektur-Spec zum Brainstorming (Chat, 2026-10-09). Normative Details
stehen in `tasks.md` + Partials; hier die getroffenen Entscheidungen.

## Entschiedene Architektur

**Daten-Plus-Specs, kein Kernumbau.** Der Harness aus T901645 (Runner,
Orakel, Bench-Protokoll) bleibt unverändert; dieser Plan liefert nur neue
Daten (`curated-brett.json`), neue bzw. erweiterte Specs und Bench-Evidenz
(JSONL + Runbook). Trennung der Flow-SSOTs nach Basis-URL (E3) hält den
Runner schlank: ein Lauf, eine Basis, eine Flow-Datei.

## Kuratierte Brett-Flows (p2)

| id | auth | goal_checks | source_spec |
|----|------|-------------|-------------|
| brett-smoke-home | nein | urlMatches, textContains | fa-27-brett.spec.ts |
| brett-guest-share-link | nein | urlContains, textContains | brett-share-link-Abschnitt in fa-27/brett-Specs |
| brett-session-lifecycle | ja | urlContains, textMatches | brett-session-lifecycle.spec.ts |
| brett-figure-place-move | ja | apiEquals (Snapshot), textContains | brett-undo-redo.spec.ts + Session-Spec |
| brett-undo-redo | ja | apiEquals (Snapshot) | brett-undo-redo.spec.ts |

Jeder Flow nennt `start_url` relativ; Basis kommt aus `AGENT_BASE_URL`
(= Brett-Host des Ziel-Envs). Auth-Flows brauchen `--auth`-State aus
`brett-mentolder-setup`, sonst `auth-required`-Abbruch (fail-closed).

## Orakel-Mapping (E4)

- Navigation/Render: `urlContains`, `urlMatches`, `textContains`,
  `textMatches` (Orakel unverändert).
- Figuren-Grounding: `apiEquals` gegen Brett-REST-Snapshot (Pfadvergleich
  per `isDeepStrictEqual`, z. B. Figurenliste vor/nach Klick). Snapshot-
  Routen stehen in den Session-Specs; p1-Audit notiert die exakten Pfade.

## Serve-Matrix (p3)

| Modell | GGUF | mmproj | Port |
|--------|------|--------|------|
| gemma4-e4b-unsloth | gemma-4-E4B-it-Q4_K_M.gguf | mmproj-F16.gguf | 1931 |
| gemma4-e4b-hauhau | Hauhau-E4B-GGUF | mmproj-Hauhau-f16 | 1931 |

Sequenell: ein Modell zur Zeit, FreeToken vorher stoppen,
`max_tokens >= 800` (Thinking-Bloat, Runbook). `qwen3.5-4b-quasar` nur
nach bestandener Visionsprobe, sonst Streichung mit Notiz.

## Env-Ablauf dev → prod

1. Reachability-Probe: `/healthz` auf Dev-Basis und Prod-Basis per
   `curl` (Env-Variablen, keine Literale in Skripten).
2. Scripted Suite: Brett- + Whiteboard-Projekte gegen Dev, dann Prod.
3. Vision-Bench: `curated-brett.json` gegen Dev, dann Prod, je Modell.
4. Unerreichbares Env: Lauf überspringen, Lücke im Report benennen.

## Datei-Shape

- Neu: `tests/e2e/specs/brett-replay.spec.ts`,
  `tests/e2e/agent/curated-brett.json` (beide mit Wachstumsreserve
  unter ihren Limits geschnitten).
- Erweitert: `tests/e2e/specs/fa-24-whiteboard.spec.ts` (Restbudget
  laut Linter, siehe tasks.md), passende `brett-*.spec.ts` nach Audit,
  `docs/runbooks/e2e-vision-agents.md` (Brett-Sektion).
- Generiert: `components/website/src/data/test-inventory.json` via
  `task test:inventory` (Staged-Set-Ausnahme, mitcommitten).
- Bench-JSONL unter `tests/e2e/results/` (laufzeitseitig, kein Commit
  von Ergebnisdateien außer dem Report-Abschnitt im Runbook).

## Verify-Strategie

- RED-Nachweis: neue Specs laufen zuerst rot (`expected: FAIL`), dann
  grün — je einmal im Partial-Verify.
- Schema: `curated-brett.json` durch `validateFlows` (`node --test`
  Orakel-Suite) vor dem ersten Browser.
- Schluss: `task test:changed`, `task freshness:regenerate`,
  `task freshness:check` (STRUCT3).
