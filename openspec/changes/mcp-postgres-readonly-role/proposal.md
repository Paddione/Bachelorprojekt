# Proposal: mcp-postgres-readonly-role

## Why

Security-Review-Befund (2026-08-15, T006335): Der lokale MCP-Postgres-Adapter
`scripts/mcp-gateway/mcp-postgres-local.mjs` schützt die Datenbank ausschließlich mit zwei
textuellen Guards — einem Prefix-Guard (`SELECT`/`WITH`/`EXPLAIN`, Z. 160-164) und einem
handgeschriebenen Multi-Statement-Lexer ohne Dollar-Quoting-/E-String-/nested-Kommentar-Support
(Z. 166-172). Beide sind umgehbar:

- `WITH x AS (DELETE FROM … RETURNING *) SELECT * FROM x` beginnt mit `WITH` und führt eine
  Löschung aus (data-modifying CTE).
- `EXPLAIN ANALYZE DELETE FROM …` beginnt mit `EXPLAIN` und führt die Löschung real aus
  (ANALYZE führt aus).

Verschärfung: Die Default-`DB_URL` ist `postgresql://postgres@localhost:15432/website` — ein
Bypass schreibt als Superuser. Die Verbindung ist per trust-Auth passwortlos, und
`transaction_read_only` ist `off`. Der Server lauscht unauthentifiziert auf `127.0.0.1:13001`.

Beide Bypass-Pfade wurden am 2026-08-15 empirisch gegen den laufenden Adapter und die
k3d-Dev-DB verifiziert (Scratch-Tabelle, DELETE real ausgeführt und per RETURNING
zurückgegeben; EXPLAIN-ANALYZE-Plan zeigt `Delete on … rows=2`).

## What

1. **Harte Grenze auf Datenbank-Ebene:** Readonly-Rolle `mcp_readonly` (LOGIN, NOSUPERUSER,
   Mitglied von `pg_read_all_data`, `default_transaction_read_only=on`), idempotent
   provisioniert in `k3d/shared-db.yaml` (initdb-Skript + postStart-Self-Heal). Destruktive
   Statements scheitern dann auch bei Parser-Bypass am DBMS mit "cannot execute … in a
   read-only transaction". Kein Passwort nötig: Dev-Cluster authentifiziert per trust
   (passwortlos), Prod erhält die Rolle als inertes Objekt ohne Authentifizierungsweg.
2. **Text-Guard härten (Defense in Depth):** Default-`DB_URL` auf `mcp_readonly` umstellen;
   den bestehenden Lexer um Dollar-Quoting, E-String-Escapes und nested Block-Kommentare
   erweitern; den Prefix-Guard durch einen ersten-Keyword-Check ersetzen und für
   `WITH`/`EXPLAIN`-Statements einen Mutations-Keyword-Scan einführen (INSERT/UPDATE/DELETE/
   MERGE/TRUNCATE/CREATE/DROP/ALTER/GRANT/REVOKE/CALL/DO/COPY/VACUUM/REFRESH/SECURITY
   außerhalb von Strings/Kommentaren → Ablehnung vor DB-Ausführung).
3. **Rot-grün-Absicherung:** BATS-Tests in `tests/spec/mcp-gateway/mcp-postgres-readonly-role.bats`,
   die beide Bypass-Pfade gegen den echten Adapter reproduzieren (mit Dev-DB) bzw. den
   Pre-DB-Ablehnungspfad (CI-sicher ohne DB), plus Rolll-Property-Check.

_Ticket: T006335_
