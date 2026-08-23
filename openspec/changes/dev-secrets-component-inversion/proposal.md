# Proposal: dev-secrets-component-inversion

## Why

`prod/kustomization.yaml:6-7` zieht `../k3d` komplett — jede neue Plaintext-Secret-Datei im
Base landet damit per Default im Prod-Bundle. Sicherheit hängt allein an manuellen
`$patch: delete`-Einträgen (prod/kustomization.yaml:38-93), von denen drei sich selbst als
"defensiv" beschreiben (SA-GR-02, T014546). Der Beleg, dass die Footgun real ist:
`k3d/pentest-flags.yaml` (Secret `pentest-internal-vault`) ist Base-referenziert und hat
**keinen** patch-delete — das Secret geht heute ungedeckt in den Prod-Render.

Bestehende Entscheidung, die ersetzt wird (T002829-Zitat): `openspec/specs/secret-rotation.md`
§Prod-Secret-Removal mandiert den `$patch: delete`-Mechanismus; `workspace-deploy.md`
beschreibt die patch-delete-Blöcke als Deploy-Schutz; `fleet-operations.md:425` fordert die
Drei-Orte-Synchronität von Base-Secret, patch-delete und Begründung. Diese Inversion ersetzt
den Mechanismus durch strukturelle Ausschließung (MODIFIED-Deltas).

## What

Inversion des Include-Patterns zu einem Opt-in:

1. **Neue Kustomize-Komponente `components/dev-secrets/`** (außerhalb `k3d/`) — nimmt die
   Secret-Dokumente auf, die heute über den Base rendern würden.
2. **Neuer Dev-Einstiegspunkt `k3d-dev/kustomization.yaml`** = Base (`../k3d`) + Komponente;
   Dev-Deploys und der Validate-Task wechseln darauf.
3. **Base wird secret-frei:** `k3d/kustomization.yaml` referenziert keine Plaintext-Secrets
   mehr; `prod/kustomization.yaml` verliert alle fünf Secret-`$patch: delete`-Einträge.
4. **Kern-Scope (Operator-Entscheid 2026-08-24):** nur Base-gerenderte Secrets:
   - `k3d/secrets.yaml` → `workspace-secrets` + `knowledge-secrets`
   - `k3d/ntfy.yaml` → Secret `ntfy-tokens` (Workload bleibt im Base)
   - `k3d/pentest-flags.yaml` → Secret `pentest-internal-vault` (ConfigMap bleibt im Base)
   - `k3d/backup-secrets.yaml` + `k3d/vaultwarden-seed-credentials.yaml` wandern mit
     (bislang defensiv außerhalb des Renders)
   - Unterstack-Secrets (coturn/office/monitoring/sdlc/rustdesk — eigene Build-Pfade,
     erreichen den Prod-Render nicht) sind **Non-Goal**, Folgeticket möglich.
5. **Label `dev-seed: "true"`** auf allen Ressourcen der Komponente — maschinenlesbares
   Merkmal für Guards.
6. **Guard-Anpassung:** Pfad-gepinnnte Specs/BATS (schema-sync gegen `k3d/secrets.yaml`,
   env-seal-Schreibpfade) folgen der Datei-Verschiebung; MODIFIED-Deltas auf
   secret-rotation, workspace-deploy, fleet-operations.

Akzeptanz (aus requirements_list): Prod-Render (`task workspace:validate` bzw.
render-fleet-artifact-Pfad) enthält keine Plaintext-Secrets mehr; Dev-Render enthält sie
weiterhin vollständig; schema-sync/env-seal-Guards grün.

## Impact

- **Specs (SSOT):** secret-rotation.md (Mechanismuswechsel), workspace-deploy.md
  (patch-delete-Szenarien), fleet-operations.md (Drei-Orte-Sync entfällt), 
  secrets-deploy-automation.md (Dev-Pfade).
- **Code:** `k3d/kustomization.yaml`, neu `components/dev-secrets/*`, neu
  `k3d-dev/kustomization.yaml`, `prod/kustomization.yaml`, Taskfile-Deploy-/Validate-Tasks,
  `scripts/env-seal.sh` (Schreibpfad), schema-sync-Guard-Skripte.
- **Tests:** tests/spec/secret-rotation*, workspace-deploy-, security-BATS-Anpassungen;
  neuer RED-first Guard "Prod-Render ist secret-frei".
- **Risiko:** Deploy-Reihenfolge Dev (Komponente muss vor/nit Workloads kommen — kustomize
  sortiert); vergessene Consumer von `-k k3d` bekommen künftig kein workspace-secrets mehr
  → Auffindungs-Grep im Plan-Partial verpflichtend.

_Ticket: T014546_
