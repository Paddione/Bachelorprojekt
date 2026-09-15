# Proposal: Standardize Agent Visual Accessibility & Decision Modals

## Why
Agent infodumps (long wall-of-text logs, unstructured prompts, raw stack traces) degrade user experience and visual accessibility across harnesses. Furthermore, decision-making requiring human input often relies on open-ended text questions instead of structured, interactive multi-choice menus. Standardizing visual presentation, native decision modals (`ask_question`), and browser-based review surfaces (`lavish-axi`) improves human-in-the-loop efficiency and visual clarity.

## What
- Establish explicit specification requirements for agent visual output and human input handling.
- Require native interactive multi-choice menus (`ask_question` / `AskUserQuestion`) for structured human input.
- Require collapsible disclosure (`<details><summary>`) for raw execution logs and context dumps.
- Integrate Mermaid diagrams and Markdown Carousels for complex decision trees and visual comparisons.
- Update agent behavior and guideline documentation.

_Ticket: T900165_
