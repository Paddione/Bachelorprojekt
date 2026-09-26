---
ticket_id: null
plan_ref: null
status: active
date: 2026-09-26
---

# Design: K1-CI-Embeds merge-getrieben (Change 2/6)

Epic T900447, Change-Ticket T900449, ADR-009 Punkt 2. K1 wird Roh-Recall-Schicht:
jeder Merge nach main bettet inkrementell ein, was sich geändert hat — Code UND
Specs (`openspec/specs/*.md`) UND Docs. Schließt die vermessene Lücke (Hooks
inaktiv, `.md` abgewiesen, Specs nie eingebettet).

## Ziele

- Merge-getriebene Embeds ohne manuellen Lauf: CI triggert, In-Cluster-Job
  arbeitet (bge + pgvector cluster-lokal).
- Specs/Docs-Pfad: `openspec/specs/*.md` + Docs landen in `knowledge.*`
  (neue Sources), Code bleibt bei `index-repo.ts` → `code_embeddings`.
- Chunking-Konsolidierung: ein Modul (`scripts/lib/scs-chunking.ts` + neuer
  Markdown-Support), `openspec-embed.mjs` wechselt darauf; Changes-Corpus wird
  neu eingebettet (Migration, batched, resumable).
- Frische-Kriterium messbar im Plan (Ticket-Forderung).

## Nicht-Ziele

- Keine Tabellen-Vereinheitlichung: `code_embeddings` vs. `knowledge.*` bleiben
  (Reader-Verträge `codesearch-db.ts`, `knowledge-db` u.a. unangetastet).
- Kein Voyage, kein CI-lokales Modell, kein Port-Forward-Dauerbetrieb
  (Fail-Closed-Doktrin aus `llm-pipeline.md` bleibt gewahrt).
- Kein Graph-Refresh (3/6), kein Wiki-Eingriff (4/6).
- Keine neuen Brand-Domains, keine Prod-Laufzeitänderung außer dem Job.

## Entscheidungen (Brainstorming 2026-09-26)

- E1: In-Cluster-Job, getriggert aus CI per `FLEET_KUBECONFIG` (Muster in 6
  Workflows etabliert). CI-Runner bleiben dünn (Trigger + Diff, kein Modell,
  keine DB).
- E2: Chunking wird in 2/6 konsolidiert (gegen die schlanke Empfehlung):
  kanonisch `scs-chunking.ts`, Markdown-Support dort ergänzt, `openspec-embed.mjs`
  migriert. Voll-Reindex des Prosa-Corpus inklusive.
- E3: Specs/Docs via `openspec-embed.mjs` → `knowledge.*` (Prosa-Pipeline);
  `index-repo.ts` bleibt Code-only. Code-Vektoren ändern sich nicht (kein
  Code-Reindex nötig, `file_hash`-Skip greift).
- E4: Erster Lauf Voll-Reindex (resumable), danach Diff-inkrementell pro Push
  (Muster `post-merge.yml`: `fetch-depth: 2` + Changed-Manifeste) plus
  manueller `workflow_dispatch`-Voll-Lauf.

## Entwurf

### Trigger-Workflow (`.github/workflows/`, neu)

`push: branches: [main]` mit `paths:`-Filter (Code-Extensions + `**.md`),
`workflow_dispatch` für Voll-Läufe. Job 1 bestimmt geänderte Dateien
(Diff-Muster aus `post-merge.yml`); Job 2 feuert per `FLEET_KUBECONFIG` den
In-Cluster-Job mit der Diff-Liste (Voll-Modus: leere Diff = alles).

### In-Cluster-Job (k3d-Manifeste, neu)

Job braucht: Repo-Skripte + Node-Laufzeit, DB-Zugang (`knowledge.*` und
`code_embeddings`), bge-Endpoint (cluster-lokal). Image-Strategie klärt die
Planung mit Verifikation (Kandidaten: bestehendes Image erweitern vs. schlankes
Job-Image mit Repo-Checkout; Build-Zeit und Secret-Anbindung messen, nicht raten).
RBAC minimal (Job im Ziel-Namespace, keine Cluster-Rechte).

### Embed-Pfade

- Code: `index-repo.ts` unverändert (ggf. Diff-Input-Flag, klärt Planung),
  schreibt `code_embeddings` (Schema per `ensureSchema`, HNSW).
- Specs/Docs: `openspec-embed.mjs` lernt `openspec/specs/*.md` + Docs-Glob,
  Sources `specs_ssot` und `docs` in `knowledge.*`, Chunking über das
  konsolidierte Modul. Changes-Corpus (`source=specs_plans`) wird mit dem neuen
  Chunker neu eingebettet (Migration in Batches, resumable, Idempotenz per
  Delete+Insert wie bisher).

### Frische-Kriterium (Vorschlag, Planung fixiert Messung)

Workflow grün auf Merge + Spot-Check: neu gemergter Inhalt ist per
Similarity-Query auffindbar (Query gegen beide Tabellen, Assert auf Pfad/Chunks).

## Target Files (Decompose-Hinweis)

- p1-chunker: `scripts/lib/scs-chunking.ts`, `scripts/openspec-embed.mjs`
- p2-specspath: `scripts/openspec-embed.mjs` — KOLLIDIERT mit p1 (gleiche Datei:
  p1 und p2 teilen sich die Datei nicht — Decompose muss `openspec-embed.mjs`
  genau EINEM Partial zuordnen; Vorschlag: Chunker-Umstellung UND Specs-Support
  gemeinsam in p1, dafür p2 = Workflow+Job).
- Revidiert: p1-embedcore (`scs-chunking.ts`, `openspec-embed.mjs`),
  p2-clusterjob (Workflow-YAML neu, k3d-Job-Manifeste neu, Dateinamen legt die
  Planung fest), p3-indexrepodelta (`index-repo.ts` nur falls Diff-Flag nötig,
  sonst entfällt p3 als Impl und Tests rücken auf), p-tests (BATS neu/erweitert).
- Delta-Spec-Eltern: `openspec/specs/openspec-embedding.md` (primär),
  ggf. `openspec/specs/openspec-pgvector.md` (Tabellen-Aspekte, prüft Planung).

## Risiken

- R1: Job-Image-Strategie ist der größte Unbekannte-Block (Build-Zeit, Secrets,
  Node-Module) — Plan enthält Verifikations-Tasks, keine Annahmen.
- R2: Erster Voll-Lauf dauert (Rechenzeit bge + DB-Insert) — resumable Pflicht,
  Timeout/Retry im Job definieren.
- R3: S1-Budgets: alle Kandidaten unter Limit mit Reserve (447/900, 585/800,
  220/800, 59/800, 124/900, verifiziert) — Plan notiert trotzdem pro Datei Budget.
- R4: Kein Embedding-Backend in CI heißt: Workflow-Logik (Diff, Trigger) ist in
  CI testbar, der Job selbst nur per Dry-Run (`kubectl --dry-run`) + Cluster-Lauf.
