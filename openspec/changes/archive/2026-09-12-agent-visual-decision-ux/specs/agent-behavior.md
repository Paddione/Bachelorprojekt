# Delta Spec: Agent Visual Decision UX & Decision Modals

## Purpose
Standardisierung der visuellen Barrierefreiheit und Interaktionsformen bei Agenten-Ergebnissen und Entscheidungen mit menschlicher Eingabe.

## ADDED Requirements

### Requirement: Structured Interactive Decision Modals for Human Input
The system SHALL mandate the use of harness-native decision modals (`ask_question` / `AskUserQuestion`) when asking the user to make discrete choices or choose between implementation options.

#### Scenario: Agent needs user decision on architecture options
- **GIVEN** an agent facing multiple viable implementation paths
- **WHEN** soliciting user feedback or intent
- **THEN** the agent SHALL invoke the native multi-choice menu tool (`ask_question`)
- **AND** format choices as direct user responses with recommended choices listed first
- **AND** include clickable file links for relevant source files.

### Requirement: Progressive Information Disclosure for Verbose Output
The system SHALL wrap raw command logs, stack traces, and verbose background dumps in collapsible HTML disclosure blocks (`<details><summary>`).

#### Scenario: Agent presenting multi-line tool execution output
- **GIVEN** background tool execution logs or raw JSON responses exceeding 10 lines
- **WHEN** rendering the summary to the user
- **THEN** the agent SHALL collapse raw output inside `<details><summary>` elements
- **AND** provide a high-level visual summary in prose or alert blocks (`[!NOTE]`).

### Requirement: Visual Diagrams for Complex Decision Trees
The system SHALL use Mermaid flowcharts or Markdown Carousels when presenting multi-stage decision trees or visual comparisons to the human operator.

#### Scenario: Agent proposing multi-phase migration or plan
- **GIVEN** a multi-step execution plan or branching decision tree
- **WHEN** formatting the proposal artifact
- **THEN** the agent SHALL render a Mermaid diagram or Markdown Carousel block
- **AND** avoid presenting long unstructured bullet lists for complex flow logic.

### Requirement: Lavish HTML Review Surfaces for Visual Review Artifacts
The system SHALL support launching Lavish interactive HTML review surfaces (`lavish-axi`) when presenting complex visual designs, UI component previews, or multi-file visual diffs.

#### Scenario: Agent presenting interactive visual artifact for human review
- **GIVEN** a complex visual design, UI preview, or rich interactive report
- **WHEN** presenting the artifact for user review and consent
- **THEN** the agent SHALL generate a structured HTML artifact and invoke `lavish-axi`
- **AND** collect human feedback interactive responses when requested.

