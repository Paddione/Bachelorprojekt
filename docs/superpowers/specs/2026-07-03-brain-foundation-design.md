---
title: Design: brain-foundation — Fundament des gemeinsamen LLM-Wikis
ticket_id: T001568
domains: [infra, test, security]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Design: brain-foundation — Fundament des gemeinsamen LLM-Wikis

> Brainstorming lief als Lavish-Grilling-Session (Fragebogen `brain-llm-wiki-grilling-v1`,
> persistiert an Ticket T001566; PRD dort als Attachment). Dieses Dokument hält die
> Design-Entscheidungen für Change 1/7 des Epics **brain-llm-wiki** fest.

## Goals

1. Privates GitHub-Repo `Paddione/brain` existiert, Gekko ist Collaborator.
2. Karpathy-LLM-Wiki-Struktur ist geseedet und in `SCHEMA.md` verbindlich definiert.
3. Qualitäts-CI läuft im brain-Repo: Wikilink-Check, Frontmatter-Lint, Secret-Scan.
4. Bootstrap ist idempotent und aus dem Bachelorprojekt heraus test- und wiederholbar.

## Non-Goals

Quartz-Deploy, Initial-Ingest, Merge-Hook, MCP-Server, Gekko-Inbox, Auto-Memory-Brücke,
Nightly-Lint-Agent — alles Folge-Changes (Stichworte in Ticket T001567).

## Decisions

| # | Entscheidung | Begründung / Trade-off |
|---|---|---|
| D1 | **Karpathy-Pattern** (`raw/` + `wiki/` + `SCHEMA.md` + `index.md` + `log.md`), flache `wiki/`-Seiten mit MOC-Hub-Seiten statt tiefer Ordnerhierarchie | Bewährtes 2026-Pattern für LLM-gepflegte Wikis; flache Struktur = stabile Wikilinks, LLM muss keine Pfade raten. Trade-off: `index.md` + MOCs müssen gepflegt werden — genau das ist der Lint-Workflow. |
| D2 | **SSOT-Regel „kompilieren"**: Quellen bleiben in ihren Repos; Wiki-Seiten tragen `source::`-Rückverweise (typisierte Kante, LLM-Wiki-v2-Stil) | Kein Doku-Umzug, kein Zwei-Orte-Drift-Problem auf Quellenebene. Trade-off: Wiki kann veralten → Folge-Change Merge-Hook-Ingest (T001567). |
| D3 | **Frontmatter-Pflichtfelder** `type` (`note\|moc\|entity\|decision\|runbook`), `tags`, `status` (`draft\|active\|archived`); Wikilinks `[[slug]]` | Maschinenlesbar für spätere MCP-/Quartz-Layer; Lint erzwingt Konsistenz von Tag 1. |
| D4 | **Bootstrap als Skript in diesem Repo** (`scripts/brain-bootstrap.sh` + `templates/brain/`-Seed), Erstellung via `gh-axi`/`gh` | Testbar per BATS im Bachelorprojekt (RED→GREEN, offline gegen Temp-Verzeichnis); idempotent = re-runnable ohne Schaden. Trade-off: Seed-Templates sind Einmal-Seeder, danach ist das brain-Repo SSOT für seinen Inhalt (im SCHEMA.md vermerkt). |
| D5 | **Linter leben im brain-Repo** (`scripts/` dort, von dessen CI aufgerufen), werden vom Seed mitgeliefert | brain-Repo bleibt self-contained (eigene CI, keine Cross-Repo-Abhängigkeit). |
| D6 | **Vertraulichkeit**: keine Credentials (nur Vaultwarden/SealedSecrets-Verweise), keine personenbezogenen Daten Dritter; Secret-Scan (gitleaks o. ä.) als CI-Gate | Grilling-Leitplanke; Brain wird von LLMs gelesen und später im Web gerendert. |
| D7 | **Sprache gemischt**: DE-Prosa, EN-Fachbegriffe (wie OpenSpec-Konvention) | Konsistenz mit bestehender Repo-Kultur. |

## Offene Punkte für den Plan

- Exakter Wikilink-Linter-Ansatz (grep-basiert vs. kleines Node-Skript) — Plan-Autor wählt,
  BATS-testbar muss es sein.
- Gekkos GitHub-Account: als Bootstrap-Parameter (`--collaborator <handle>`), nicht hardcoden.
- Kein Brand-Domain-Literal in Snippets (S3-Gate) — Domains erst im Quartz-Change relevant.
