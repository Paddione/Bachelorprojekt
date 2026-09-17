---
title: "batch-sa-infra-T900041 — Implementation Plan"
ticket_id: T900041
domains: [fleet-operations]
status: active
file_locks: []
shared_changes: false
batch_id: T900041
parent_feature: null
depends_on_plans: []
---

# batch-sa-infra-T900041 — Implementation Plan

_Ticket: T900041_

## File Structure

```
prod/patch-vaultwarden.yaml                          # MODIFIED (p1): SMTP_FROM ergaenzen
k3d/penpot.yaml                                      # MODIFIED (p2): SecretKeys-Abgleich, Prune-Hinweise
k3d/shared-db.yaml                                   # MODIFIED (p2): Penpot-Role/DB (falls noetig)
environments/sealed-secrets/fleet-mentolder.yaml     # REGENERATED (p2): env:seal → Penpot-Keys
environments/sealed-secrets/staging.yaml             # REGENERATED (p2): env:seal → Penpot-Keys
k3d/monitoring/blackbox-exporter.yaml                # MODIFIED (p3): runAsUser non-root
k3d/monitoring/kube-prometheus-stack-rendered.yaml   # MODIFIED (p3): Grafana-Init-Fix
k3d/cronjob-scheduled-publish.yaml                   # MODIFIED (p4): URL/Backoff-Logik
k3d/tests-retention-cronjob.yaml                     # MODIFIED (p4): ttl/suspend/Skript-Fix
prod-korczewski/patch-cronjob-urls.yaml              # MODIFIED (p4): URL-Abgleich
environments/schema.yaml                             # MODIFIED (p5): GHCR_PAT → 2 Namespaces
flux/clusters/fleet/bootstrap/ghcr-auth-sealedsecret.yaml  # REGENERATED (p5): kerja Namespaces
k3d/office-stack/kustomization.yaml                  # MODIFIED (p5): ghcr-pull-secret-Ressource
prod/patch-nextcloud.yaml                            # MODIFIED (p6): Readiness-Probe
k3d/nextcloud.yaml                                   # MODIFIED (p6): Readiness-Probe
k3d/llm-proxy.yaml                                   # MODIFIED/REMOVED (p6): workspace-dev llm-proxy
tests/spec/fleet-operations/*.bats                   # NEW (p7): Guard-Tests je Ticket
```

## Partials

| id | partial file | role | target_files |
|----|--------------|------|--------------|
| p1 | tasks.d/p1-vaultwarden-smtp.md | fix | prod/patch-vaultwarden.yaml |
| p2 | tasks.d/p2-penpot-secrets.md | fix | k3d/penpot.yaml,k3d/shared-db.yaml,environments/sealed-secrets/fleet-mentolder.yaml,environments/sealed-secrets/staging.yaml |
| p3 | tasks.d/p3-monitoring.md | fix | k3d/monitoring/blackbox-exporter.yaml,k3d/monitoring/kube-prometheus-stack-rendered.yaml |
| p4 | tasks.d/p4-cronjobs.md | fix | k3d/cronjob-scheduled-publish.yaml,k3d/tests-retention-cronjob.yaml,prod-korczewski/patch-cronjob-urls.yaml |
| p5 | tasks.d/p5-ghcr-pull-secret.md | fix | environments/schema.yaml,flux/clusters/fleet/bootstrap/ghcr-auth-sealedsecret.yaml,k3d/office-stack/kustomization.yaml |
| p6 | tasks.d/p6-readiness.md | fix | prod/patch-nextcloud.yaml,k3d/nextcloud.yaml,k3d/llm-proxy.yaml |
| p7 | tasks.d/p7-tests.md | tests | tests/spec/fleet-operations/vaultwarden-smtp-from.bats,tests/spec/fleet-operations/penpot-secret-keys.bats,tests/spec/fleet-operations/monitoring-ready.bats,tests/spec/fleet-operations/cronjob-hygiene.bats,tests/spec/fleet-operations/ghcr-pull-secret.bats,tests/spec/fleet-operations/readiness.bats |

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Jeder Partial fügt in `tests/spec/fleet-operations/<ticket>.bats`
      einen Guard-Test hinzu, der den Zustand VOR dem Fix reproduziert und auf `expected: FAIL`
      läuft. Wird in **p7-tests** gebündelt ausgeführt.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/fleet-operations/
# expected: FAIL (red — die Fixes sind noch nicht implementiert)
```

- [ ] **Fix-Schritte (GREEN).** Die Partials p1–p6 implementieren die Fixes; die p7-Guard-Tests
      müssen danach grün sein.

- [ ] **Final Verification.** Die drei Pflicht-CI-Gates:

```bash
task test:changed; task freshness:regenerate; task freshness:check
```

## Ausfuehrungsergebnis 2026-09-03

| id | Ticket | Ergebnis |
|----|--------|----------|
| p1 | T900028 | erledigt - SMTP_FROM in prod/patch-vaultwarden.yaml |
| p2 | T900030 | **nicht erledigt** - Root-Cause widerlegt (Scope-Mismatch statt fehlendem env:seal), Fix = Prod-Secret-Rotation, security-Domaene. Siehe tasks.d/p2. |
| p3 | T900034 | erledigt - blackbox runAsUser 65534; Grafana strategy=Recreate (RWO-PVC-Deadlock, nicht der Init-Container) |
| p4 | T900035 | erledigt - scheduled-publish: $$-PID-Expansion, Ziel-Namespace, sichtbares Fehler-Logging; tests-retention: ttl + backoffLimit |
| p5 | T900036 | erledigt - ghcr-pull-secret ueber den tls-sync CronJob verteilt (secret-frei, deklarativ) |
| p6 | T900037 | **nicht erledigt** - kein Repo-Deliverable: PROD-Probe misst 15ms (kein Defekt), Staging-500er ist App-Ebene, llm-proxy hat kein Manifest. Siehe tasks.d/p6. |
| p7 | T900041 | erledigt fuer p1/p3/p4/p5 - 11 Guards in tests/spec/fleet-operations/, alle vorher rot |

Fuer p2 und p6 wurden bewusst **keine** Guard-Tests angelegt: ohne zugehoerigen
Fix waeren sie sofort gruen gewesen und haetten einen behobenen Defekt
vorgetaeuscht (tests/CLAUDE.md, "Konfiguration statt Laufzeit", T003548).
