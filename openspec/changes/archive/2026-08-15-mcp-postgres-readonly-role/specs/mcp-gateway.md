## MODIFIED Requirements

### Requirement: mcp-kubernetes und mcp-postgres laufen mit read-only Identität

The MCP gateway SHALL expose `mcp-kubernetes` and `mcp-postgres` under an identity that
cannot mutate the cluster or the database, and the documentation SHALL name this as
intended least privilege rather than as a defect. `mcp-kubernetes` runs in-cluster under
the ServiceAccount `claude-code-agent`, whose ClusterRole grants only `get`/`list`/`watch`.
`mcp-postgres` SHALL connect to PostgreSQL under the read-only database role `mcp_readonly`
(LOGIN, NOSUPERUSER, member of `pg_read_all_data`, `default_transaction_read_only=on`),
provisioned idempotently by the `shared-db` init script and its postStart self-heal block.
Destructive statements SHALL fail at the DBMS with "cannot execute … in a read-only
transaction" even if a statement-validation bypass reaches the database. Cluster mutations
and writing SQL — including `pods_exec`, `pods_run`, `ALTER USER`, `ALTER ROLE` and
`GRANT` — SHALL go through `kubectl` instead. The local adapter
`scripts/mcp-gateway/mcp-postgres-local.mjs` SHALL default to the `mcp_readonly` identity
and SHALL reject statements whose first keyword is not `SELECT`, `WITH` or `EXPLAIN`,
as well as `WITH`/`EXPLAIN` statements containing a data-modifying or schema-modifying
keyword token (INSERT/UPDATE/DELETE/MERGE/TRUNCATE/CREATE/DROP/ALTER/GRANT/REVOKE/CALL/DO/
COPY/VACUUM/REFRESH/SECURITY) outside of string literals and quoted identifiers, before
any database execution.

#### Scenario: ALTER ROLE über mcp-postgres schlägt erwartungsgemäß fehl

- **GIVEN** `mcp-postgres` verbindet als Rolle `mcp_readonly` mit
  `default_transaction_read_only=on`
- **WHEN** ein Agent `ALTER USER`, `ALTER ROLE` oder `GRANT` absetzt
- **THEN** antwortet PostgreSQL mit "cannot execute … in a read-only transaction", und der
  Tool-Guide weist diese Statements ausdrücklich dem `kubectl exec … psql`-Pfad zu

#### Scenario: Data-modifying CTE wird vom lokalen Adapter abgelehnt

- **GIVEN** der lokale Adapter `scripts/mcp-gateway/mcp-postgres-local.mjs` empfängt ein
  `WITH`-Statement
- **WHEN** das Statement eine Daten- oder Schema-Mutation enthält (z. B.
  `WITH x AS (DELETE FROM t RETURNING *) SELECT * FROM x`)
- **THEN** lehnt der Adapter es vor der DB-Ausführung mit einem JSON-RPC-Fehler ab, und die
  Mutation wird nicht ausgeführt

#### Scenario: EXPLAIN ANALYZE mit destruktivem Statement wird vom lokalen Adapter abgelehnt

- **GIVEN** der lokale Adapter empfängt ein `EXPLAIN ANALYZE`-Statement
- **WHEN** das analysierte Statement eine Mutation ist (z. B. `EXPLAIN ANALYZE DELETE FROM t`)
- **THEN** lehnt der Adapter es vor der DB-Ausführung ab — `EXPLAIN ANALYZE` mit reinem
  `SELECT` bleibt erlaubt

#### Scenario: mcp_readonly ist auf Datenbank-Ebene provisioniert

- **GIVEN** der `shared-db`-Pod startet (initdb oder postStart-Self-Heal)
- **WHEN** die Provisionierung läuft
- **THEN** existiert die Rolle `mcp_readonly` als LOGIN-Rolle ohne Superuser-Rechte, Mitglied
  von `pg_read_all_data`, mit `default_transaction_read_only=on`, und ist idempotent bei
  Wiederholung
