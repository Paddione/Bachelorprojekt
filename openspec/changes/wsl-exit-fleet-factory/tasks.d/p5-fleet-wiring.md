# P5 — Fleet-Wiring (kustomization)

```yaml
title: "P5 fleet-wiring"
ticket_id: T016422
domains: [infra]
status: active
target_files:
  - k3d/dev-stack/kustomization.yaml
```

Ziel: Die drei neuen Manifeste aus P2–P4 in den dev-stack-Build hängen. Dieses
Partial läuft bewusst NACH P2/P3/P4 (Slot-Gating der Factory), damit der Build
niemanden auf fehlende Dateien laufen lässt.

## Tasks

- [ ] **T5.1** In `resources:` ergänzen (alphabetisch einreihen):

      ```yaml
      - factory-runner.yaml
      - internal-mcp-ingress.yaml
      - sdlc-console.yaml
      ```

- [ ] **T5.2** Kommentarzeile unter `# images: ...` erweitern: factory-runner-Image
  wird wie die übrigen per Deploy-Pfad gesetzt bzw. ist statisch gepinnt (je nach
  Ergebnis T2.3).

## Verify

```bash
task workspace:validate
```

Live-Gate nach Merge (Operator/Factory): flux-dev Kustomization meldet
ReconciliationSucceeded — Voraussetzung ist, dass P1 (brett) vorher grün war.
