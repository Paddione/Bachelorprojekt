---
title: "mcp-postgres-readonly-role: Readonly-Rolle als harte Grenze"
ticket_id: T006335
domains: [security, infra, db, test]
status: plan_staged
---

# mcp-postgres-readonly-role — Implementation Plan

## File Structure

| Datei | Ist | Budget |
|---|---|---|
| `scripts/mcp-gateway/mcp-postgres-local.mjs` | 273 | 527 (Limit 800, nicht-baselined) |
| `k3d/shared-db.yaml` | 336 | nicht S1-geprüft (.yaml nicht gelistet) |
| `.claude/skills/references/mcp-tool-guide.md` | 293 | nicht S1-geprüft (.md nicht gelistet) |
| `tests/spec/mcp-gateway/mcp-postgres-readonly-role.bats` | 207 | neu, nicht S1-geprüft |
| `website/src/data/test-inventory.json` | generiert | regeneriert via `task test:inventory` |

Kontext: `scripts/mcp-gateway/mcp-postgres-local.mjs` ist der lokale MCP-Postgres-Adapter
(T002767); `k3d/shared-db.yaml` provisioniert die Dev- UND Prod-shared-db (k3d/ ist das
Basis-Manifest beider Pfade). Design und Root-Cause-Beleg: `design.md` (beide Bypass-Pfade
am 2026-08-15 empirisch ausgeführt).

## Task 1: RED-Beweis der umgehbaren Text-Guards

Status des RED-Tests dokumentieren, bevor Implementierung beginnt — der Test
`tests/spec/mcp-gateway/mcp-postgres-readonly-role.bats` wurde im Stage-Commit mitgeliefert
und muss im aktuellen Code rot sein.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/mcp-gateway/mcp-postgres-readonly-role.bats
# expected: FAIL — mindestens die CI-sicheren Tests 2+3 (Pre-DB-Ablehnungspfad)
# schlagen rot, weil `WITH x AS (DELETE …) SELECT …` und `EXPLAIN ANALYZE DELETE …`
# die Guards passieren und erst an der (toten) DB scheitern.
```

Begründung Rot: Die Aussage „destruktive Statements werden vor DB-Ausführung abgelehnt"
ist mit dem Ist-Code falsch — der Adapter reicht die Mutation an die DB weiter (im
Dev-Fall: führt sie als Superuser `postgres` aus).

## Task 2: Readonly-Rolle `mcp_readonly` provisionieren (harte Grenze)

Zieldatei: `k3d/shared-db.yaml`.

1. **initdb-ConfigMap `init-databases.sh`:** Im vorhandenen idempotenten `DO $$`-Block
   zusätzlich anlegen:
   ```sql
   IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'mcp_readonly')
   THEN CREATE ROLE mcp_readonly LOGIN NOSUPERUSER; END IF;
   ```
   Danach (außerhalb des DO-Blocks, idempotent):
   ```sql
   ALTER ROLE mcp_readonly SET default_transaction_read_only = on;
   ```
   Die `pg_read_all_data`-Mitgliedschaft per `GRANT pg_read_all_data TO mcp_readonly;`
   (idempotent: GRANT ist wiederholbar). **Kein Passwort** — Dev authentifiziert per
   trust (passwortlos, empirisch bestätigt), Prod erhält die Rolle als inertes Objekt
   ohne Authentifizierungsweg (bewusste Entscheidung aus `design.md`; kein Eingriff in
   schema.yaml/SealedSecrets/k3d-secrets.yaml).
2. **postStart-Self-Heal-Block** (läuft bei jedem Pod-Start, self-healend): denselben
   DO-Block + `ALTER ROLE` + `GRANT` als zusätzliche psql-Zeilen nach den bestehenden
   `ALTER USER`-Zeilen ergänzen — exakt im `$${VAR}`-Stil der Nachbarzeilen (T002306:
   Laufzeit-Variablen nicht anfassen, keine neuen envsubst-Namen einführen).
3. **Wirkungsnachweis (lokal, Dev-DB):**
   ```bash
   psql -X -A -t postgresql://postgres@localhost:15432/website \
     -c "SELECT rolname || '|' || rolcanlogin || '|' || rolsuper || '|' || coalesce(rolconfig::text,'') || '|' || pg_has_role('mcp_readonly','pg_read_all_data','member') FROM pg_roles WHERE rolname='mcp_readonly'"
   # erwartet: mcp_readonly|t|f|{default_transaction_read_only=on}|t
   ```
   (Nach Deployment des Dev-Clusters mit `task workspace:setup ENV=mentolder` bzw.
   kubectl apply des aktualisierten shared-db-Manifests + Pod-Neustart; lokale Dev-DB
   via Port-Forward :15432.)

## Task 3: Adapter-Guards härten (Defense in Depth)

Zieldatei: `scripts/mcp-gateway/mcp-postgres-local.mjs` (Ist 273, Budget 527).

1. **Default-Identität:** `DB_URL`-Default ändern von
   `postgresql://postgres@localhost:15432/website` auf
   `postgresql://mcp_readonly@localhost:15432/website`. Fail-closed: schlägt die
   Verbindung fehl (Rolle fehlt, Passwort-Auth-Host), antwortet der Adapter mit
   `Query failed`, nie mit stiller Superuser-Fortsetzung.
2. **Lexer erweitern** (Funktion `isMultiStatement` bzw. neuer gemeinsamer Tokenizer):
   - Dollar-Quoting: `$$…$$` und `$tag$…$tag$` (tag = [A-Za-z_][A-Za-z0-9_]*)
     als String-Literal überspringen.
   - E-String-Escapes: in `E'…'`/`e'…'` gilt `\'` als Escape — Backslash vor Quote
     nicht als String-Ende werten.
   - Nested Block-Kommentare: `/* /* */ */` korrekt schachteln (PG erlaubt
     Verschachtelung), nicht beim ersten `*/` schließen.
3. **Keyword-Guards** (ersetzt Prefix-Guard, nutzt denselben Tokenizer):
   - Erstes Keyword des Statements (nach führenden Kommentaren/Whitespace, via
     Tokenizer statt `trim().startsWith`) muss `SELECT`, `WITH` oder `EXPLAIN` sein —
     Ablehnung wie bisher, aber robust gegen führende Kommentare.
   - Für `WITH`- und `EXPLAIN`-Statements: Mutations-Keyword-Scan über alle Tokens
     außerhalb von Strings/Kommentaren/Quoted-Identifiers — Ablehnung (JSON-RPC-Fehler,
     `Only read-only queries…`) wenn eines aus
     `INSERT, UPDATE, DELETE, MERGE, TRUNCATE, CREATE, DROP, ALTER, GRANT, REVOKE,
     CALL, DO, COPY, VACUUM, REFRESH, SECURITY` als unquoted Token auftritt.
     Unquoted SQL-Keywords können in PG keine Bezeichner sein → keine False-Positives
     für `SELECT "delete" FROM t` oder `SELECT 'UPDATE'`.
   - `EXPLAIN ANALYZE SELECT` bleibt erlaubt (kein Mutations-Token im Statement).
4. **Multi-Statement-Guard beibehalten** (T006293-Regression vermeiden: bestehende
   Tests `tests/spec/mcp-gateway/mcp-postgres-multistatement.bats` müssen grün bleiben).

## Task 4: Tool-Guide-Dokumentation nachziehen

Zieldatei: `.claude/skills/references/mcp-tool-guide.md` — Abschnitt `mcp-postgres`
(Globale Invarianten):

- Read-only-Mechanik um die Rolle ergänzen: der lokale Adapter verbindet als
  `mcp_readonly` (LOGIN, NOSUPERUSER, `pg_read_all_data`, `default_transaction_read_only=on`),
  destruktive Statements scheitern am DBMS mit „cannot execute … in a read-only
  transaction" — zusätzlich zu den Pre-DB-Keyword-Guards.
- Keine neuen Brand-Domains/S3-Literale einführen; Formulierungen an bestehender
  Struktur orientieren.

## Task 5: GRÜN-Verifikation

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/mcp-gateway/mcp-postgres-readonly-role.bats
# expected: PASS (grün) — alle 4 Tests
tests/unit/lib/bats-core/bin/bats tests/spec/mcp-gateway/mcp-postgres-multistatement.bats
# expected: PASS — T006293-Regression verhindern
```

Zusätzlich die Positiv-Fälle stichprobenartig gegen den laufenden Dev-Adapter:
`SELECT 1 AS ok` liefert Zeilen, `EXPLAIN ANALYZE SELECT 1` liefert einen Query-Plan.

## Task 6: Finale Verifikation (CI-Gates)

```bash
task test:changed          # gezielte Tests für geänderte Domains
task freshness:regenerate  # generierte Artefakte aktualisieren (test-inventory, repo-index, …)
task freshness:check       # Freshness + quality:check (S1-S4-Ratchet) + Baseline-Assertion
```

- `task test:inventory` ist in `freshness:regenerate` enthalten — die neue BATS-Datei
  muss in `website/src/data/test-inventory.json` auftauchen (CI-Inventar-Check).
- Baseline darf nicht wachsen: keine neuen Einträge in `docs/code-quality/baseline.json`.
- Manifest-Änderung (shared-db.yaml): `task workspace:validate` ausführen.
