---
title: "remove-pushover-alert-routing — Implementation Plan"
ticket_id: T014542
domains: [plan-authoring]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# remove-pushover-alert-routing — Implementation Plan

_Ticket: T014542_

## File Structure

```
k3d/monitoring/alertmanager-config.yaml        # Pushover-Receiver + Route entfernen
k3d/monitoring/kustomization.yaml              # alertmanager-pushover-secret.yaml raus
k3d/monitoring/alertmanager-pushover-secret.yaml   # gelöscht
openspec/changes/remove-pushover-alert-routing/…   # Delta-Spec (dieses Change)
tests/spec/monitoring-alerts.bats              # Pushover-Assertion → email-only + Negativ-Anchor
tests/unit/T000617-alert-rules.bats            # dto.
```

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Die umgestellten BATS-Assertions reproduzieren den
      Zustand: auf dem Ausgangsstand (pushoverConfigs vorhanden) schlägt die neue
      Negativ-Assertion fehl.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/monitoring-alerts.bats tests/unit/T000617-alert-rules.bats
# expected: FAIL (red — pushoverConfigs ist noch in der Config)
```

- [ ] **Fix-Step (GREEN).** Manifest bereinigen, Secret-Datei löschen, Kustomization
      anpassen — beide BATS-Dateien müssen danach grün sein.

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
