---
title: Standardize agent visual accessibility and decision modals
ticket_id: T900165
domains:
  - agent-behavior
  - docs
status: staged
---

# agent-visual-decision-ux — Implementation Plan

## File Structure

- `openspec/changes/agent-visual-decision-ux/proposal.md`
- `openspec/changes/agent-visual-decision-ux/specs/agent-behavior.md`
- `docs/agent-guide/visual-accessibility.md`
- `tests/spec/agent-visual-decision.bats`

## Tasks

### Partial 1: Define OpenSpec Delta for Agent Visual Decision UX

- [x] Create proposal and delta spec for agent visual accessibility and decision modals
  - Define requirements for harness-native decision modals (`ask_question`).
  - Define rules for progressive disclosure using collapsible `<details>` tags.
  - Define rules for visual diagrams (Mermaid flowcharts) and markdown carousels.
- Target files:
  - `openspec/changes/agent-visual-decision-ux/proposal.md`
  - `openspec/changes/agent-visual-decision-ux/specs/agent-behavior.md`

### Partial 2: Document Agent Guidelines for Visual Decision UX

- [x] Create comprehensive guide in `docs/agent-guide/visual-accessibility.md`
  - Include code examples for `ask_question` with recommendations and deep links.
  - Include examples of Markdown Carousels, alert boxes, and Mermaid flowcharts.
  - Document Lavish HTML surface integration patterns.
- Target files:
  - `docs/agent-guide/visual-accessibility.md`

### Partial 3: Verification & Test Suite

- [x] Add BATS specification test `tests/spec/agent-visual-decision.bats`
  - Run initial failing test check (expected: FAIL until implementation complete):
    `bats tests/spec/agent-visual-decision.bats`
  - Implement specification assertion test verifying OpenSpec delta and documentation presence.
  - Execute final verification gates:
    `task test:changed && task freshness:regenerate && task freshness:check`
- Target files:
  - `tests/spec/agent-visual-decision.bats`

