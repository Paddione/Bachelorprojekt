---
ticket_id: T900452
plan_ref: null
status: active
date: 2026-09-26
---

# Design: Auto-Docs-Removal — Generator, Sites, Doku-Sweep (Change 5/6)

Epic T900447, Change-Ticket T900452, ADR-009 Punkte 4+6 (Q1: Sites +
Pipeline stilllegen, Manifeste drin) und 8 (Gate-Artefakte bleiben).
Der Change entfernt die Lesedoku-Maschinerie vollständig: Generierung,
Build, Deploy, Serving und ihre Doku.

Input: Auto-Docs-Exploration (read-only, Referenzliste-vor-Löschung
nach T002637-M5 — alle Pfade per grep/ls verifiziert). Ticket-Hinweis
„Referenzliste zuerst erheben" ist damit erfüllt.

## Ziele

- Kein Workflow baut mehr Docs: `build-docs.yml` weg, `docs:*`-Tasks
  weg (außer Diagramm-Generierung), Promote kennt kein `docs` mehr.
- Keine Sites mehr: Deployment, SSO-Proxy, Ingress-Regel, Seed-Login,
  Env-Keys und der 16-MB-HTML-Baum sind weg.
- Keine hängenden Verweise: Guards assertieren Abwesenheit; Specs ohne
  tote Pfade/Tasks; Doku-Sweep ohne Lesedoku-Prosa.
- Gate-Betrieb unverändert: `freshness-regen.yml`,
  `freshness:regenerate` + alle Q3-Keeper laufen wie bisher.

## Nicht-Ziele

- `freshness-regen.yml` anfassen (100 % Keeper-Funktion, vermessen).
- DNS-Einträge docs.*.de (außerhalb, Owner-Netz).
- `docs/legacy-html/` löschen (inerter Content ohne Leser — bewusst
  stehend, kein Dangling, spätere Chore darf entscheiden).
- `graph:build-docs` (Repo-Markdown, kein Lesedoku-Task trotz Namens).
- Historie umschreiben (health-goals-history, ADR-009, Chroniken).
- K4-Pipeline/MCP (4/6), Agent-Routing-Prosa (6/6).

## Entscheidungen (Brainstorming 2026-09-26)

- E1: `systembrett-html.mjs` wird per `git mv` nach `scripts/`
  verlagert (dorthin, woher es extrahiert wurde), Import in
  `systembrett-generate.mjs` umgebogen — einziger Fremd-Caller von
  docs-gen, Whiteboard-Setup bleibt lauffähig.
- E2: `docs:refresh-diagrams` + datamodel-workflow-Task werden
  EDITIERT, nicht gelöscht: was Repo-Markdown erzeugt
  (`docs/db-schema-diagram.md`, `/tmp/datamodel-workflow.md`), bleibt;
  was baut/kopiert/deployed (`--rebuild-page`, legacy-html-Copy,
  docs:deploy-Subtask), geht.
- E3: `DOCS-DESIGN-STANDARDS.md` wird GELÖSCHT (ganz über die
  generierte Site), `docs/bereitstellungsdetails.md` EDITIERT
  (nur docs-URLs raus). `tools.yaml` EDITIERT + `20-werkzeuge.md`
  per Keeper-Task `agent-guide:docs` regeneriert (nicht von Hand).
- E4: Vaultwarden-`Docs`-Login + `DOCS_DOMAIN`-Env + beide
  Configmap-Keys gehen mit (tote Seed-Einträge vermeiden).
- E5: Mechanische Kollisionen (4/6: kustomization/ingress —
  disjunkte Blöcke; 6/6: CLAUDE.md) werden per Epic-Reihenfolge +
  Rebase gelöst, kein Plan-Gate nötig (keine semantische Ordnung
  wie E6 in 4/6 — die Manifeste sind unabhängig).
- E6: fa-13-E2E wird GELÖSCHT (Service existiert nicht mehr),
  Playwright-`services`-Projekt verliert die Zeile. BATS-Kosmetik
  (Kommentare über lebende Workflows) bleibt unangetastet.

## Risiken

- R1: Übersehene Leser von docs-content-built — Exploration fand nur
  Dockerfile + Ignores + Guards + Hooks (alle im Plan); Restrisiko
  trägt der Abwesenheits-Guard.
- R2: Rebase-Reihenfolge 4/6→5/6→6/6 beim Executor — im Plan als
  Implementierungs-Notiz, kein Gate.

## Validierung

- `task test:changed` + `freshness:check` grün; Abwesenheits-Guard grün.
- Grep-Nachweise: kein `docs-gen`, kein `build-docs`, kein
  `docs-content-built`, keine `docs:*`-Tasks (außer Diagramm-Gen),
  kein `docs.yaml`-Ref, kein `DOCS_URL`.
- `task workspace:validate` grün (Manifest-Edits).
