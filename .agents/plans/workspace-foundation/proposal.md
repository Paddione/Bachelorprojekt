# T901022 — Proposal (Brainstorming-Output)

## Problem

Geschützter Inhaber-Arbeitsbereich für das Massage-Business fehlt:
kein zentraler Guard, keine Owner-Rolle, keine Mandanten-Trennung in
Inbox-Daten, kein Business-Backup-Scope.

## Entscheidungen (2026-10-07, Chat-Brainstorming)

Groups-Claim-AuthZ · separater `/owner`-Bereich · Brand-Fundament jetzt
(Enforcement → T901035) · neue `business_memberships`-Tabelle ·
Seed-/Secrets-Flow erweitern · Backup-Scope + Restore-Demo.

## Partial-Skizze (Decompose in Phase C)

1. `p1-owner-auth` — Guard + Owner-Seiten + `me`-Endpoint (impl).
2. `p2-membership-data` — Migration + Membership-Modell + Inbox-Ref (impl).
3. `p3-secrets-backup` — Seed/Sealed-Secrets + Backup-Scope + Demo (impl).
4. `p4-tests` — Vitest + Spec-Guards + rot→grün-Step (tests, zuletzt).

## Risiken

T901035 noch blocked (depends_on) · `brands`-Bootstrap ungeklärt ·
kein Live-DB-Read in der Planung (Code-Reads nur) · Hold bis
Fragebogen/Hold-Review (Execute wartet).
