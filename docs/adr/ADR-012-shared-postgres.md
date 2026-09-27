# ADR-012: Eine Shared-PostgreSQL-Instanz (shared-db) für alle Services

**Status:** Accepted
**Datum:** 2026-09-27
**Ticket:** T900560 (extrahiert aus `openspec/specs/database.md`, C7a)

## Kontext

Alle Plattform-Services brauchen relationale Persistenz; mehrere (Brain,
Tickets, Tracking) zusätzlich Vektor-Suche via pgvector. Alternativen waren
eine Postgres-Instanz pro Service (Betriebs-Overhead: N Backups, N Upgrades,
N Mal pgvector) oder ein gemanagter Extern-Dienst (Kosten, Latenz, DSGVO-Fläche).
Der Fleet-Cluster fährt ohnehin alles selbst — eine geteilte Instanz ist der
konsistente Schritt.

## Entscheidung

Genau eine PostgreSQL-Instanz (`pgvector/pgvector:0.8.0-pg16`, Deployment
`shared-db` im Namespace `workspace`) bedient alle Services:

- Logisch getrennte Datenbanken pro Service (plus Brand-Trennung
  mentolder/korczewski per Datenbank, nicht per Instanz).
- Self-Healing `initdb` (Rollen/Datenbanken bei Pod-Restart), expliziter
  Migration-Runner, TLS für alle Verbindungen.
- Tägliche verschlüsselte Backups mit Integritätsverifikation.
- pgvector-Extension global verfügbar (semantische Suche ohne Sonder-DB).

## Konsequenzen

**Positive Konsequenzen:**
- Ein Backup-Ziel, ein Upgrade-Pfad, ein Monitoring-Punkt.
- Neue Services bekommen Persistenz + Vektoren per Datenbank statt per Deployment.

**Negative Konsequenzen:**
- Geteilter Blast-Radius: Instanz-Ausfall trifft alle Services gleichzeitig
  (Mitigation: Backups + Restore-Verifikation, kein HA-Setup).
- Noisy-Neighbor-Risiko zwischen Services (bislang kein produktives Problem;
  bei Bedarf Resource-Quotas oder Auslagerung einzelner DBs).
- Schema-Änderungen laufen über den zentralen Runner — kein Service verwaltet
  sein Schema autonom.
