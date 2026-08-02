# Nachzügler-Protokoll — openspec-archive-backlog (T002569)

Format: Slug, Charge, betroffene SSOT-Spec, Fehlermeldung im Wortlaut.

## agentic-terminal-sidekick

- **Charge**: 1
- **SSOT-Spec**: `openspec/specs/sidekick-assistant.md`
- **Fehlermeldung**: `ERROR: sidekick-assistant.md: MODIFIED target 'Agentic-Terminal-View rendert eingebettetes ttyd-Terminal' not found in sidekick-assistant.md`
- **Befund**: Das Delta unter `openspec/changes/agentic-terminal-sidekick/specs/sidekick-assistant.md`
  enthält ein `### MODIFIED Requirements`-Ziel `Agentic-Terminal-View rendert eingebettetes
  ttyd-Terminal`, das in der aktuellen SSOT `openspec/specs/sidekick-assistant.md` nicht (mehr)
  existiert — `scripts/openspec.sh archive` bricht deshalb vor dem Merge ab. Der Change
  `agentic-terminal-sidekick` wurde von Charge 1 zurückgestellt und nicht archiviert; der Rest
  der Charge wurde regulär ausgeliefert. Reparatur (Delta-Fix, nicht SSOT-Direktedit) folgt in
  einem eigenen PR gemäß Task 5.5 des Plans.

## auto-triage-grounding-T002399

- **Charge**: 1
- **SSOT-Spec**: `openspec/specs/auto-triage-grounding-T002399.md` (neu, `--create-new`)
- **Fehlermeldung**: `ERROR: auto-triage-grounding-T002399.md: contains unedited skeleton stub (TODO / 'The system SHALL …') — edit before archiving`
- **Befund**: Das Delta enthält einen unbearbeiteten Skeleton-Stub (TODO-Platzhalter statt
  ausformulierter Requirements). `scripts/openspec.sh archive` verweigert den Merge zu Recht.
  Der Change wurde von Charge 1 zurückgestellt und nicht archiviert; der Rest der Charge wurde
  regulär ausgeliefert. Reparatur (Delta ausformulieren) folgt in einem eigenen PR gemäß Task 5.5
  des Plans.

## bge-k8s-cpu-migration

- **Charge**: 1
- **SSOT-Spec**: `openspec/specs/llm-pipeline.md`
- **Fehlermeldung**: `ERROR: llm-pipeline.md: MODIFIED target 'bge-Embedding-Layer läuft als Kubernetes-Deployment' not found in llm-pipeline.md`
- **Befund**: Das Delta-`MODIFIED`-Ziel existiert in der aktuellen SSOT `llm-pipeline.md` nicht
  (mehr). Der Change wurde von Charge 1 zurückgestellt und nicht archiviert; der Rest der Charge
  wurde regulär ausgeliefert. Reparatur (Delta-Fix, nicht SSOT-Direktedit) folgt in einem eigenen
  PR gemäß Task 5.5 des Plans.

## bug-consolidation-T002330

- **Charge**: 1
- **SSOT-Spec**: `openspec/specs/bug-consolidation-T002330.md` (neu, `--create-new`)
- **Fehlermeldung**: `ERROR: bug-consolidation-T002330.md: contains unedited skeleton stub (TODO / 'The system SHALL …') — edit before archiving`
- **Befund**: Unbearbeiteter Skeleton-Stub, analog zu `auto-triage-grounding-T002399`. Der Change
  wurde von Charge 1 zurückgestellt und nicht archiviert; der Rest der Charge wurde regulär
  ausgeliefert. Reparatur (Delta ausformulieren) folgt in einem eigenen PR gemäß Task 5.5 des
  Plans.
