# Partial 4: Alertmanager Secret Reseed

Provides secret template and reseed script to fix 0-byte alertmanager-pushover credentials in monitoring namespace.

## Target Files
`k3d/monitoring/alertmanager-secret-template.yaml`
`scripts/reseed-alertmanager-secret.sh`

## Tasks

- [ ] Task 4.1: Create secret template manifest `k3d/monitoring/alertmanager-secret-template.yaml`.
- [ ] Task 4.2: Implement `scripts/reseed-alertmanager-secret.sh` script to securely populate `PUSHOVER_USER` and `PUSHOVER_TOKEN` credentials and trigger Alertmanager operator reconciliation.
