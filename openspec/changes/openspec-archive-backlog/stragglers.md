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

## e2e-bug-report-testdata-T002385

- **Charge**: 2
- **SSOT-Spec**: `openspec/specs/e2e-bug-report-testdata-T002385.md` (neu, `--create-new`)
- **Fehlermeldung**: `ERROR: e2e-bug-report-testdata-T002385.md: contains unedited skeleton stub (TODO / 'The system SHALL …') — edit before archiving`
- **Befund**: Unbearbeiteter Skeleton-Stub. Der Change wurde von Charge 2 zurückgestellt und nicht
  archiviert; der Rest der Charge wurde regulär ausgeliefert. Reparatur (Delta ausformulieren)
  folgt in einem eigenen PR gemäß Task 5.5 des Plans.

## embed-skip-visibility

- **Charge**: 2
- **SSOT-Spec**: `openspec/specs/local-llm-proxy.md`
- **Fehlermeldung**: `ERROR: local-llm-proxy.md: contains unedited skeleton stub (TODO / 'The system SHALL …') — edit before archiving`
- **Befund**: Unbearbeiteter Skeleton-Stub im Delta `openspec/changes/embed-skip-visibility/specs/local-llm-proxy.md`.
  Der Change wurde von Charge 2 zurückgestellt und nicht archiviert; der Rest der Charge wurde
  regulär ausgeliefert. Reparatur (Delta ausformulieren) folgt in einem eigenen PR gemäß Task 5.5
  des Plans.

## exclude-latest-images

- **Charge**: 2
- **SSOT-Spec**: `openspec/specs/exclude-latest-images.md` (neu, `--create-new`)
- **Fehlermeldung**: `ERROR: exclude-latest-images.md: contains unedited skeleton stub (TODO / 'The system SHALL …') — edit before archiving`
- **Befund**: Unbearbeiteter Skeleton-Stub. Der Change wurde von Charge 2 zurückgestellt und nicht
  archiviert; der Rest der Charge wurde regulär ausgeliefert. Reparatur (Delta ausformulieren)
  folgt in einem eigenen PR gemäß Task 5.5 des Plans.

## factory-attempt-counter-T002389

- **Charge**: 2
- **SSOT-Spec**: `openspec/specs/factory-attempt-counter-T002389.md` (neu, `--create-new`)
- **Fehlermeldung**: `ERROR: factory-attempt-counter-T002389.md: contains unedited skeleton stub (TODO / 'The system SHALL …') — edit before archiving`
- **Befund**: Unbearbeiteter Skeleton-Stub. Der Change wurde von Charge 2 zurückgestellt und nicht
  archiviert; der Rest der Charge wurde regulär ausgeliefert. Reparatur (Delta ausformulieren)
  folgt in einem eigenen PR gemäß Task 5.5 des Plans.

## factory-scout-backoff

- **Charge**: 2
- **SSOT-Spec**: `openspec/specs/factory-scout-backoff.md` (neu, `--create-new`)
- **Fehlermeldung**: `ERROR: factory-scout-backoff.md: contains unedited skeleton stub (TODO / 'The system SHALL …') — edit before archiving`
- **Befund**: Unbearbeiteter Skeleton-Stub. Der Change wurde von Charge 2 zurückgestellt und nicht
  archiviert; der Rest der Charge wurde regulär ausgeliefert. Reparatur (Delta ausformulieren)
  folgt in einem eigenen PR gemäß Task 5.5 des Plans.

## fix-ticket-tracking-T002279

- **Charge**: 3
- **SSOT-Spec**: `openspec/specs/fix-ticket-tracking-T002279.md` (neu, `--create-new`)
- **Fehlermeldung**: `ERROR: fix-ticket-tracking-T002279.md: contains unedited skeleton stub (TODO / 'The system SHALL …') — edit before archiving`
- **Befund**: Unbearbeiteter Skeleton-Stub, analog zu den Fällen aus Charge 1/2. Der Change
  wurde von Charge 3 zurückgestellt und nicht archiviert; der Rest der Charge wurde regulär
  ausgeliefert. Reparatur (Delta ausformulieren) folgt in einem eigenen PR gemäß Task 5.5 des
  Plans.

## g-db01-fk-index-remediation

- **Charge**: 3
- **SSOT-Spec**: n/a (`--create-new` verweigert)
- **Fehlermeldung**: `ERROR: Refusing to create one-off spec 'g-db01-fk-indexes.md' (ticket/gate slug pattern). Use --target-spec <parent> to fold it into an existing component, or --force-new-component to override.`
- **Befund**: Dritte Guard-Variante (zusätzlich zu den bekannten zwei aus Charge 1/2):
  `scripts/openspec.sh archive` verweigert `--create-new` für einen Slug, der als
  Ticket-/Gate-Kürzel erkannt wird, statt eine eigene SSOT-Komponente daraus zu machen. Der
  Change wurde von Charge 3 zurückgestellt und nicht archiviert (kein `mv` erfolgt, Zustand
  unverändert); der Rest der Charge wurde regulär ausgeliefert. Reparatur (`--target-spec
  <parent>` oder `--force-new-component` wählen) folgt in einem eigenen PR gemäß Task 5.5 des
  Plans.

## k3d-kustomization-T002349

- **Charge**: 3
- **SSOT-Spec**: `openspec/specs/k3d-kustomization-T002349.md` (neu, `--create-new`)
- **Fehlermeldung**: `ERROR: k3d-kustomization-T002349.md: contains unedited skeleton stub (TODO / 'The system SHALL …') — edit before archiving`
- **Befund**: Unbearbeiteter Skeleton-Stub, analog zu den Fällen aus Charge 1/2. Der Change
  wurde von Charge 3 zurückgestellt und nicht archiviert; der Rest der Charge wurde regulär
  ausgeliefert. Reparatur (Delta ausformulieren) folgt in einem eigenen PR gemäß Task 5.5 des
  Plans.

## llamacpp-embed-rerank

- **Charge**: 3
- **SSOT-Spec**: `openspec/specs/llm-pipeline.md`
- **Fehlermeldung**: `ERROR: llm-pipeline.md: MODIFIED target 'LLM-Router Strict-Fail bei Embedding-Ausfall (E2E)' not found in llm-pipeline.md`
- **Befund**: Das Delta-`MODIFIED`-Ziel existiert in der aktuellen SSOT `llm-pipeline.md` nicht
  (mehr). Der Change wurde von Charge 3 zurückgestellt und nicht archiviert; der Rest der Charge
  wurde regulär ausgeliefert. Reparatur (Delta-Fix, nicht SSOT-Direktedit) folgt in einem eigenen
  PR gemäß Task 5.5 des Plans.

## mcp-gateway-watchdog

- **Charge**: 3
- **SSOT-Spec**: `openspec/specs/mcp-gateway.md`
- **Fehlermeldung**: `ERROR: mcp-gateway.md: contains unedited skeleton stub (TODO / 'The system SHALL …') — edit before archiving`
- **Befund**: Unbearbeiteter Skeleton-Stub (diesmal in der SSOT selbst, nicht im Delta). Der
  Change wurde von Charge 3 zurückgestellt und nicht archiviert; der Rest der Charge wurde
  regulär ausgeliefert. Reparatur (Delta/SSOT ausformulieren) folgt in einem eigenen PR gemäß
  Task 5.5 des Plans.

## micro-spec-consolidation

- **Charge**: 3
- **SSOT-Spec**: `openspec/specs/micro-spec-consolidation.md` (neu, `--create-new`)
- **Fehlermeldung**: `ERROR: micro-spec-consolidation.md: contains unedited skeleton stub (TODO / 'The system SHALL …') — edit before archiving`
- **Befund**: Unbearbeiteter Skeleton-Stub, analog zu den Fällen aus Charge 1/2. Der Change
  wurde von Charge 3 zurückgestellt und nicht archiviert; der Rest der Charge wurde regulär
  ausgeliefert. Reparatur (Delta ausformulieren) folgt in einem eigenen PR gemäß Task 5.5 des
  Plans.

## factory-slot-sandbox

- **Charge**: 2
- **SSOT-Spec**: `openspec/specs/software-factory.md`
- **Fehlermeldung**: `ERROR: software-factory.md: MODIFIED target 'Pipeline-Slot → llama.cpp-Slot-Kopplung' not found in software-factory.md`
- **Befund**: Das Delta-`MODIFIED`-Ziel existiert in der aktuellen SSOT `software-factory.md`
  nicht (mehr). Der Change wurde von Charge 2 zurückgestellt und nicht archiviert; der Rest der
  Charge wurde regulär ausgeliefert. Reparatur (Delta-Fix, nicht SSOT-Direktedit) folgt in einem
  eigenen PR gemäß Task 5.5 des Plans.

## mishap-bundle-t002471

- **Charge**: 4
- **SSOT-Spec**: `openspec/specs/misc-scripts.md` (neu, `--create-new`)
- **Fehlermeldung**: `ERROR: misc-scripts.md: contains unedited skeleton stub (TODO / 'The system SHALL …') — edit before archiving`
- **Befund**: Unbearbeiteter Skeleton-Stub, analog zu den Fällen aus Charge 1–3. Der Change
  wurde von Charge 4 zurückgestellt und nicht archiviert; der Rest der Charge wurde regulär
  ausgeliefert. Reparatur (Delta ausformulieren) folgt in einem eigenen PR gemäß Task 5.5 des
  Plans.

## mishap-t001867

- **Charge**: 4
- **SSOT-Spec**: `openspec/specs/mishap-t001867.md` (neu, `--create-new`)
- **Fehlermeldung**: `ERROR: mishap-t001867.md: contains unedited skeleton stub (TODO / 'The system SHALL …') — edit before archiving`
- **Befund**: Unbearbeiteter Skeleton-Stub. Der Change wurde von Charge 4 zurückgestellt und
  nicht archiviert; der Rest der Charge wurde regulär ausgeliefert. Reparatur (Delta
  ausformulieren) folgt in einem eigenen PR gemäß Task 5.5 des Plans.

## mishap-t001868

- **Charge**: 4
- **SSOT-Spec**: `openspec/specs/mishap-t001868.md` (neu, `--create-new`)
- **Fehlermeldung**: `ERROR: mishap-t001868.md: contains unedited skeleton stub (TODO / 'The system SHALL …') — edit before archiving`
- **Befund**: Unbearbeiteter Skeleton-Stub. Der Change wurde von Charge 4 zurückgestellt und
  nicht archiviert; der Rest der Charge wurde regulär ausgeliefert. Reparatur (Delta
  ausformulieren) folgt in einem eigenen PR gemäß Task 5.5 des Plans.

## mishap-t001873

- **Charge**: 4
- **SSOT-Spec**: `openspec/specs/mishap-t001873.md` (neu, `--create-new`)
- **Fehlermeldung**: `ERROR: mishap-t001873.md: contains unedited skeleton stub (TODO / 'The system SHALL …') — edit before archiving`
- **Befund**: Unbearbeiteter Skeleton-Stub. Der Change wurde von Charge 4 zurückgestellt und
  nicht archiviert; der Rest der Charge wurde regulär ausgeliefert. Reparatur (Delta
  ausformulieren) folgt in einem eigenen PR gemäß Task 5.5 des Plans.

## mishap-t001927

- **Charge**: 4
- **SSOT-Spec**: `openspec/specs/mishap-t001927.md` (neu, `--create-new`)
- **Fehlermeldung**: `ERROR: mishap-t001927.md: contains unedited skeleton stub (TODO / 'The system SHALL …') — edit before archiving`
- **Befund**: Unbearbeiteter Skeleton-Stub. Der Change wurde von Charge 4 zurückgestellt und
  nicht archiviert; der Rest der Charge wurde regulär ausgeliefert. Reparatur (Delta
  ausformulieren) folgt in einem eigenen PR gemäß Task 5.5 des Plans.

## mishap-t001973

- **Charge**: 4
- **SSOT-Spec**: `openspec/specs/mishap-t001973.md` (neu, `--create-new`)
- **Fehlermeldung**: `ERROR: mishap-t001973.md: contains unedited skeleton stub (TODO / 'The system SHALL …') — edit before archiving`
- **Befund**: Unbearbeiteter Skeleton-Stub. Der Change wurde von Charge 4 zurückgestellt und
  nicht archiviert; der Rest der Charge wurde regulär ausgeliefert. Reparatur (Delta
  ausformulieren) folgt in einem eigenen PR gemäß Task 5.5 des Plans.

## mishap-t001974

- **Charge**: 4
- **SSOT-Spec**: `openspec/specs/mishap-t001974.md` (neu, `--create-new`)
- **Fehlermeldung**: `ERROR: mishap-t001974.md: contains unedited skeleton stub (TODO / 'The system SHALL …') — edit before archiving`
- **Befund**: Unbearbeiteter Skeleton-Stub. Der Change wurde von Charge 4 zurückgestellt und
  nicht archiviert; der Rest der Charge wurde regulär ausgeliefert. Reparatur (Delta
  ausformulieren) folgt in einem eigenen PR gemäß Task 5.5 des Plans.

## mishap-t002137

- **Charge**: 4
- **SSOT-Spec**: `openspec/specs/mishap-t002137.md` (neu, `--create-new`)
- **Fehlermeldung**: `ERROR: mishap-t002137.md: contains unedited skeleton stub (TODO / 'The system SHALL …') — edit before archiving`
- **Befund**: Unbearbeiteter Skeleton-Stub. Der Change wurde von Charge 4 zurückgestellt und
  nicht archiviert; der Rest der Charge wurde regulär ausgeliefert. Reparatur (Delta
  ausformulieren) folgt in einem eigenen PR gemäß Task 5.5 des Plans.

## mishap-t002239

- **Charge**: 4
- **SSOT-Spec**: `openspec/specs/mishap-t002239.md` (neu, `--create-new`)
- **Fehlermeldung**: `ERROR: mishap-t002239.md: contains unedited skeleton stub (TODO / 'The system SHALL …') — edit before archiving`
- **Befund**: Unbearbeiteter Skeleton-Stub. Der Change wurde von Charge 4 zurückgestellt und
  nicht archiviert; der Rest der Charge wurde regulär ausgeliefert. Reparatur (Delta
  ausformulieren) folgt in einem eigenen PR gemäß Task 5.5 des Plans.

## mishap-t002261

- **Charge**: 4
- **SSOT-Spec**: `openspec/specs/mishap-t002261.md` (neu, `--create-new`)
- **Fehlermeldung**: `ERROR: mishap-t002261.md: contains unedited skeleton stub (TODO / 'The system SHALL …') — edit before archiving`
- **Befund**: Unbearbeiteter Skeleton-Stub. Der Change wurde von Charge 4 zurückgestellt und
  nicht archiviert; der Rest der Charge wurde regulär ausgeliefert. Reparatur (Delta
  ausformulieren) folgt in einem eigenen PR gemäß Task 5.5 des Plans.

## mishap-t002273

- **Charge**: 4
- **SSOT-Spec**: `openspec/specs/mishap-t002273.md` (neu, `--create-new`)
- **Fehlermeldung**: `ERROR: mishap-t002273.md: contains unedited skeleton stub (TODO / 'The system SHALL …') — edit before archiving`
- **Befund**: Unbearbeiteter Skeleton-Stub. Der Change wurde von Charge 4 zurückgestellt und
  nicht archiviert; der Rest der Charge wurde regulär ausgeliefert. Reparatur (Delta
  ausformulieren) folgt in einem eigenen PR gemäß Task 5.5 des Plans.

## mishap-t002291

- **Charge**: 4
- **SSOT-Spec**: `openspec/specs/mishap-t002291.md` (neu, `--create-new`)
- **Fehlermeldung**: `ERROR: mishap-t002291.md: contains unedited skeleton stub (TODO / 'The system SHALL …') — edit before archiving`
- **Befund**: Unbearbeiteter Skeleton-Stub. Der Change wurde von Charge 4 zurückgestellt und
  nicht archiviert; der Rest der Charge wurde regulär ausgeliefert. Reparatur (Delta
  ausformulieren) folgt in einem eigenen PR gemäß Task 5.5 des Plans.

## mishap-t002339

- **Charge**: 4
- **SSOT-Spec**: `openspec/specs/mishap-t002339.md` (neu, `--create-new`)
- **Fehlermeldung**: `ERROR: mishap-t002339.md: contains unedited skeleton stub (TODO / 'The system SHALL …') — edit before archiving`
- **Befund**: Unbearbeiteter Skeleton-Stub. Der Change wurde von Charge 4 zurückgestellt und
  nicht archiviert; der Rest der Charge wurde regulär ausgeliefert. Reparatur (Delta
  ausformulieren) folgt in einem eigenen PR gemäß Task 5.5 des Plans.

## mishap-t002341

- **Charge**: 4
- **SSOT-Spec**: `openspec/specs/mishap-t002341.md` (neu, `--create-new`)
- **Fehlermeldung**: `ERROR: mishap-t002341.md: contains unedited skeleton stub (TODO / 'The system SHALL …') — edit before archiving`
- **Befund**: Unbearbeiteter Skeleton-Stub. Der Change wurde von Charge 4 zurückgestellt und
  nicht archiviert; der Rest der Charge wurde regulär ausgeliefert. Reparatur (Delta
  ausformulieren) folgt in einem eigenen PR gemäß Task 5.5 des Plans.
