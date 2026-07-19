## Context

Das SealedSecret `workspace-secrets` im Namespace `workspace` (fleet-Cluster, mentolder) enthält für vier DB-User-Passwörter die Dev-Platzhalter-Werte aus `k3d/secrets.yaml` statt der echten Prod-Werte aus `environments/.secrets/mentolder.yaml`. Root-Cause: Commit `5f2a1e86f` (T001610, 2026-07-09) hat beim initialen Befüllen des workspace-secrets die falschen Werte versiegelt — vermutlich weil `k3d/secrets.yaml` als Quelle diente statt `.secrets/mentolder.yaml`.

Betroffene Secrets:
| Secret Key | Falscher Live-Wert | Korrekter Prod-Wert |
|---|---|---|
| POCKET_ID_DB_PASSWORD | devpocketiddb | 5kEIu8m59IwmwNbqxnc2AimZ8og2CxyX |
| NEXTCLOUD_DB_PASSWORD | devnextclouddb | 556434572611e196d5790ff31781f16c |
| VAULTWARDEN_DB_PASSWORD | devvaultwardendb | JWFPyLLpEYSkTQAYTLiuxoBFjXnElHIE |
| WEBSITE_DB_PASSWORD | devwebsitedb | 32scWW79HVwE1THXiiT32Aa |

## Goals / Non-Goals

**Goals:**
- Alle vier DB-Passwörter in workspace-secrets auf korrekte Prod-Werte setzen
- DB-Rollen (ALTER USER) synchronisieren
- Pods neu starten, damit Apps die korrekten Passwörter verwenden
- Nextcloud config.php auf PVC mitziehen
- Kein Service-Out-of-Service während des Wartungsfensters

**Non-Goals:**
- Korczewski-Brand ist nicht betroffen (separate Secrets)
- Kein Refactoring des Secrets-Workflows
- Keine Änderung an k3d/secrets.yaml

## Decisions

1. **`task env:seal ENV=mentolder` root ausführen** — erzeugt korrekte SealedSecrets aus `.secrets/mentolder.yaml`
2. **Alle vier DB-Passwörter im selben Commit fixen** — atomarer Fix, keine Serialisierung nötig
3. **kein neuer Guard-Mechanismus** — root cause ist bekannt (initialer Fehler, kein Prozess-Problem), Risiko wird in T001961 dokumentiert
4. **Wartungsfenster nicht nötig** — die Reihenfolge secret-update → sync-db-passwords → rollout-restart kann durch `task secrets:sync:full ENV=mentolder` in ~60s durchlaufen

## Risks / Trade-offs

- **[Risk] Unterbrechung während sync-db-passwords**: die ALTER USER-Befehle trennen bestehende Verbindungen nicht sofort (Postgres parkt sie). Website hat eine 30s Connection-Pool-Timeout — Request-Drops möglich aber kurz (2-3 Requests). → Mitigation: außerhalb der Geschäftszeiten deployen.
- **[Risk] Nextcloud config.php ohne Sync**: `workspace:sync-db-passwords` patcht config.php bereits (siehe `sync_nextcloud_config_php` im Script). → Keine zusätzliche Action nötig.
- **[Risk] Rollback**: die alten dev-Werte sind nicht decryptbar (SealedSecret). Falls der Fix Probleme macht: `kubectl edit secret workspace-secrets` und manuell die dev-Werte als plaintext setzen, dann rollout restart.
