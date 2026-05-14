"""Single source of truth for the (schema, table) → domain mapping.

Both scripts/build_datamodel.py and scripts/db-schema-diagram.py read from here.
Keep this file the canonical reference — never let either consumer add new
domain mappings inline.
"""
from __future__ import annotations

import re

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


def table_to_domain(schema: str, table: str) -> str | None:
    """Return the domain label for a given schema.table, or None if unmapped."""
    for domain_label, schemas in DOMAINS.items():
        if table in schemas.get(schema, []):
            return domain_label
    return None


def domain_slug(label: str) -> str:
    """Stable slug from a domain label — used for IDs in the rendered HTML."""
    s = label.lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s
