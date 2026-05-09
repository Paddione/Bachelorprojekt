#!/usr/bin/env python3
"""
Generate grouped Mermaid ER diagrams + normalization analysis from shared-db.

Requires: psql in PATH, port-forward running (task workspace:port-forward ENV=mentolder &)
Usage:
  python scripts/db-schema-diagram.py > docs/db-schema-diagram.md

Env vars:
  PG_HOST  (default: localhost)
  PG_PORT  (default: 5432)
  PG_USER  (default: postgres)
"""

import csv, io, os, subprocess, sys
from collections import defaultdict

PG_HOST = os.environ.get("PG_HOST", "localhost")
PG_PORT = os.environ.get("PG_PORT", "5432")
PG_USER = os.environ.get("PG_USER", "postgres")


def psql(database: str, query: str) -> list[dict]:
    try:
        result = subprocess.run(
            [
                "psql",
                f"--host={PG_HOST}", f"--port={PG_PORT}", f"--username={PG_USER}",
                f"--dbname={database}",
                "--csv", "--no-psqlrc", "--command", query,
            ],
            capture_output=True, text=True,
            timeout=30,
            env={**os.environ, "PGPASSWORD": os.environ.get("PGPASSWORD", "")},
        )
    except subprocess.TimeoutExpired:
        print(f"[psql timeout on {database}]", file=sys.stderr)
        return []
    if result.returncode != 0:
        print(f"[psql error on {database}]: {result.stderr}", file=sys.stderr)
        return []
    reader = csv.DictReader(io.StringIO(result.stdout))
    return list(reader)


def psql_multi(database: str, queries: list[str]) -> list[list[dict]]:
    """Run multiple queries in a single psql connection (avoids TCP reconnect resets)."""
    SENTINEL = "---RESULT_BOUNDARY---"
    # Interleave a SELECT marker between queries so we can split the CSV output
    combined_args = [
        "psql",
        f"--host={PG_HOST}", f"--port={PG_PORT}", f"--username={PG_USER}",
        f"--dbname={database}",
        "--csv", "--no-psqlrc",
    ]
    for i, q in enumerate(queries):
        if i > 0:
            combined_args += ["--command", f"SELECT '{SENTINEL}' AS boundary"]
        combined_args += ["--command", q]
    try:
        result = subprocess.run(
            combined_args,
            capture_output=True, text=True,
            timeout=60,
            env={**os.environ, "PGPASSWORD": os.environ.get("PGPASSWORD", "")},
        )
    except subprocess.TimeoutExpired:
        print(f"[psql timeout on {database}]", file=sys.stderr)
        return [[] for _ in queries]
    if result.returncode != 0:
        print(f"[psql error on {database}]: {result.stderr}", file=sys.stderr)
        return [[] for _ in queries]

    # Split stdout on the sentinel CSV row (no quoting since value has no special chars)
    sections = result.stdout.split(f"boundary\n{SENTINEL}\n")
    results = []
    for i, section in enumerate(sections):
        if i < len(queries):
            reader = csv.DictReader(io.StringIO(section.strip() + "\n"))
            results.append(list(reader))
        else:
            results.append([])
    # Pad if fewer sections than queries
    while len(results) < len(queries):
        results.append([])
    return results


SCHEMA_QUERY = """
SELECT t.table_schema, t.table_name, c.column_name, c.data_type, c.is_nullable
FROM information_schema.tables t
JOIN information_schema.columns c
  ON t.table_schema = c.table_schema AND t.table_name = c.table_name
WHERE t.table_schema NOT IN ('pg_catalog','information_schema','pg_toast')
  AND t.table_type = 'BASE TABLE'
ORDER BY t.table_schema, t.table_name, c.ordinal_position
"""

FK_QUERY = """
SELECT DISTINCT
  tc.table_schema, tc.table_name, kcu.column_name,
  ccu.table_schema AS fk_schema, ccu.table_name AS fk_table
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON tc.constraint_name = ccu.constraint_name
     AND tc.constraint_schema = ccu.constraint_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema NOT IN ('pg_catalog','information_schema')
  AND NOT (ccu.table_schema = tc.table_schema AND ccu.table_name = tc.table_name)
"""

PK_QUERY = """
SELECT tc.table_schema, tc.table_name, kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
WHERE tc.constraint_type = 'PRIMARY KEY'
  AND tc.table_schema NOT IN ('pg_catalog','information_schema')
"""

DOMAINS: dict[str, dict[str, list[str]]] = {
    "CRM & Communication": {
        "public": [
            "customers", "meetings", "meeting_artifacts", "meeting_insights",
            "meeting_reminders", "transcripts", "transcript_segments",
            "message_threads", "messages", "chat_rooms", "chat_room_members",
            "chat_messages", "chat_message_reads", "client_notes",
            "onboarding_items", "time_entries",
        ],
    },
    "Billing & Accounting": {
        "public": [
            "billing_customers", "billing_invoices", "billing_invoice_line_items",
            "billing_invoice_payments", "billing_invoice_dunnings", "billing_nachweis",
            "billing_quotes", "billing_suppliers", "billing_audit_log",
            "eur_bookings", "supplier_invoices", "invoice_counters",
            "tax_mode_changes", "vat_id_validations", "assets",
        ],
    },
    "Questionnaire & Coaching": {
        "public": [
            "questionnaire_templates", "questionnaire_dimensions",
            "questionnaire_questions", "questionnaire_answer_options",
            "questionnaire_answers", "questionnaire_assignments",
            "questionnaire_assignment_scores", "questionnaire_test_evidence",
            "questionnaire_test_fixtures", "questionnaire_test_seed_registry",
            "questionnaire_test_status",
        ],
    },
    "Tickets & Issues": {
        "tickets": [
            "tickets", "ticket_activity", "ticket_comments", "ticket_attachments",
            "ticket_links", "ticket_tags", "ticket_watchers", "ticket_counters",
            "tags", "pr_events",
        ],
        "public": ["bug_tickets", "inbox_items"],
    },
    "Platform & Config": {
        "public": [
            "site_settings", "legal_pages", "leistungen_config", "referenzen_config",
            "service_config", "newsletter_subscribers", "newsletter_campaigns",
            "newsletter_send_log", "website_custom_sections", "admin_shortcuts",
            "free_time_windows", "web_sessions", "polls", "poll_answers",
            "brett_rooms", "brett_snapshots",
        ],
    },
    "Testing & CI": {
        "public": [
            "test_runs", "test_results", "systemtest_failure_outbox",
            "systemtest_magic_tokens", "playwright_reports",
        ],
    },
    "AI Assistant": {
        "public": [
            "assistant_conversations", "assistant_messages",
            "assistant_first_seen", "assistant_nudge_dismissals",
        ],
    },
    "Bachelorprojekt & Superpowers": {
        "bachelorprojekt": ["requirements", "features", "pipeline", "test_results"],
        "superpowers": ["plans", "plan_sections"],
    },
}

PG_TYPE_MAP = {
    "integer": "int",
    "bigint": "bigint",
    "smallint": "int",
    "text": "string",
    "character varying": "string",
    "character": "string",
    "boolean": "bool",
    "uuid": "uuid",
    "timestamp with time zone": "timestamp",
    "timestamp without time zone": "timestamp",
    "date": "date",
    "time without time zone": "time",
    "numeric": "decimal",
    "jsonb": "jsonb",
    "json": "json",
    "bytea": "bytes",
    "ARRAY": "array",
    "USER-DEFINED": "enum",
}

NORMALIZATION_FINDINGS = """
## Normalization Findings

| # | Severity | Table(s) | Issue | Recommendation |
|---|----------|----------|-------|----------------|
| 1 | **HIGH** | 20+ tables | `brand text` column with no FK — multi-tenant discriminator stored as raw text in every table (billing_invoices, tickets.tickets, bug_tickets, eur_bookings, assets, …) | Add a `brands` table; add `brand_id FK` or at minimum a CHECK constraint against known values |
| 2 | **HIGH** | `billing_invoices` | `paid_at`, `paid_amount` duplicated — payment state already tracked per-row in `billing_invoice_payments` | Remove `paid_at`/`paid_amount` from `billing_invoices`; derive via view from `billing_invoice_payments` |
| 3 | **MEDIUM** | `billing_invoices` | `dunning_level`, `last_dunning_at` duplicated — dunning state already in `billing_invoice_dunnings` | Remove denormalized dunning fields; derive `MAX(level)` from `billing_invoice_dunnings` |
| 4 | **MEDIUM** | `billing_invoices` | Five large blobs inline: `zugferd_xml`, `factur_x_xml`, `xrechnung_xml`, `pdf_blob`, `pdf_a3_blob` — bloats every row scan | Extract to `billing_invoice_documents(invoice_id, format text, blob bytea)` |
| 5 | **HIGH** | `meetings`, `questionnaire_assignments`, `time_entries` | `project_id uuid FK` declared but target `projects` table does not exist anywhere in the DB | Create a `projects` table, or drop the dangling FK constraint |
| 6 | **MEDIUM** | `questionnaire_assignment_scores` | `dimension_name text` denormalized — the name is already available via `questionnaire_dimensions.name` through the existing FK | Remove the column; JOIN at read time |
| 7 | **MEDIUM** | `billing_customers` vs `customers` | Two customer tables with no FK link — a CRM customer who becomes a billing customer is not connected | Add `customers_id uuid FK → customers.id` to `billing_customers`, nullable for pure-billing entities |
| 8 | **HIGH** | `bachelorprojekt.features` vs `tickets.pr_events` | Near-duplicate tables — both store GitHub PR merge events with almost identical columns (pr_number, title, description, category, scope, brand, merged_at, merged_by, status) | Designate one as canonical source and drop or make the other a view |
| 9 | **LOW** | `chat_messages` | `sender_name text` stored per-message — display name drift possible over time | Remove; JOIN to `customers.name` at read time, or document as intentional historical snapshot |
| 10 | **MEDIUM** | `inbox_items` | `reference_table text` + `reference_id text` — polymorphic FK not enforced by the DB | Replace with typed FK columns per entity type, or add a CHECK on `reference_table` |
| 11 | **LOW** | `billing_customers`, `billing_suppliers` | `land_iso` is `text` in billing_customers but `character(2)` in billing_suppliers — same concept, inconsistent types | Normalize to `character(2)` on both |
| 12 | **MEDIUM** | `public.bug_tickets` vs `tickets.tickets` | Same concept (ticket), separate tables, incompatible PK types (`text` vs `uuid`), no cross-reference | Migrate `bug_tickets` into `tickets.tickets` with `type = 'bug'`, or add a `tickets_id uuid FK` |
| 13 | **LOW** | `meeting_reminders` | No FK to `meetings`; `meeting_start` is a bare timestamp copy — can drift | Add `meeting_id uuid FK → meetings.id` |
| 14 | **LOW** | `ticket_activity.actor_id`, `ticket_attachments.uploaded_by`, `messages.sender_id` | Polymorphic UUID fields pointing at users with no FK — referential integrity not enforced | Add a `users` view or table as FK target, or document the convention |
"""


def safe_name(schema: str, table: str) -> str:
    return f"{schema}__{table}" if schema != "public" else table


def pg_type(data_type: str) -> str:
    import re
    return PG_TYPE_MAP.get(data_type, re.sub(r'[^A-Za-z0-9_]', '_', data_type[:12]))


def build_mermaid_block(
    domain_tables: dict[str, list[str]],
    all_cols: dict[tuple, list],
    all_pks: dict[tuple, set],
    all_fks: list[dict],
) -> str:
    domain_set = {
        (schema, table)
        for schema, tables in domain_tables.items()
        for table in tables
    }

    fk_cols_by_table: dict[tuple, set] = defaultdict(set)
    for fk in all_fks:
        key = (fk["table_schema"], fk["table_name"])
        if key in domain_set:
            fk_cols_by_table[key].add(fk["column_name"])

    lines = ["```mermaid", "erDiagram"]

    for schema, table in sorted(domain_set):
        cols = all_cols.get((schema, table), [])
        if not cols:
            print(f"[warn] {schema}.{table} not found in DB — skipped", file=sys.stderr)
            continue
        pk_cols = all_pks.get((schema, table), set())
        fk_col_set = fk_cols_by_table.get((schema, table), set())
        sname = safe_name(schema, table)
        lines.append(f"  {sname} {{")
        for col in cols:
            ctype = pg_type(col["data_type"])
            cname = col["column_name"]
            ann = ""
            if cname in pk_cols:
                ann = " PK"
            elif cname in fk_col_set:
                ann = " FK"
            lines.append(f"    {ctype} {cname}{ann}")
        lines.append("  }")

    for fk in all_fks:
        src = (fk["table_schema"], fk["table_name"])
        tgt = (fk["fk_schema"], fk["fk_table"])
        if src in domain_set and tgt in domain_set:
            src_n = safe_name(*src)
            tgt_n = safe_name(*tgt)
            lines.append(f'  {tgt_n} ||--o{{ {src_n} : ""')

    lines.append("```")
    return "\n".join(lines)


def fetch_all(databases: list[str]) -> tuple[dict, dict, list]:
    all_cols: dict[tuple, list] = {}
    all_pks: dict[tuple, set] = defaultdict(set)
    all_fks: list[dict] = []

    for db in databases:
        schema_rows, fk_rows, pk_rows = psql_multi(db, [SCHEMA_QUERY, FK_QUERY, PK_QUERY])
        for row in schema_rows:
            key = (row["table_schema"], row["table_name"])
            all_cols.setdefault(key, []).append(row)
        for row in fk_rows:
            all_fks.append(row)
        for row in pk_rows:
            key = (row["table_schema"], row["table_name"])
            all_pks[key].add(row["column_name"])

    return all_cols, all_pks, all_fks


def main() -> None:
    # website DB holds public/tickets/superpowers schemas
    # postgres DB holds bachelorprojekt schema
    all_cols, all_pks, all_fks = fetch_all(["website", "postgres"])

    total_tables = len(all_cols)

    print("# Shared DB — Schema Reference & Normalization Audit")
    print()
    print("> Generated by `scripts/db-schema-diagram.py`.")
    print("> Re-run: `task db:diagram ENV=mentolder`")
    print()
    print(f"**{total_tables} tables** across `website` and `postgres` databases, "
          "organized into 8 domains.")
    print()
    print("**Jump to domain:**")
    for domain in DOMAINS:
        anchor = domain.lower().replace(" ", "-").replace("&", "").replace("--", "-")
        print(f"- [{domain}](#{anchor})")
    print()

    for domain_name, domain_tables in DOMAINS.items():
        print(f"## {domain_name}")
        print()
        print(build_mermaid_block(domain_tables, all_cols, all_pks, all_fks))
        print()

    print(NORMALIZATION_FINDINGS)


if __name__ == "__main__":
    main()
