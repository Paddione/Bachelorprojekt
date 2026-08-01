---
title: "mishap-categorize erden — Implementation Plan"
ticket_id: T002401
domains: [scripts]
status: active
parent_feature: T002397
---

# mishap-categorize erden

_Ticket: T002401_

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | mishap-categorize-kontext | impl | `scripts/mishap-categorize.sh` | — |
| p2 | tests | test | `tests/spec/mishap-categorize-erden.bats` | p1 |

### p1 — mishap-categorize-kontext

1. Bestehende Kategorien (Mishap-Tabelle aus DB oder Enum-Liste) vor LLM-Aufruf laden
2. Prompt um `[EXISTING_CATEGORIES]`-Block erweitern
3. Fallback: bei DB-Fehler Enum-Fallback-Liste nutzen

### p2 — tests

1. Test: Kategorie-Prompt enthält bestehende Einträge
2. Test: DB-Fehler → Enum-Fallback

**Files:** `scripts/mishap-categorize.sh`, `tests/spec/mishap-categorize-erden.bats`
