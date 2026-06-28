---
ticket_id: T001323
plan_ref: null
status: active
date: 2026-06-29
---

# Plan Intel Bundle — Design

## Purpose (DE)

Spec- und Plan-Erstellung im `dev-flow`-Kreislauf sollen gegen **echte Typen** geschrieben werden
statt gegen vage Beschreibungen. Heute gibt es keinen strukturierten Intel-Reuse: der Code-Explorer
(dev-flow-plan A.1) liefert Prosa, der Plan-Subagent (Schritt 3.7) bekommt nur Spec + Assets + Gates
und re-exploriert ad hoc, und der Implementer (dev-flow-execute Schritt 2) startet wieder bei null.

Dieser Change führt ein **typisiertes „Plan Intel Bundle" (PIB)** ein — ein schema-validiertes
Artefakt `openspec/changes/<slug>/intel.json`, das einmal in der Plan-Phase aus den vorhandenen
Intel-Quellen (codebase-memory, LSP, mcp-postgres, context7) befüllt wird und anschließend von
**beiden** Phasen (plan + execute) als Pflicht-Kontext konsumiert wird. Damit referenzieren Pläne
reale Signaturen, DB-Spalten und API-Contracts — überprüfbar gegen den Graph — und die Implementierung
arbeitet auf derselben Typen-Wahrheit.

## Scope

**In scope:**
- JSON-Schema-Vertrag + TS-Typ-Spiegel + Beispiel-Fixture für das PIB.
- Ein How-to-Referenzdoc, das jede Bundle-Sektion an ihre Intel-Quelle bindet.
- Wiring in `dev-flow-plan` (neuer Intel-Gathering-Schritt; PIB-Injektion in den Plan-Subagent-Prompt).
- Wiring in `dev-flow-execute` (Implementer konsumiert `intel.json`).
- BATS-Test-Coverage als fail-closed Gate.
- Delta-Spec gegen den Parent-SSOT `dev-flow-plan`.

**Out of scope (YAGNI):**
- Kein Generator-/Automatisierungs-Script (das Bundle wird agent-befüllt — bewusste Entscheidung).
- Kein neuer dedizierter „intel-gatherer"-Subagent.
- Keine Änderung an `dev-flow-chore` (Chores brauchen kein Bundle).
- Keine neue Runtime-Dependency (kein `ajv` — Validierung läuft `jq`-strukturell).

## Approach (gewählt: A — JSON-SSOT)

`intel.json` ist die maschinenlesbare SSOT, gegen ein JSON-Schema (draft 2020-12) validiert. Ein
handgepflegter `.d.ts`-Spiegel liefert Editor-/tsc-Typen; ein BATS-Drift-Guard prüft Key-Parität
zwischen Schema und `.d.ts`. Validierung in CI gegen eine committete `intel.example.json` über
**`jq`-strukturelle Assertions** (Pflicht-Keys + Typen) — kein `ajv`, keine neue Dependency.

Verworfene Alternativen:
- **B (MD-first):** Typen als Prosa in fenced Blocks → nicht schema-erzwingbar, „proper types" verfehlt.
- **C (JSON + generierte MD):** bräuchte einen Generator → widerspricht „kein Runtime-Script".

## Artifact — Plan Intel Bundle (`openspec/changes/<slug>/intel.json`)

Top-Level-Sektionen (alle vier Typ-Dimensionen abgedeckt):

| Sektion | Inhalt |
|---|---|
| `meta` | `{ slug, ticket_id, generated_from: "main@<sha>", domains[], intel_sources[] }` |
| `impact_files[]` | `{ path, language, loc, s1_limit, s1_baseline\|null, s1_budget }` — S1-Ratchet vorberechnet |
| `symbols[]` | `{ qualified_name, kind, file, signature, type_text, source }` — Code-Signaturen & Typen |
| `call_graph` | `{ entrypoints[], edges[]{ from, to, kind: calls\|data_flow\|cross_service } }` |
| `db_tables[]` | `{ name, columns[]{ name, type, nullable, default, constraints } }` |
| `api_contracts[]` | `{ route, method, request_type, response_type, file }` |
| `external_types[]` | `{ library, symbol, signature, source: "context7" }` |
| `risks[]` | `{ note, severity: info\|warn\|blocker }` — Intel-Lücken/Unsicherheiten |

`meta`, `impact_files` und `symbols` sind **Pflicht**; die übrigen Sektionen sind Arrays, die leer
sein dürfen, wenn die Dimension für den Change nicht zutrifft (z. B. kein DB-Touch → `db_tables: []`).

## Intel-Quellen-Mapping (die eigentliche Verbesserung)

Jede Sektion ist an eine konkrete Quelle gebunden — das ist das „besser Intel sammeln":

| Sektion | Primärquelle | Fallback |
|---|---|---|
| `symbols` / `signature` / `type_text` | `codebase-memory` (`get_code_snippet`, `search_graph`) + LSP-Hover/Definition | `grep` / `Read` |
| `call_graph` | `codebase-memory` `trace_path` (mode `calls`/`data_flow`/`cross_service`) | manuelle Grep-Kette |
| `db_tables` | `mcp-postgres` (`information_schema.columns`-Query, read-only) | `kubectl exec … psql` |
| `api_contracts` | `Read` der `website/src/pages/api/**`-Handler + deren Typen | — |
| `external_types` | `context7` (`resolve-library-id` → `query-docs`) | Lib-`.d.ts` lesen |
| `impact_files` / `s1_*` | `wc -l` + `docs/code-quality/baseline.json` + `_ext_limit`-Tabelle (plan-lint-Logik) | — |

## File Structure

Neu:
- `.claude/skills/references/schemas/plan-intel-bundle.schema.json` — JSON-Schema (autoritativer Vertrag)
- `.claude/skills/references/schemas/plan-intel-bundle.d.ts` — TS-Interface-Spiegel
- `.claude/skills/references/schemas/plan-intel-bundle.example.json` — CI-validierte Fixture
- `.claude/skills/references/plan-intel-bundle.md` — How-to/Quellen-Mapping (Skills verlinken hierher)
- `tests/spec/dev-flow-plan.bats` — neues Spec-Test-File (ein File pro SSOT-Spec)

Geändert:
- `.claude/skills/dev-flow-plan/SKILL.md` — neuer Schritt „A.1.5 Intel-Gathering → Plan Intel Bundle";
  Schritt 3.7 injiziert `intel.json` als Pflicht-Kontext in den Plan-Subagent-Prompt; B.2 verschiebt
  das Bundle mit in den Worktree.
- `.claude/skills/dev-flow-execute/SKILL.md` — Schritt 2 lädt `intel.json` als Pflicht-Implementer-Kontext.
- `openspec/changes/plan-intel-bundle/specs/dev-flow-plan.md` — Delta gegen Parent-SSOT.

> `.agents/skills` ist ein Symlink auf `.claude/skills` — Edits sind unter beiden Pfaden sichtbar;
> die BATS-Gates slicen den `.agents/skills/…`-Pfad (bestehende Konvention).

## Wiring

**dev-flow-plan:**
1. Neuer **Schritt A.1.5** nach der Exploration (A.1): Bundle aus den o. g. Quellen befüllen. Liegt
   vor `/opsx:propose` noch kein Change-Ordner vor, wird das Bundle zunächst neben den anderen
   Phase-A-Artefakten gehalten und in **B.2** mit in den Worktree nach `openspec/changes/<slug>/intel.json`
   verschoben. Es informiert bereits das Brainstorming (A.4).
2. **Schritt 3.7**: Der Plan-Subagent-Prompt bekommt `intel.json` als Pflicht-Kontext mit der Direktive
   „referenziere ausschließlich reale Signaturen/Typen aus `intel.json`; erfinde keine Typen; nutze
   die vorberechneten `s1_budget`-Werte für die S1-Notation pro Datei".

**dev-flow-execute:**
3. **Schritt 2**: Der Implementer-Prompt lädt `openspec/changes/<slug>/intel.json` als Pflicht-Kontext
   (analog zu `$ATTACHMENT_DIR`) → kein Re-Explorieren, identische Typen-Wahrheit zwischen Plan & Code.

## Testing & Gates

Neue `tests/spec/dev-flow-plan.bats` (rot vor Implementierung, grün danach):
- **Schema valide:** `jq . plan-intel-bundle.schema.json` exit 0; deklariert `$schema` draft 2020-12.
- **Fixture konform:** `plan-intel-bundle.example.json` hat alle Pflicht-Top-Level-Keys; `meta.slug`,
  `meta.ticket_id` sind Strings; `impact_files`/`symbols` sind non-empty Arrays mit den Pflicht-Feldern
  pro Element (jq-Typ-Assertions).
- **Schema-↔-`.d.ts`-Parität:** die Top-Level-Property-Namen im Schema und die Interface-Felder im
  `.d.ts` stimmen überein (billiger Drift-Guard).
- **Skill-Wiring (plan):** `.agents/skills/dev-flow-plan/SKILL.md` enthält den Intel-Gathering-Schritt,
  referenziert `intel.json` und nennt die vier Intel-Quellen (codebase-memory, mcp-postgres, context7, LSP).
- **Skill-Wiring (execute):** `.agents/skills/dev-flow-execute/SKILL.md` Schritt 2 referenziert
  `intel.json` als Implementer-Kontext.

Finaler Verify-Task (CI-Äquivalent): `task test:changed`, `task freshness:regenerate`,
`task freshness:check`; nach Test-Änderung `task test:inventory` + Commit des Inventars;
`task test:openspec` muss grün sein.

## Error Handling / Edge Cases

- **Intel-Quelle nicht erreichbar** (z. B. `mcp-postgres` down): Sektion über den dokumentierten
  Fallback befüllen; ist auch der Fallback nicht möglich, einen `risks[]`-Eintrag mit
  `severity: warn` setzen statt die Sektion stillschweigend leer zu lassen (kein Silent-Gap).
- **Change ohne DB-/API-/Lib-Touch:** entsprechende Arrays leer (`[]`) — valide; das Schema erzwingt
  nur `meta`/`impact_files`/`symbols`.
- **Graph veraltet** (codebase-memory-Hook meldet Drift): vor Befüllung Re-Index erwägen oder
  betroffene Symbole per `Read`/LSP gegenprüfen, damit `signature` nicht stale ist.

## Open Decisions

Keine offen — Ansatz A bestätigt; Schema-only + Skill-Wiring; Reichweite plan+execute.
