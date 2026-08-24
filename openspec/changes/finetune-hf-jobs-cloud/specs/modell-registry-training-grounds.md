## ADDED Requirements

### Requirement: Cloud-Trainingspfad via HF Jobs ist dokumentiert und per Taskfile erreichbar

Die Finetuning-Pipeline SHALL einen dokumentierten Cloud-Pfad über HF Jobs
bieten (UV/PEP-723-Skriptmuster, Trackio-Monitoring, GGUF-Export in den
Modell-Registry-Pfad), der über Targets in `Taskfile.finetune.yml`
erreichbar ist. Lokale Targets bleiben funktionsfähig, sind aber als
deprecated markiert.

#### Scenario: Operator startet Cloud-Training

- **GIVEN** der lokale WSL-Dev-Host ist stillgelegt (WSL-Exit)
- **WHEN** der Operator das Taskfile-Cloud-Target für einen Trainingslauf
  aufruft
- **THEN** läuft das Training als HF Job mit UV-gemanagtem Environment,
  Metriken laufen über Trackio, und ein anschließender Export-Target legt
  das GGUF im Modell-Registry-Pfad ab.

#### Scenario: Bestehende lokale Workflows brechen nicht

- **GIVEN** ein Skript nutzt die bisherigen lokalen Targets (measure →
  guard → train → export)
- **WHEN** die Targets aufgerufen werden
- **THEN** verhalten sie sich funktional wie zuvor, mit ergänztem
  Deprecated-Hinweis zugunsten der Cloud-Ziele.
