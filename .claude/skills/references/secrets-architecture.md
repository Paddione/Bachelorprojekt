# Secrets-Dateiarchitektur

Dieses Dokument beschreibt die Dateitopologie, die Synchronisationsregeln und die kanonische Sektionsstruktur der Secret-Dateien in der Bachelorprojekt-Plattform.

## Datei-Topologie

| Datei | Status | Produziert | Referenziert von |
|---|---|---|---|
| `environments/.secrets/fleet-mentolder.yaml` | **Aktiv (Prod)** | `sealed-secrets/fleet-mentolder.yaml` | `environments/fleet-mentolder.yaml` |
| `environments/.secrets/fleet-korczewski.yaml` | **Aktiv (Prod)** | `sealed-secrets/fleet-korczewski.yaml` | `environments/fleet-korczewski.yaml` |
| `environments/.secrets/mentolder.yaml` | Legacy (decommissioned standalone cluster) | `sealed-secrets/mentolder.yaml` | `environments/mentolder.yaml` (nicht mehr deployed) |
| `environments/.secrets/korczewski.yaml` | Legacy (decommissioned standalone cluster) | `sealed-secrets/korczewski.yaml` | `environments/korczewski.yaml` (nicht mehr deployed) |

## Fleet-Sync-Regel

> [!IMPORTANT]
> Wenn ein neuer Secret-Block in `mentolder.yaml` oder `korczewski.yaml` (legacy) hinzukommt, **muss** dieser identisch in `fleet-mentolder.yaml` bzw. `fleet-korczewski.yaml` (fleet) landen, **außer** der Key hat `legacy_only: true` in `environments/schema.yaml`.

Der CI-Guard (`tests/spec/fleet-operations.bats`) erzwingt diese Regel automatisch bei jedem Build offline, indem er sicherstellt, dass die Fleet-SealedSecrets eine vollständige Obermenge aller Nicht-Legacy-Keys der Legacy-SealedSecrets sind.

## Kanonische Sektionsstruktur (15 Abschnitte)

Alle vier `.secrets/`-Dateien folgen dieser strikten Reihenfolge:
1. Externe API-Keys
2. Backup & Speicher
3. E-Mail (SMTP)
4. Datenbankpasswörter
5. Admin-Zugangsdaten
6. Session- & Signing-Secrets
7. Pocket ID OIDC-Secrets (T001068)
8. Keycloak OIDC-Secrets (legacy — abgelöst durch Pocket ID)
9. LiveKit
10. Brett
11. Arena (korczewski only)
12. DB Connection Strings
13. SSH-Schlüssel
14. WireGuard-Mesh
15. Dev-only Overrides

## Sealed-Secrets-Lifecycle

```
.secrets/fleet-*.yaml  →  task env:seal ENV=fleet-*  →  sealed-secrets/fleet-*.yaml
       ↓                                                          ↓
  (gitignored)                                            git commit + push
                                                                  ↓
                                                        PR merge → GitHub Action
                                                                  ↓
                                                    kubectl apply auf fleet-Cluster
```
