# Proposal: brain-foundation

## Why

Dokumentation und Wissen von Patrick + Gekko sind über `docs/`, `openspec/specs/`,
Auto-Memory und Köpfe verstreut — nichts ist gegenseitig referenziert, LLM-Sessions
erarbeiten dasselbe Wissen wiederholt neu. Das Epic **brain-llm-wiki** (PRD an Ticket
T001566) etabliert ein Obsidian-artiges, LLM-gepflegtes Wissens-Repo nach Karpathys
LLM-Wiki-Pattern. Dieser Change legt das Fundament: ohne Repo, Schema und Qualitäts-CI
kann kein Folge-Change (Quartz-Deploy, Ingest, MCP) aufsetzen.

## What

- Neues privates GitHub-Repo **`Paddione/brain`** (Gekko als Collaborator), geseedet über
  einen idempotenten Bootstrap aus diesem Repo.
- Karpathy-Struktur: `SCHEMA.md` (Verfassung: Konventionen, Frontmatter-Pflichtfelder
  `type`/`tags`/`status`, Ingest/Query/Lint-Workflows), `index.md`, `log.md`, `raw/`, `wiki/`.
- Sprache gemischt (DE-Prosa, EN-Fachbegriffe); SSOT-Regel „kompilieren, nicht verschieben"
  mit `source::`-Rückverweisen im SCHEMA.md verankert.
- Qualitäts-CI im brain-Repo: toter-Wikilink-Check, Frontmatter-Lint, Secret-Scan
  (Leitplanken aus Grilling T001566: keine Secrets, keine Personendaten Dritter).
- In diesem Repo: `scripts/brain-bootstrap.sh` + Seed-Templates + BATS-Spec
  `tests/spec/brain-foundation.bats` (RED→GREEN).

**Non-Goals** (Folgeticket T001567): Quartz-Deploy (`brain-quartz-deploy`), Initial-Ingest,
Merge-Hook-Ingest, MCP-Server, Gekko-Inbox, Auto-Memory-Brücke, Nightly-Lint-Agent.

_Ticket: T001568_
