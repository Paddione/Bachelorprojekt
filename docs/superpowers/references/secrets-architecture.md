# Secrets-Dateiarchitektur

Dieses Dokument beschreibt die Dateitopologie, die Synchronisationsregeln und die kanonische Sektionsstruktur der Secret-Dateien in der Bachelorprojekt-Plattform.

## Datei-Topologie

| Datei | Status | Produziert | Referenziert von |
|---|---|---|---|
| `environments/.secrets/fleet-mentolder.yaml` | **Aktiv (Prod)** | `sealed-secrets/fleet-mentolder.yaml` | `environments/fleet-mentolder.yaml` |
| `environments/.secrets/fleet-korczewski.yaml` | **Aktiv (Prod)** | `sealed-secrets/fleet-korczewski.yaml` | `environments/fleet-korczewski.yaml` |

`environments/mentolder.yaml` und `environments/korczewski.yaml` haben **keine eigenen** Secret-Dateien
mehr. Sie tragen `secrets_env: fleet-<brand>`; `scripts/lib/secrets-env.sh` (`secrets_env_for`) leitet
`env:generate`, `env:seal`, `secret-rotate.sh`, `secrets:sync`, `workspace:deploy` und die
GHCR-Token-Abfragen damit auf die fleet-Dateien um (T900789). Die frueheren Legacy-Dateien waren mit
dem fleet-Cert gesealt und inhaltlich veraltet; ein Break-glass-Deploy mit `ENV=mentolder` hat sie auf
den Prod-Cluster angewendet.

## Schema ↔ k3d/secrets.yaml (dev_absent)

`environments/schema.yaml` ist die autoritative Liste aller Secret-Namen. `k3d/secrets.yaml`
(`workspace-secrets`) ist die reine Dev-Belegung: sie trägt ausschließlich offensichtliche
Dev-Platzhalterwerte (Muster `dev-<key-in-lowercase>`), niemals echte Credentials.

- Bei Widerspruch gewinnt das Schema. Die einzige zulässige Abweichung ist eine **bewusste
  Abwesenheit** in Dev, annotiert als `dev_absent: true` + `dev_absent_reason: "<Begründung>"`
  direkt am Schema-Eintrag — nicht als Allowlist im Test, nicht in der Dev-Datei.
- `required: true` schließt `dev_absent` aus.
- Der Test `tests/unit/secrets-sync.bats` erzwingt beide Richtungen: jeden Schema-Key (außer
  `dev_absent`) in `k3d/secrets.yaml` UND keinen Orphan in der Gegenrichtung.
- Der Guard `tests/spec/secrets-deploy-automation/schema-dev-secrets-sync.bats` erzwingt, dass
  `dev_absent`-Annotationen eine nicht-leere Begründung tragen und dass die Legacy-Keycloak-Ära
  `*_OIDC_SECRET`-Altnamen nicht zurückkehren. [T003141]

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
9. Brett
10. Arena (korczewski only)
11. DB Connection Strings
12. SSH-Schlüssel
13. WireGuard-Mesh
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
