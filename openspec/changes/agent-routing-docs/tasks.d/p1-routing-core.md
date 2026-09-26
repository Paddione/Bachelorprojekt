---
title: "p1-routing-core — Routing-Seite + Oberflächen"
ticket_id: T900453
domains: [docs, agents]
status: active
---

# p1-routing-core — Implementation Plan

_Ticket T900453 · Change `agent-routing-docs` · Epic T900447._ Dieses Partial erstellt die Routing-Seite und verdrahtet sie in die Agenten-Oberflächen; es erfüllt das ADDED Requirement in `specs/agent-skills.md` (Mapping der 4 Szenarien in Task 2). Plan-Intel: `scripts/plan-intel-filter.sh` meldet `intel.json not found` — alle Werte unten stammen aus direkten Quell-Reads (grep fallback), je Wert mit Datei:Zeile belegt.

## File Structure

| Pfad | Ist | S1 |
|---|---|---|
| `docs/brain/recall-routing.md` (NEU) | — | `.md` ungated; Soll ~90 Zeilen per Task 2 |
| `AGENTS.md` | 159 | ungated, nicht-baselined → n/a |
| `docs/agent-guide/registry/capabilities.yaml` | 821 | ungated, nicht-baselined → n/a |
| `.opencode/skills/references/mcp-tool-guide.md` | 326 | ungated, nicht-baselined → n/a |
| `.opencode/prompts/orchestrator.md` | 77 | ungated, nicht-baselined → n/a |
| `.opencode/prompts/primary-agent.md` | 33 | ungated, nicht-baselined → n/a |
| `.opencode/prompts/glimmer-primary.md` | 38 | ungated, nicht-baselined → n/a |
| `docs/agent-guide/maps/toolset-map.md` (REGEN) | — | generiert, `.md` ungated; Hand-Edit verboten |
| `docs/agent-guide/10-ziele.md`, `20-werkzeuge.md`, `30-bausteine.md` (REGEN) | — | generiert via `agent-guide:docs` |
| `docs/agent-guide/maps/goals-map.md`, `tools-map.md`, `danger-map.md`, `agents-map.md` (REGEN) | — | generiert via `agent-guide:maps` |
| `components/website/src/lib/agent-guide.generated.json` (REGEN) | — | generiert, `.json` ungated |
| `components/website/src/lib/platform-descriptions.generated.json` (REGEN) | — | generiert via `agent-guide:platform-descriptions` |

S1-Legende: `docs/code-quality/gates.yaml` → `s1.limits` kennt nur `.astro/.ts/.svelte/.sh/.mjs/.mts/.py/.js/.jsx/.tsx/.cjs/.bash/.java/.php` — `.md`, `.yaml`, `.json` sind ungated (verifiziert, nicht angenommen). `jq` Baseline-Lookup (`S1:<pfad>`) meldet für alle 6 Edit-Dateien `nicht-baselined`; `plan-lint.sh residual_budget` liefert leer → wirksame Schwelle und Budget sind n/a. Keine Baseline-Einträge, keine S4-Artefakte (kein Manifest, kein Skript).

## Scope-Grenze

Nicht in p1 (disjunkt, anderswo owned): `tests/` (p-tests, dort liegt auch der Rot-Grün-Gate-Step), Runbook-Löschung, `skills.yaml`, `system-audit/SKILL.md`, `deploy-routing.md`, `k2/k5/gesamtbild/k1-vector-db`-Docs, `CLAUDE.md` (p2-Sweep), `docs/brain/k3-code-graph.md` (nur verlinken), 5/6-owned Zeilen.

## Task 1 — E7-Ordnungsgate (fail-closed, zuerst)

Die Doku beschreibt den 5/6-Endzustand; ohne dessen Merge auf `origin/main` darf keine Edit passieren (Design E7, Muster 4/6-E6).

```bash
git fetch origin main --quiet
test -z "$(git status --porcelain)" || { echo "STOPP: Baum unsauber — erst aufräumen, dann Gate erneut prüfen."; exit 1; }
git log --oneline origin/main --grep=T900452 | grep -q . || { echo "STOPP (E7): T900452 (5/6) steht nicht auf origin/main — keine einzige Edit, Worktree unverändert lassen, T900453 per Ticket-Kommentar an den Dispatcher zurückgeben."; exit 1; }
```

Weiter nur bei Treffer (Squash-Merge `[T900452]` sichtbar). Kein Teiledit bei Gate-Fehlschlag.

## Task 2 — Routing-Seite `docs/brain/recall-routing.md` (NEU, Soll 90 Zeilen ±10)

Seite nach dieser Sektions-Spec schreiben (Zeilen = Budget, Summe 90):

| Sektion | Zeilen | Inhalt (fix) |
|---|---|---|
| H1 + Einleitung | 10 | `# Recall-Routing (K1/K3/K4)`; 3 Sätze: Zweck (Schichtwahl je Fragetyp), Default-Hinweis (Baum zuerst, linearer Fallback), Epic-Zeile T900447 |
| `## Entscheidung nach Fragetyp` | 16 | Baum, 3 Äste wörtlich: bekanntes Symbol/Call-Chain → K3 zuerst; semantische Was-Frage → K1 zuerst; Doktrin/Prozess (ADR, Runbook, Gotcha, Karte) → K4-Kern in `docs/` zuerst |
| `## Fallback-Reihenfolge` | 8 | Linear K1→K3→K4 mit Einzeiler-Rationale: Roh-Recall → Präzisions-Check → Doktrin (Design E1) |
| `## Frische` | 22 | Tabelle (3 Zeilen, Werte unten) + je Schicht ein Quell-Satz |
| `## K4-Kernorte` | 12 | 4 Orte mit Pfad (unten), je ein Halbsatz Zweck |
| `## Ownership` | 5 | `Epic-owned (T900447), kein Personen-Owner` (Design E4) + ein Satz: keine CODEOWNERS/`agent:`-Felder vorhanden, nichts erfunden |
| `## Weiterführend` | 7 | 3 Links (Ziele unten, relativ) |
| `> Annahme`-Fußnote + Leerzeilen | 10 | Karten-Annahme wörtlich (unten) |

Frische-Tabellenwerte (je Wert belegt):

- K1: `merge-gekoppelt, keine Zeit-SLA` — Trigger `push: branches: [main]` + `workflow_dispatch` (`.github/workflows/k1-embed.yml:3-23`); Frische-Kriterium ist Workflow-grün-auf-Merge plus Spot-Check, ohne Zeit-Bound (`openspec/changes/archive/2026-09-26-k1-ci-embeds/design.md:77-80`).
- K3: `periodisch hourly, Bound Intervall+Dauer ≤ ~1h` — Cron `0 * * * *` (Fallback `0 */4 * * *`) mit skip-if-fresh (`scripts/cbm-refresh-cron.sh:7-9`); Bound-Definition (`openspec/changes/archive/2026-09-26-k3-auto-refresh/design.md:28-30`); `hinkt bis zu 1h hinterher` (`docs/brain/k3-code-graph.md:153,155`).
- K4: `Authoring-Zeitpunkt` — authored Kern liegt im Repo (`openspec/changes/archive/2026-09-26-k4-surgery/design.md:27-29`); Frische per Beschluss = letzter Commit an der Seite (`openspec/changes/agent-routing-docs/design.md:55-59`).

K4-Kernorte: `docs/adr/` (Entscheidungen, u.a. ADR-009), `docs/runbooks/` (Betriebs-Prozeduren), `docs/superpowers/references/gotchas-footguns.md` (kanonische Gotchas — Eigenbeleg `:3`: `This file is the canonical source`; Kriterium: docs-resident per Spec), `docs/agent-guide/maps/` (Karten — Annahme, siehe Fußnote).

Annahme-Fußnote (wörtlich auf die Seite): `> Annahme (Design E3, Review offen): Karten := docs/agent-guide/maps/. Einzige unbelegte Vokabel; bei Widerspruch nur diese Zeile plus K4-Kernorte tauschen.`

Links (relativ ab `docs/brain/recall-routing.md`, Ziele verifiziert vorhanden): `./k3-code-graph.md`, `../adr/ADR-009-brain-3layer-architektur.md`, `../../.opencode/skills/references/mcp-tool-guide.md`.

Szenario-Mapping (Spec `specs/agent-skills.md:14-37`): Ast 1 → Szenario 1 (K3), Ast 2 → Szenario 2 (K1), Ast 3 → Szenario 3 (K4), Frische-Tabelle → Szenario 4 (Bounds).

Asserts:

```bash
n=$(wc -l < docs/brain/recall-routing.md | tr -d ' '); [ "$n" -ge 80 ] && [ "$n" -le 100 ] && echo "lines: $n"
for t in docs/brain/k3-code-graph.md docs/adr/ADR-009-brain-3layer-architektur.md .opencode/skills/references/mcp-tool-guide.md; do test -f "$t" || { echo "LINKZIEL FEHLT: $t"; exit 1; }; done
grep -q "Karten := docs/agent-guide/maps/" docs/brain/recall-routing.md && grep -q "Epic-owned (T900447)" docs/brain/recall-routing.md
```

## Task 3 — Oberflächen (7 Edits, je Hunk gequotet, Rest byte-identisch)

Vor jedem Edit Anker-Grep (genau 1 Treffer), nach jedem Edit Alt=0/Neu=1 prüfen. Symlink-Regel: `.agents/skills -> ../.opencode/skills` und `.claude/skills/references -> ../../.opencode/skills/references` (per `ls -la` verifiziert) — den Tool-Guide genau EINMAL unter `.opencode/` editieren, nie dreifach.

3.1 `AGENTS.md` (Code Discovery, Ist 159). Alt (Zeilen 77-79):

```text
## Code Discovery

Use `codebase-memory-mcp` tools first (before grep/glob): `search_graph`, `trace_path`, `get_code_snippet`, `query_graph`, `get_architecture`, `search_code`.
```

Neu (Absatz ersetzen, Kurzform + Link):

```text
## Code Discovery

Route recall by query type ([recall-routing](docs/brain/recall-routing.md)): known symbol → K3 graph first (`search_graph`, `trace_path`, `get_code_snippet`, `query_graph`, `get_architecture`, `search_code`); semantic question → K1 embeddings first; doctrine/process → authored `docs/` first. Fallback order K1→K3→K4; grep/glob only for string literals and config values.
```

3.2 `docs/agent-guide/registry/capabilities.yaml` (Ist 821), 3 Hunks. Hunk A (Zeilen 360-361):

```text
      use_when: "Erste Anlaufstelle für Code-Struktur: Symbole, Aufrufketten, Architektur, Impact."
      avoid_when: "Nicht-Code-Dateien und freier Text — dafür Grep und Glob."
```

wird zu:

```text
      use_when: "Bekanntes Symbol oder Call-Chain gesucht: K3-Präzisionsschicht zuerst (Details: docs/brain/recall-routing.md)."
      avoid_when: "Semantische Was-Fragen (dafür K1-Embeddings) und Doktrin/Prozess (dafür docs/ direkt)."
```

(110/86 Zeichen, ≤120-er Konvention aus dem Datei-Header `:18`.) Hunk B (Zeilen 369-370):

```text
      use_when: "Embeddings und Reranking über den bge-Stack (semantische Plan- und Wiki-Suche)."
      avoid_when: "Wenn bge-embed im Cluster nicht Ready ist — dann schlägt der Aufruf fehl."
```

wird zu (stales `Wiki-Suche` entfällt):

```text
      use_when: "Semantische Was-Fragen über Code, Specs und Docs: K1-Roh-Recall zuerst (docs/brain/recall-routing.md)."
      avoid_when: "Wenn bge-embed im Cluster nicht Ready ist; bei bekanntem Symbol zuerst K3-Graph."
```

(102/80 Zeichen.) Hunk C (Zeile 329), Alt:

```text
      use_when: "Audit über alle Systeme anfragen (GitOps-Repo, Live-Cluster, Website, Repo, Toolset, Security, DB, LLM-Pipeline, Brain-Wiki) — endet je Befund in Ticket + OpenSpec-Proposal."
```

Nur das Token `Brain-Wiki` wird zu `Authored-Docs` (K4-Rumpf-Begriff, Rest der Zeile identisch; die Zeile übersteigt die 120-er Konvention vor wie nach — vorbestehend, kein neuer Verstoßtyp). Assert: `node scripts/toolset/check.mjs` Exit 0 (fail-closed) plus YAML-Parse ohne Fehler.

3.3 `.opencode/skills/references/mcp-tool-guide.md` (Ist 326). Vor Zeile 260 (`## \`codebase-memory-mcp\` — Code-Wissensgraph`) diese Sektion einfügen; Anker (Zeilen 258-260):

```text
|> also `playwright_*`.

## `codebase-memory-mcp` — Code-Wissensgraph
```

Einfügetext (9 Zeilen):

```text
## Recall-Schichtwahl (K1/K3/K4)

Kurzwahl je Fragetyp (Tiefe: [recall-routing](../../../docs/brain/recall-routing.md)):

- **K1 zuerst** bei semantischer Was-Frage: `bge-mcp` (`bge_embed`, `bge_rerank`) — Roh-Recall über Code, Specs, Docs.
- **K3 zuerst** bei bekanntem Symbol/Call-Chain: `codebase-memory-mcp` (`search_graph`, `trace_path`, `get_code_snippet`, `query_graph`, `get_architecture`, `search_code`) — Präzisions-Check.
- **K4 zuerst** bei Doktrin/Prozess: direkt `docs/` lesen (`docs/adr/`, `docs/runbooks/`, Gotchas, Karten) — kein MCP, Authoring-Stand.
- **Fallback** ohne Typ-Treffer: K1→K3→K4 (Roh-Recall → Präzisions-Check → Doktrin).

```

3.4 `.opencode/prompts/orchestrator.md` (Ist 77, Zeile 64). Alt:

```text
Use `codebase-memory-mcp` first (search_graph, trace_path, get_code_snippet, query_graph). Fall back to grep/glob for string literals, config values, shell scripts.
```

Am Satzende anhängen (eine Zeile, Link als Repo-Pfad): ` Route recall by query type — known symbol → K3 graph, semantic question → K1 embeddings, doctrine/process → authored docs/ (docs/brain/recall-routing.md); fallback order K1→K3→K4.`

3.5 `.opencode/prompts/primary-agent.md` (Ist 33, Zeile 15). Alt:

```text
- Use `codebase-memory-mcp` first for code discovery (search_graph, trace_path, get_code_snippet). Fall back to grep/glob for string literals and config values.
```

Anhängen: ` Recall routing by query type (K3 symbol / K1 semantic / docs/ doctrine, fallback K1→K3→K4): docs/brain/recall-routing.md.`

3.6 `.opencode/prompts/glimmer-primary.md` (Ist 38). Nach Zeile 28 (Anker: `- **Context Efficiency**: You have a 131072 token served-KV window` … `for precise code retrieval.`) eine Bullet-Zeile einfügen:

```text
- **Recall routing**: known symbol → K3 graph, semantic question → K1 embeddings, doctrine/process → authored docs/ (docs/brain/recall-routing.md); fallback order K1→K3→K4.
```

Abschluss-Assert Task 3: `git diff --stat` zeigt genau die 7 Edit-Dateien (plus NEU aus Task 2); `git diff -U0` Review: nur die gequoteten Hunks.

## Task 4 — Regens (nie Hand-Edit an generierten Dateien)

Hinweis: der Task heißt mit Include-Namespace `agents:toolset:map` (`task --list`-verifiziert; das Skript dahinter ist `scripts/toolset/emit-map.mjs`).

```bash
task agents:toolset:map
task agent-guide:emit
git diff --name-only | sort > /tmp/p1-changed.txt; cat /tmp/p1-changed.txt
```

Review-Asserts: `toolset-map.md`-Diff enthält nur die 3 Registry-Folgen (`code-graph`, `embedding-rerank`, `system-audit`); `agent-guide:emit`-Diff (Umbrella aus `Taskfile.yml`: docs + webapp + maps + platform-descriptions) enthält nur Registry-Folge-Hunks; keine einzige Datei außerhalb File Structure ist modifiziert (Abgleich `/tmp/p1-changed.txt` gegen die Liste oben — Fremdeintrag = STOPP und melden). Der Freshness-Gate (`agent-guide.generated.json`) ist via diesen Regen plus Task 5s `freshness:regenerate` abgedeckt.

## Task 5 — Verify (STRUCT3)

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Danach `git status --porcelain`: nur File-Structure-Dateien modifiziert/neu; Fremdeinträge sind Befund, kein stilles Mitcommitten. Baseline-Key-Count bleibt unverändert (keine Baseline-Einträge in p1).
