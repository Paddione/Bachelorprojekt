# DB09 + E2E01 Investigation

**Ziel:** G-DB09 von 1 auf 0, G-E2E01 von 0% auf ≥90%.

## Violations

| Gate | Messwert | Ziel | Problem |
|------|----------|------|---------|
| G-DB09 | 1 | ≤0 | Eine Slow Query in pg_stat_statements (exkl. COPY + CREATE INDEX) |
| G-E2E01 | 0% | ≥90% | Nightly E2E-Workflow 14/14 Läufe rot |

## Vorgehen

### DB09: Slow Query identifizieren
Die Query in pg_stat_statements mit mean_exec_time > 1s identifizieren, entscheiden ob:
- Applikations-Query → optimieren oder Ticket erstellen
- DDL/Maintenance → in Mess-Ausschluss aufnehmen

### E2E01: Root Cause finden
Letzte 14 e2e.yml Läufe prüfen, Fehlerlogs analysieren.
Fix-Branch `fix/e2e-auth-token-and-cron-secret` prüfen — wurde gemerged?
