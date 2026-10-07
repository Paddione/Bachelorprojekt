# p3 — UPDATE-Grant für llm_proxy_request_log

Target files: `scripts/migrations/2026-08-10-llm-proxy-request-log.sql`. Design: `design.md` RC5, D4.
Keine anderen Dateien ändern.

### Task 1: Grant erweitern

Ist:

```sql
    -- factory_psql verbindet als `website` (scripts/factory/lib.sh).
    GRANT SELECT, INSERT, DELETE ON tickets.llm_proxy_request_log TO website;
```

Soll:

```sql
    -- factory_psql verbindet als `website` (scripts/factory/lib.sh).
    -- UPDATE braucht llm-proxy-log-retention (Bodies nach 7 Tagen auf NULL) [T900806].
    GRANT SELECT, INSERT, UPDATE, DELETE ON tickets.llm_proxy_request_log TO website;
```

Die Migration ist idempotent (`GRANT` ist wiederholbar), ein erneuter Lauf auf Prod ändert nichts,
dort hat `website` das Recht bereits.

### Prüfung

```bash
tests/unit/lib/bats-core/bin/bats -f 'UPDATE' tests/spec/staging-stack-repair.bats   # ok
```

Das Einspielen gegen Staging gehört zur Live-Reparatur in `tasks.md`, nicht zu diesem Partial.
