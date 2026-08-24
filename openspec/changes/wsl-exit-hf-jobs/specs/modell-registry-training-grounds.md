# Delta Spec: modell-registry-training-grounds (wsl-exit-hf-jobs)

## ADDED Requirements

### Requirement: Der Trainingspfad ist von der lokalen Laufzeit entkoppelt

Finetuning MUSS ohne WSL/GPU-Local-Laufzeit startbar sein (HF Jobs Cloud);
lokale Targets dürfen als deprecated erhalten bleiben, aber nicht Voraussetzung
für einen Trainingslauf sein.

#### Scenario: Trainingsstart nach dem WSL-Shutdown

- **GIVEN** der WSL-Host ist heruntergefahren
- **WHEN** ein Operator das finetune-Target für HF Jobs aufruft
- **THEN** startet der Lauf in der Cloud, Trackio liefert Monitoring und der
  GGUF-Export landet im Modell-Registry-Pfad

#### Scenario: Doku nennt den neuen Pfad

- **GIVEN** die Finetune-Doku wird gelesen
- **WHEN** nach dem Weg für Trainingsläufe gesucht wird
- **THEN** beschreibt sie HF Jobs als primären Pfad inkl. UV/PEP-723- und
  Trackio-Hinweisen und markiert lokale Venvs als deprecated
