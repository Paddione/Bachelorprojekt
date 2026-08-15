---
title: Design: mcp-postgres-readonly-role
ticket_id: T006335
domains: [website, infra, db, test, security]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Design: mcp-postgres-readonly-role

## Brainstorming-Ergebnis (2026-08-15, T006335)

### Root-Cause-Analyse (Symptom vs. Hypothese, T002448-M5)

**Symptom (Ticket, Review-Befund):** Text-Guards des lokalen mcp-postgres-Adapters sind per
data-modifying CTE und `EXPLAIN ANALYZE` umgehbar; DB-Identität ist Superuser `postgres`.

**Hypothese (Ticket):** Die Guards verstehen SQL-Semantik nicht; die DB-Ebene bietet keinen
Schutz, weil der Adapter mit Superuser-Rechten und `transaction_read_only=off` verbindet.

**Verifikation (empirisch, 2026-08-15, laufender Adapter + k3d-Dev-DB):**
- `WITH x AS (DELETE FROM public.__t006335_probe RETURNING id) SELECT id FROM x` → beide Zeilen
  gelöscht und zurückgegeben. Prefix-Guard (`WITH`) und Lexer (ein Statement) griffen nicht.
- `EXPLAIN ANALYZE DELETE FROM public.__t006335_probe` → ausgeführt (Plan `Delete on …
  rows=2`).
- `psql`-Probe: `current_user=postgres`, `transaction_read_only=off`, passwortlose trust-Auth;
  `pg_roles` enthält keine Readonly-Rolle.
- Scratch-Tabelle wurde angelegt, per Bypass geleert und wieder gelöscht — keine
  Datenbeeinträchtigung.

**Ursache belegt:** Die textuellen Guards sind kein Sicherheitsmechanismus, und die
DB-Identität hat volle Schreibrechte. Beide Teile müssen zusammen gefixt werden.

### Fix-Ansatz (Reviewer-Suggestion übernommen)

Zweischichtig:

1. **Harte Grenze — Readonly-Rolle `mcp_readonly` auf DB-Ebene.** Selbst bei Parser-Bypass
   scheitern destruktive Statements am DBMS. Konstruktion:
   - `CREATE ROLE mcp_readonly LOGIN NOSUPERUSER` + `GRANT pg_read_all_data TO mcp_readonly`
     (PG14+; deckt alle Schemas inkl. zukünftiger Tabellen ab, statt Schema-Enumeration +
     ALTER DEFAULT PRIVILEGES) + `ALTER ROLE mcp_readonly SET default_transaction_read_only
     = on` (rolconfig).
   - Provisionierung idempotent in `k3d/shared-db.yaml`: initdb-ConfigMap `init-databases.sh`
     UND postStart-Self-Heal-Block (dort läuft die Rolle auf jedem Pod-Start, self-healend
     wie die bestehenden Service-Rollen).
   - **Kein Passwort:** Dev-Cluster authentifiziert per trust (passwortlos — empirisch
     bestätigt); Prod erhält die Rolle als inertes Objekt ohne Authentifizierungsweg
     (sicherer als ein gesetztes Passwort). Kein Eingriff in schema.yaml / SealedSecrets /
     k3d/secrets.yaml.
   - `pg_read_all_data` gewährt SELECT/USAGE auf alle Tabellen/Sequenzen/Schemas — genau die
     Read-Identität, die der Adapter braucht (tickets, knowledge, v_timeline, …).

2. **Defense in Depth — Gateway härten.** Die Rolle ist das Sicherheitsnetz, der Parser die
   erste Schicht:
   - Default-`DB_URL` → `postgresql://mcp_readonly@localhost:15432/website`. Bei
     Passwort-Auth-Hosts schlägt die Verbindung laut fehl — fail-closed, kein stiller
     Superuser-Fallback.
   - Lexer erweitern: Dollar-Quoting (`$$…$$`, `$tag$…$tag$`), E-String-Backslash-Escapes,
     nested Block-Kommentare.
   - Prefix-Guard ersetzen durch ersten-Keyword-Check über den Lexer (führt auch über
     führende Kommentare/Whitespace).
   - Mutations-Keyword-Scan für `WITH`/`EXPLAIN`-Statements: INSERT/UPDATE/DELETE/MERGE/
     TRUNCATE/CREATE/DROP/ALTER/GRANT/REVOKE/CALL/DO/COPY/VACUUM/REFRESH/SECURITY als
     unquotierte Tokens außerhalb von Strings/Kommentaren → Ablehnung vor DB-Ausführung.
     Unquotierte SQL-Keywords können in PG keine Bezeichner sein — quoted Identifier
     (`"delete"`) und String-Literale (`'DELETE'`) werden vom Lexer übersprungen, keine
     False-Positives.

### Betroffene Subsysteme

| Subsystem | Datei | Änderung |
|---|---|---|
| Gateway | `scripts/mcp-gateway/mcp-postgres-local.mjs` | DB_URL-Default, Lexer-Härtung, Keyword-Guards |
| DB-Provisioning | `k3d/shared-db.yaml` | Rolle in initdb-Skript + postStart-Self-Heal |
| Spec | `openspec/specs/mcp-gateway.md` (Delta) | Readonly-Rolle als Identität dokumentieren |
| Docs | `.claude/skills/references/mcp-tool-guide.md` | Read-only-Mechanik (Rolle statt Transaktions-Wrapping) |
| Tests | `tests/spec/mcp-gateway/mcp-postgres-readonly-role.bats` | Rot-grün |

### Edge-Cases

- **`EXPLAIN ANALYZE SELECT`** bleibt erlaubt (kein Mutations-Keyword im Statement) — legitime
  Query-Pläne funktionieren weiter.
- **Quoted Identifier / Strings mit Keyword-Wörtern:** vom Lexer übersprungen (`"delete"`,
  `'INSERT'`, Dollar-Quoted Bodies) — kein False-Positive-Reject.
- **`COPY … TO PROGRAM`:** erfordert Superuser — mit `mcp_readonly` (NOSUPERUSER) scheitert es
  am DBMS, unabhängig vom Text-Guard.
- **statement_timeout (120 s):** DoS via `pg_sleep` bleibt begrenzt; kein Datenrisiko.
- **Rolle fehlt (noch nicht re-provisioniert):** Adapter-Verbindung schlägt fehl — Fail-closed,
  kein stiller Fallback auf `postgres`.
- **Test-Sicherheit in der Rotphase:** Der RED-Test operiert ausschließlich auf einer eigenen
  Scratch-Tabelle (per psql als postgres angelegt und im teardown gelöscht) — die ausgeführte
  DELETE trifft keine Bestandsdaten.

### Verworfen (bewusst)

- **Nur Parser verbessern, ohne DB-Rolle** — verworfen: Parser-Bypasses sind unvermeidbar
  (die SQL-Grammatik ist zu reich); die DB-Rolle ist das eigentliche Sicherheitsnetz
  (Ticket-Vorgabe).
- **npm-Parser-Dependency (`pgsql-ast-parser`)** — verworfen: der Adapter ist dependency-frei
  (nur `pg`); die Lexer-Erweiterung (~30 Zeilen) erreicht das Ziel ohne neue
  Laufzeit-Abhängigkeit.
- **Passwortgeschützte Rolle via workspace-secrets** — verworfen: zieht schema.yaml,
  SealedSecrets beider Brands und Rotation in den Scope; dev nutzt trust, prod braucht keinen
  Zugang — die Rolle ist ohne Passwort im Dev nutzbar und im Prod inert.
