# Audit-Log Retention — DSGVO-Dokumentation

> Stand: 2026-06-17 | Scope: T000904 | Teams: security, db, ops

## Erfasste Aktionen

### Keycloak (realm-seitig, DB-Persistenz)
- Login-Events (erfolgreich + fehlgeschlagen)
- Admin-Events inkl. Details (Realm-Änderungen, Nutzerverwaltung)
- Einheitlich aktiviert über alle vier Realms (dev, base-prod, mentolder, korczewski)

### Admin-Backend (`audit.audit_log`, Tabelle in `website`-DB)
- Sicherheitsrelevante Admin-Aktionen (mutierend)
- Instrumentierte Endpoints:
  - `bug.reopen` / `bug.archive` — Bug-Ticket-Statusänderungen
  - `factory.control` — Werkssteuerung (Killswitch, Slot-/Daily-Caps, Dry-Run)
  - `customer.list` — Kundenlisten-Abruf
  - `deployment.list` — Deployment-Status-Abfrage
  - `brand_starter.read` — Brand-Starter-Template-Abruf

## Datenfelder (`audit.audit_log`)
| Feld         | Herkunft / Bedeutung                  |
|--------------|---------------------------------------|
| `id`         | Auto-increment (bigserial)            |
| `actor_id`   | Keycloak `sub` des handelnden Admins |
| `actor_email`| E-Mail des Admins (aus OIDC-Session)  |
| `action`     | Sprechender Verb-String (z.B. `factory.control`) |
| `target_type`| Kategorie des Zielobjekts (z.B. `bug`), optional |
| `target_id`  | ID des Zielobjekts (z.B. Ticket-ID), optional |
| `ip`         | Client-IP aus `x-forwarded-for` (Traefik), `inet`-Typ |
| `ts`         | Zeitstempel (default `now()`)         |
| `metadata`   | JSONB, optionale Zusatzinfo. **Muss secrets-frei sein.** |

## Retention

### Keycloak
- `eventsExpiration: 7776000` Sekunden = **90 Tage** (einheitlich über alle Realms)
- Keycloak löscht Events automatisch nach Ablauf der Retention

### `audit.audit_log`
- Retention: **90 Tage** (datenschutzkonform, DSGVO Art. 5(1)(e))
- Pruning-Mechanismus: idempotente SQL-Query (manuell oder via ensure-Script):
  ```sql
  DELETE FROM audit.audit_log WHERE ts < now() - interval '90 days';
  ```
- Kein eigener CronJob in diesem Scope. Wird als dokumentierte manuelle Maßnahme
  und/oder als ensure-Schema-Step bei nachfolgenden Deployments eingebaut.

## Datensparsamkeit (DSGVO Art. 5(1)(c))
- Nur **sicherheitsrelevante** Aktionen werden erfasst (kein flächendeckendes CRUD-Logging).
- `metadata`-Feld: **keine** Klartext-Secrets, Passwörter, Tokens oder personenbezogene
  Daten außer Identifier-Werten (z.B. Ticket-ID, Status-Name). Der Helper
  `recordAudit()` dokumentiert diese Einschränkung.
- Keine Erfassung von Kunden-Personendaten im Audit-Log.

## Out-of-scope
- **UI-Ansicht** (`/admin/audit` o.ä.) — separates Ticket, nicht in T000904.
- **Externe SIEM-Anbindung** — nicht in Scope.
- **CronJob zur automatischen Bereinigung** — folgt in späterem Ticket.

## Prüfpfad
- Der Audit-Trail ist über die Datenbank abfragbar (`SELECT * FROM audit.audit_log ORDER BY ts DESC`).
- Keycloak-Events sind in der Keycloak-DB einsehbar.
- Bei DSGVO-Auskunftsersuchen oder Sicherheitsvorfällen dient diese Tabelle als
  Nachweis, wer wann welche sicherheitsrelevante Aktion ausgeführt hat.
