# Proposal: closure-identity-guard

## Why

Der Batch T015014 trug ein OpenSpec-Change mit einem `ticket_corroborates`-Design,
das nie implementiert wurde. Ausgeliefert wurde stattdessen (T015010, auf main)
der `identity_guard_blocks`-Guard in `scripts/factory/auto-close-merged.sh`
(UUID-Konsens mit Pre-Merge-Ankern). Der Draft-PR #5173 mit den Alt-Specs wurde
per Operator-Entscheidung 2026-08-23 verworfen (Branch archiviert unter
`refs/tags/reaped/fix/ticket-lifecycle-hardening-T015014`). Damit beschreibt die
SSOT `openspec/specs/software-factory.md` das gelieferte Closure-Verhalten nicht
— Spec-Drift nach Incident T015005 (ID-Reuse schloss das falsche Ticket).

## What

- Delta-Spec dokumentiert das **gelieferte** Design als ADDED Requirements am
  Parent `software-factory`: Anker-Quellen (`ticket_links kind='pr'`,
  `ticket_plans` branch/pr_number), UUID-Konsens statt external_id-Match,
  fail-closed-Entscheidungsfunktion, Guard-Platzierung (nach Terminal-Status-
  Check, vor Closure-Schreibzugriff), Skip-Meldung bei ID-Reuse-Verdacht.
- Gap-Analyse der bestehenden `tests/spec/software-factory/auto-close-uuid-guard.bats`
  (6 Tests, decken den gelieferten Kern bereits ab) und Ergänzung der beiden
  vom Spec-Text beschriebenen, aber ungetesteten Verhalten: Konsens-Kantfall
  (Match-Flag ohne Anker) und Terminal-Status-Präzedenz.
- **Nicht** Teil dieses Changes: Corroboration-Semantik (plan_ref-Branch ==
  PR-Head bzw. expliziter PR-Link vor Closure) — Operator-Entscheidung, bewusst
  ausgeklammert (T015670 Scope-Punkt 3). Die 5 Tests des verworfenen Branchs
  prüften ausschließlich diese nie ausgelieferte Funktion und bleiben obsolet.

_Ticket: T015670_
