---
title: "fix-knowledge-ingest-zero-items-T002605 — Implementation Plan"
ticket_id: T002605
domains: [infra, db, test]
status: active
partials: 3
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# fix-knowledge-ingest-zero-items-T002605 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alle Knowledge-Ingest-CronJobs embedden wieder echte Items. Die
Quell-Legacy-Tabellen (`bachelorprojekt.features`, `bugs.bug_tickets`,
`tickets.pr_events`) sind nachweislich leer/nie befüllt — die CronJobs sind
nicht kaputt, die Quellen sind leer (Evidenz: `pg_stat_user_tables` n_tup_ins=0
für alle drei, gemessen 2026-08-04 auf fleet). Der Fix liest die **lebenden**
Quellen (`tickets.tickets` für Bugs, `tickets.ticket_links` JOIN
`tickets.tickets` für PRs), ergänzt einen Zero-Item-Guard (Warnung + Exit 1
bei 0 Treffern trotz befülltem Live-Store — behebt die stille-grüne
Fehlerklasse), suspendiert den Markdown-CronJob (bewusst lokal-only) und
konvergiert die beiden Script-Kopien (lokal + ConfigMap).

**Architecture:** p1 (Diagnose) verifiziert die gemessene Evidenz im Cluster
und entscheidet belegt über Bug-Typ-Filter (D2: `type IN ('bug','fix')`),
PR-Quelle (D3: ticket_links-Join, da `tickets.pr_events` keinen Schreiber hat)
und Markdown (D4: suspendieren + dokumentieren). p2 (Fix) ändert die beiden
Ingest-Scripts in **beiden Kopien** (ConfigMap in
`k3d/knowledge-ingest-cronjob.yaml` + lokale `scripts/knowledge/*.mjs`) auf die
Live-Quellen, baut den Zero-Item-Guard ein und suspendiert den
Markdown-CronJob. p3 (Tests) legt die neue BATS-Suite an, die den Zielzustand
absichert (Live-Quellen statt Legacy-Tabellen, Guard-Logik, Suspend-Flag) und
den RED→GREEN-Zyklus dokumentiert.

**Tech Stack:** Node.js (ESM, `pg`), Kubernetes-Manifeste (Kustomize), BATS,
PostgreSQL (fleet-shared-db, ns `workspace`).

## Global Constraints

- **Diagnose-Gate (T002448-M5):** p1 MUSS abgeschlossen sein und seine
  Entscheidungen (D2–D4) als Ticket-Kommentar protokolliert haben, bevor p2
  implementiert. Die Entscheidungen des Gates sind bindend für p2.
- **Beide Kopien synchron ändern:** Jede Änderung an Ingest-Scripts betrifft
  die ConfigMap-Kopie (`k3d/knowledge-ingest-cronjob.yaml`, `data:`-Block) UND
  die lokale Kopie (`scripts/knowledge/*.mjs`). Die BATS-Suite prüft die
  ConfigMap-Kopie via `kubectl kustomize k3d`; p3 prüft zusätzlich die lokale
  Kopie per grep.
- Keine Brand-Domain-Literale (`*.mentolder.de`/`*.korczewski.de`) in
  Code-Snippets — nur Cluster-DNS-Namen und Env-Variablen.
- Kein Zeitfenster-Filter einführen (die Queries sind Voll-Scans — der
  Upsert ist idempotent via `source_uri`-ON-CONFLICT).
- Bestehende Tests `tests/unit/knowledge-ingest-{manifest,schema,bugs-schema}.bats`
  müssen grün bleiben (keine nicht-existenten Spalten in den SELECTs).
- Die `website/src/data/openspec-status.json`-Änderung (frische Gen-Artifakte)
  wird mitcommittet, damit `task freshness:check` grün bleibt.

---

## File Structure

| Datei | Ist-Zeilen | Wirksames S1-Budget | Änderung |
|---|---:|---:|---|
| `k3d/knowledge-ingest-cronjob.yaml` | 551 | kein S1-Limit für `.yaml` | ConfigMap-Scripts (`ingest-bug-tickets.mjs`, `ingest-prs.mjs`) auf Live-Quellen + Guard; Markdown-CronJob `spec.suspend: true` + Kommentar |
| `scripts/knowledge/ingest-bug-tickets.mjs` | 68 | 800 (`.mjs`) | Query auf `tickets.tickets` + `fixed_in_pr`-Subquery + Zero-Item-Guard |
| `scripts/knowledge/ingest-prs.mjs` | 65 | 800 (`.mjs`) | Query auf ticket_links-Join + Zero-Item-Guard |
| `scripts/knowledge/lib-knowledge-pg.mjs` | 166 | 800 (`.mjs`) | Guard-Helfer (nur falls dort zentralisiert) |
| `tests/spec/llm-pipeline/knowledge-ingest-live-sources.bats` | neu | — | BATS-Suite (Live-Quellen, Guard, Suspend) |

Kein S1-Budget wird überschritten — alle betroffenen Dateien bleiben weit
unter ihrer Schwelle (Netto-Änderung niedrige zweistellige Zeilenzahl).

## Partials

| # | Pfad | Rolle | Targets | Deps |
|---|------|-------|---------|------|
| p1 | `tasks.d/p1-diagnose.md` | impl | (diagnose-only) | |
| p2 | `tasks.d/p2-fix.md` | impl | `k3d/knowledge-ingest-cronjob.yaml`, `scripts/knowledge/ingest-bug-tickets.mjs`, `scripts/knowledge/ingest-prs.mjs`, `scripts/knowledge/lib-knowledge-pg.mjs` | p1 |
| p3 | `tasks.d/p3-tests.md` | tests | `tests/spec/llm-pipeline/knowledge-ingest-live-sources.bats` | p2 |

Partials sind disjoint: p1 ändert keine Dateien, p2 berührt nur Manifest +
Scripts, p3 nur die neue BATS-Datei. Die YAML-Datei kommt NUR in p2 vor. p3
ist die Test-Rolle und läuft als letztes Partial (der RED-Zustand der neuen
Suite ist gegen den Stand VOR p2 dokumentiert).

## Verification

- `bash scripts/openspec.sh validate` — OpenSpec-Struktur (vor Commit)
- `bash scripts/plan-lint.sh openspec/changes/fix-knowledge-ingest-zero-items-T002605/tasks.md` — Plan-Lint (vor Commit)
- p1: Evidenz-Queries liefern die dokumentierten Counts
  (features=0, bug_tickets=0, tickets.tickets>0, ticket_links mit pr_number>0)
- p2: `task workspace:validate` (Kustomize-Dry-Run) + `node --check` auf beide
  Script-Kopien; Zero-Item-Guard gegen Live-DB verifiziert (CronJob wird nach
  p2+Rollout rot statt grün, wenn Quelle leer bleibt — oder embeddet echte
  Items, wenn die Daten da sind)
- p3: `tests/spec/llm-pipeline/knowledge-ingest-live-sources.bats` rot vor p2,
  grün nach p2 (`expected: FAIL`-Schritt); danach die drei Pflicht-Gates:
  `task test:changed` + `task freshness:regenerate && task freshness:check`
  + `task workspace:validate`

## Out of Scope

- Befüllungs-Pipeline für `tickets.pr_events` (SDLC-Timeline/delivery-metrics —
  separates Thema; in p1 als Nachfolge-Vorschlag festgehalten)
- Website-SDLC-Stack, T002604-NetworkPolicy, bge-/Voyage-Embedding-Routing
  (T002570 gemergt)
- Datenmigration `bugs.bug_tickets` → `tickets.tickets` (bereits migriert;
  Legacy-Tabelle bleibt als leere Tabelle liegen — kein Leser mehr)

_Ticket: T002605_
