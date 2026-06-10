---
title: Factory Scout → Claude Sonnet Model Override Implementation Plan
ticket_id: T000593
domains: [website, db, test]
status: active
pr_number: null
---

# Factory Scout → Claude Sonnet Model Override Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scout-Agent im Factory-Pipeline auf Claude Sonnet 4.6 umstellen und den Prompt mit expliziten Tool-Use-Schritten ausstatten, sodass `touched_files` durch echte Codebase-Analyse befüllt wird statt durch reines LLM-Raten.

**Architecture:** Einzige Änderungsstelle ist `scripts/factory/pipeline.js` — der `agent()`-Call für die Scout-Phase bekommt `model: 'sonnet'` als Option, und der Prompt wird um eine geordnete Schrittliste (grep/glob/find/read) erweitert. Kein Schema-Change, keine neuen Dateien.

**Tech Stack:** Node.js, Claude Code Workflow-Harness (`agent()` global), Claude Sonnet 4.6 via Anthropic API.

---

## Dateien

| Aktion | Pfad |
|--------|------|
| Modify | `scripts/factory/pipeline.js` Zeilen 174–188 (Scout-Agent-Call) |

---

### Task 1: Scout-Agent — Model-Override + Prompt-Rewrite

**Files:**
- Modify: `scripts/factory/pipeline.js:174-188` (Scout `agent()` call)

- [ ] **Schritt 1: Aktuelle Scout-Zeilen im Editor lokalisieren**

Öffne `scripts/factory/pipeline.js` und suche nach `label: 'scout'` (aktuell Zeile 187). Stelle sicher, dass du die richtige Stelle siehst:

```js
const scout = await agent(
  `Record pipeline liveness first …
   Scout the feature "${A.title}" against the codebase at ${REPO}.
   …
   Return a JSON object matching the scout schema.` + consumeInjections('scout'),
  { label: 'scout', phase: 'Scout', schema: SCOUT_SCHEMA },
)
```

- [ ] **Schritt 2: `model: 'sonnet'` zu den Agent-Optionen hinzufügen**

Ändere die letzte Zeile des `agent()`-Calls von:
```js
  { label: 'scout', phase: 'Scout', schema: SCOUT_SCHEMA },
```
zu:
```js
  { label: 'scout', phase: 'Scout', schema: SCOUT_SCHEMA, model: 'sonnet' },
```

Das ist eine einzige Zeile, die sicherstellt dass der Scout-Agent den DeepSeek-Default überschreibt und Claude Sonnet 4.6 verwendet.

- [ ] **Schritt 3: Scout-Prompt mit expliziten Tool-Use-Schritten ersetzen**

Ersetze den gesamten Scout-Prompt-String (den Template-Literal ab `` ` `` bis zum schließenden `` ` `` vor `+ consumeInjections`). Der neue Prompt soll so aussehen:

```js
const scout = await agent(
  `Record pipeline liveness first so the dispatcher watchdog does not flag this run as stale: run \`bash ${REPO}/scripts/ticket.sh touch --id ${A.ticket_id}\`. Then:

   Scout the feature "${A.title}" for codebase at ${REPO}.
   Description: ${A.description}

   Work through these steps IN ORDER using tools — do NOT guess file paths from the title alone:

   1. Read the scout template:
      Read ${REPO}/scripts/factory/templates/scout-template.md

   2. Grep for keywords from the feature title across the main source trees:
      bash -c 'grep -r --include="*.ts" --include="*.js" --include="*.svelte" --include="*.astro" -l "${A.title.split(' ').slice(0,3).join('\\|')}" ${REPO}/website/src ${REPO}/scripts ${REPO}/brett 2>/dev/null | head -30'

   3. Find files by name patterns suggested by the ticket title:
      bash -c 'find ${REPO}/website/src ${REPO}/scripts ${REPO}/brett -type f \\( -name "*.ts" -o -name "*.js" -o -name "*.svelte" \\) 2>/dev/null | grep -i "${A.slug.replace(/-/g, '\\|')}" | head -20'

   4. Read up to 3 of the most-likely candidate files (just the first 60 lines each) to confirm they are in scope.

   5. Find similar past tickets (fail-soft: [] is fine if DB or GPU host is down):
      cd ${REPO}/website && npx tsx scripts/find-similar-tickets.mjs "${A.title} ${A.description}" 5

   6. Based on the files you actually found (not guesses), classify complexity:
      - simple:  ≤3 files, single subsystem, no DB migration
      - medium:  4–10 files or crosses 2 subsystems
      - complex: >10 files or DB migration or multi-brand impact

   7. Return a JSON object matching the scout schema with:
      - touched_files: the actual file paths found in steps 2–4 (absolute paths)
      - complexity: your classification from step 6
      - risk_areas: concrete risks based on what you read (not generic)
      - similar_tickets: IDs from step 5
      - estimated_slots: 1 for simple, 2-3 for medium, 4+ for complex` + consumeInjections('scout'),
  { label: 'scout', phase: 'Scout', schema: SCOUT_SCHEMA, model: 'sonnet' },
)
```

**Achtung:** `A.title.split(...)` und `A.slug.replace(...)` sind JavaScript-Ausdrücke innerhalb des Template-Literals — sie werden zur Laufzeit des Pipelines ausgewertet und in den Prompt-String eingebettet. Das ist korrekt (der Prompt-String wird erst beim `agent()`-Aufruf materialisiert).

- [ ] **Schritt 4: Syntaxcheck**

```bash
node --check /tmp/wt-factory-scout/scripts/factory/pipeline.js
```

Erwartete Ausgabe: kein Output (= kein Syntaxfehler). Jeder Fehler weist auf ein nicht geschlossenes Template-Literal oder eine fehlende Klammer hin.

- [ ] **Schritt 5: Contract-Test FA-SF-20 ausführen**

```bash
cd /tmp/wt-factory-scout && ./tests/runner.sh local FA-SF-20
```

Erwartete Ausgabe: `✓ FA-SF-20` (Schema-Konformität des Scout-Outputs). Der `model`-Key ist nicht Teil des Schemas, daher kein Schemabruch.

- [ ] **Schritt 6: Commit**

```bash
cd /tmp/wt-factory-scout
git add scripts/factory/pipeline.js
git commit -m "fix(factory): scout agent uses Claude Sonnet + explicit grep/find discovery steps [T000593]"
```

---

### Task 2: Smoke-Test — Dry-Run Pipeline

**Files:**
- Read: `scripts/factory/pipeline.js` (keine Änderungen — nur Verifikation)

- [ ] **Schritt 1: Dry-Run gegen ein bekanntes Test-Ticket starten**

Starte einen dry-run über das Workflow-Tool mit einem echten Ticket-Slug (z.B. dem des Tickets T000593 selbst):

```
Workflow: scripts/factory/pipeline.js
args: {
  "title": "Factory Scout Claude Model Override",
  "description": "Replace DeepSeek Scout with Claude Sonnet for real codebase analysis",
  "slug": "factory-scout-claude-model",
  "ticket_id": "T000593",
  "brand": "mentolder",
  "timestamp": "<ISO8601>",
  "dry_run": true
}
```

- [ ] **Schritt 2: Scout-Output auf `touched_files.length > 0` prüfen**

Im Log des Workflow-Runs muss erscheinen:
```
Scout: complexity=<simple|medium|complex>, N touched files
```
wobei `N > 0`. Ein `0 touched files`-Ergebnis bedeutet, dass der Prompt-Rewrite keine Wirkung hatte und debuggt werden muss.

- [ ] **Schritt 3: Sicherstellen dass keine anderen Phasen gestartet wurden**

Bei `dry_run: true` soll nach der Scout-Phase (`scout:persist`) die Pipeline beendet oder pausiert sein. Kein Design/Plan/Implement/Deploy-Agent darf aufgerufen worden sein.

- [ ] **Schritt 4: Wenn `touched_files` leer — Prompt-Debug**

Falls `N == 0` trotz Sonnet:
1. Prüfe ob das grep-Pattern korrekt escapet ist (bash -c + Shell-Escaping in Template-Literal).
2. Prüfe ob `A.slug` korrekt im Prompt steht (`console.log`-Debug via einem kurzen `log()` vor dem `agent()`-Call).
3. Passe das Grep-Pattern an (evtl. vereinfachen: `grep -r -l "<einzelnes Keyword>"`) und wiederhole Schritt 1–2.

- [ ] **Schritt 5: Bei Erfolg — Abschluss-Commit (falls Schritt 4 nötig war)**

Nur falls in Schritt 4 weitere Anpassungen gemacht wurden:
```bash
cd /tmp/wt-factory-scout
git add scripts/factory/pipeline.js
git commit -m "fix(factory): adjust scout grep pattern for reliable file discovery [T000593]"
```

---

## Self-Review gegen Spec

| Spec-Anforderung | Abgedeckt in |
|-----------------|-------------|
| `model: 'sonnet'` zu Scout `agent()` options hinzufügen | Task 1, Schritt 2 |
| Scout-Prompt mit expliziten Tool-Use-Schritten (grep/glob/find/read) | Task 1, Schritt 3 |
| Keine Schema-Änderung (SCOUT_SCHEMA bleibt unverändert) | Nicht berührt ✓ |
| Keine Änderungen an anderen Pipeline-Phasen | Nicht berührt ✓ |
| FA-SF-20 Contract-Test bleibt grün | Task 1, Schritt 5 |
| Smoke-Test: `touched_files.length > 0` nach dry_run | Task 2, Schritt 2 |
| Kein neues BATS-Test für model-Override selbst | Korrekt — kein Test hinzugefügt |

Keine Gaps gefunden. Der Plan deckt alle Spec-Anforderungen ab.
