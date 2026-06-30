# coaching-sessions-polish-guide

## Purpose

SSOT spec.

## Requirements

### Requirement: StepDefinition.description

StepDefinition has a required `description: string` field so that both the SessionWizard and the coaching-guide.html can show a short italic description line beneath the phase label.

#### Scenario: Every step has a non-empty description

- **GIVEN** STEP_DEFINITIONS contains 10 coaching steps
- **WHEN** accessing the `description` property of each step
- **THEN** every description is a non-empty string with length > 10

### Requirement: Design-Token-migrierter SessionWizard

SessionWizard.svelte uses mentolder design tokens (`--brass`, `--ink-800`, `--fg`, `--line`, `--serif`, `--sans`, `--mute`) instead of hardcoded fallback values.

#### Scenario: Step title renders in serif font

- **GIVEN** the wizard displays a coaching step
- **WHEN** inspecting the `.step-title` element
- **THEN** its `font-family` is `var(--serif)`

#### Scenario: Description line visible

- **GIVEN** the wizard displays a coaching step
- **WHEN** inspecting the `.step-description` element
- **THEN** it shows the step's `description` text

### Requirement: Rate-limited Hermes Proxy

`POST /api/demo/coaching-sim` proxys requests to the Hermes model with in-memory rate limiting (20 req/IP/min, HTTP 429 on excess).

#### Scenario: Rate limit blocks after 20 requests

- **GIVEN** a client IP
- **WHEN** 21 requests are sent within one minute
- **THEN** the 21st request returns HTTP 429

### Requirement: Self-contained Coaching Guide

`coaching-guide.html` is a self-contained interactive guide (embedded CSS + JS) with 10 coaching steps and a dual-mode simulator (Live via Hermes, Scripted via embedded Andrea K. persona data).

#### Scenario: Scripted mode shows pre-filled fields

- **GIVEN** the guide is loaded in a browser
- **WHEN** toggling to "📋 Scripted" mode
- **THEN** input fields are pre-filled with Andrea K. persona data

#### Scenario: Typewriter effect

- **GIVEN** the guide received a coaching response
- **WHEN** the response is displayed
- **THEN** characters appear one by one at 16 ms intervals

<!-- merged from change delta coaching-sessions-polish-guide.md on 2026-06-28 -->