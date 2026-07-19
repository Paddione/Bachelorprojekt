## Why

Das live SealedSecret `workspace-secrets` (Namespace `workspace`, fleet-Cluster, mentolder-Brand) enthält für ALLE VIER DB-User-Passwörter die Dev-Platzhalter-Werte aus `k3d/secrets.yaml` statt der echten Prod-Werte aus `environments/.secrets/mentolder.yaml`. Dies hat am 2026-07-19 den Website-Login gebrochen (password authentication failed für user "website"), da `task workspace:sync-db-passwords` das falsche Passwort über `ALTER USER website WITH PASSWORD 'devwebsitedb'` gesetzt hat. Die Root-Cause wurde per git-blame auf Commit `5f2a1e86f` (T001610, pocket-id-db-init crashloop) identifiziert — beim initialen Befüllen des workspace-secrets SealedSecret wurden versehentlich die k3d-Dev-Werte statt der Prod-Werte versiegelt.

## What Changes

- Re-seal `workspace-secrets` in `environments/sealed-secrets/mentolder.yaml` mit den korrekten Prod-Werten aus `environments/.secrets/mentolder.yaml` für alle vier DB-Passwörter
- Koordinierte Anwendung: Secret-Update → DB ALTER USER → Pod-Restart in einem Wartungsfenster
- Nextcloud-Sonderfall: Passwort liegt zusätzlich in `config.php` auf der PVC und wird durch `workspace:sync-db-passwords` gepatcht
- Root-Cause-Dokumentation im Ticket

## Capabilities

### New Capabilities
- `secrets-drift-prevention`: Guard-Mechanismus, der verhindert, dass Dev-Werte in Prod-SealedSecrets gelangen

### Modified Capabilities
Keine spezifikationsrelevanten Requirement-Änderungen.

## Impact

- `environments/sealed-secrets/mentolder.yaml`: workspace-secrets Einträge werden neu versiegelt
- Namespace `workspace` (mentolder): alle vier DB-Rollen (pocket_id, nextcloud, vaultwarden, website) müssen synchronisiert werden
- `workspace:sync-db-passwords` Task: betroffen durch die ALTER USER-Logik
- `environments/.secrets/mentolder.yaml`: Source of Truth — wird nicht verändert, aber als solche bestätigt
- `k3d/secrets.yaml`: unverändert (Dev-Umgebung)
- Nextcloud `config.php` auf PVC: muss beim Sync mitgezogen werden
