# e2e-hydration-timeout — Delta-Spec

## Purpose

Dokumentiert das pre-existing Live-Site-Problem mit waitForHydration-Timeouts in FA-10 T5/T6 und definiert den Scope der Test-Fixes.

## ADDED Requirements

### Requirement: E2E-001 — Hydration-Timeouts werden toleriert

E2E-Tests müssen mit instabilen Hydration-Zeiten auf der Live-Site umgehen können.

**Scenarios:**

- GIVEN a page with slow hydration THEN the test MUST NOT fail with a waitForHydration timeout
- GIVEN a pre-existing live-site issue THEN the test MUST document the known issue
