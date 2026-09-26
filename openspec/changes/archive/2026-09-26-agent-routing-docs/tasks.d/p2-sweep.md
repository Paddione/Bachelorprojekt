---
title: "p2-sweep — Stale-Ingest-Referenzen fegen"
ticket_id: T900453
domains: [docs, cleanup]
status: active
---

# p2-sweep — Implementation Plan

_Ticket T900453 · Change `agent-routing-docs` · Epic T900447._ Dieses Partial fegt die stalen Brain-Ingest-Verweise, die in keinem anderen Scope liegen (Design E6); es läuft nach p1 im selben Worktree (`docs/brain/recall-routing.md` existiert bereits). Plan-Intel: `scripts/plan-intel-filter.sh` meldet `intel.json not found` — alle Werte unten stammen aus direkten Quell-Reads (grep fallback), je Wert mit Datei:Zeile belegt.

## File Structure

| Pfad | Ist | S1 |
|---|---|---|
| `docs/runbooks/brain-ingest.md` (DEL) | 201 | `.md` ungated, nicht-baselined → n/a; `git rm` |
| `docs/agent-guide/registry/skills.yaml` | 1176 | `.yaml` ungated, nicht-baselined → n/a; Block 47-67 entfällt |
| `.opencode/skills/system-audit/SKILL.md` | 213 | `.md` ungated, nicht-baselined → n/a; Zeile 29 + Block 117-124 entfallen |
| `.opencode/skills/references/deploy-routing.md` | 77 | `.md` ungated, nicht-baselined → n/a; Zeilen 33/45 entfallen, Token in 11 entfällt |
| `docs/brain/k5-openspec.md` | 179 | `.md` ungated, nicht-baselined → n/a; Hunk 81-84 wird 2-zeiliger Retired-Hinweis |
| `docs/brain/k2-bge-paare.md` | 171 | `.md` ungated, nicht-baselined → n/a; Zeile 87 zeilenneutral umformuliert |
| `docs/diagrams/brain-architektur-gesamtbild.md` | 285 | `.md` ungated, nicht-baselined → n/a; Zeile 13 umformuliert + 2 Zeilen Snapshot-Hinweis (Ist 287 nachher) |
| `docs/diagrams/k1-vector-db.md` | 124 | `.md` ungated, nicht-baselined → n/a; +6 Zeilen Addendum am Ende |
| `CLAUDE.md` | 193 | `.md` ungated, nicht-baselined → n/a; 1 Token in Zeile 27 entfällt, zeilenneutral |

S1-Legende: `docs/code-quality/gates.yaml` → `s1.limits` kennt nur `.astro/.ts/.svelte/.sh/.mjs/.mts/.py/.js/.jsx/.tsx/.cjs/.bash/.java/.php` — `.md` und `.yaml` sind ungated (verifiziert per grep, nicht angenommen). `jq`-Lookup (`S1:<pfad>`) meldet für alle 9 Dateien `nicht-baselined`. Keine Baseline-Einträge, keine S4-Artefakte.

## Scope-Grenze

Nicht in p2 (disjunkt, anderswo owned): alle p1-Dateien (Routing-Seite, `AGENTS.md`, `capabilities.yaml`, `mcp-tool-guide.md`, 3 Prompts, p1-Regens), `tests/` (p-tests, dort liegt auch STRUCT2), `docs/brain/k3-code-graph.md` (nur verlinken), `docs/brain/k4-brain-wiki.md` (5/6 löscht sie), `CLAUDE.md:128,147` (5/6-owned), `freshness-regen.yml`, `docs/legacy-html/`, `openspec/archive/`, Historie. Innerhalb der p2-Dateien bleiben unberührt: `gesamtbild.md:37,88,91,146` (weitere Ingest-Erwähnungen, nicht im benannten Hunk), `k5-openspec.md:85-87` (Folgeprosa, außerhalb des Pfeil-Hunks), `deploy-routing.md:72-74` (Footgun-Bullet, Taskfile-owned), `k1-vector-db.md:30,98` (Hook-Passagen selbst, nur Addendum dazu).

## Task 1 — Löschung + Registry (Runbook DEL, skills.yaml-Block)

1.1 Staleness-Beleg lesen (Kopf von `docs/runbooks/brain-ingest.md:1-16`, beschreibt die gelöschte Pipeline als Soll-Zustand):

```text
# Runbook: Brain-Ingest (LLM-Wiki-Kompilierung)

Betreibt den vollautomatischen Brain-Ingest: transformiert Bachelorprojekt-Quellen
(SSOT-Specs, Runbooks, ADRs, Gotchas, Agent-Guide-Maps, Core-Doku, Health-Goals,
Diagramme) per lokalem LLM in Wiki-Seiten und liefert sie per PR an das externe
Repo `Paddione/brain`. Enthält **keine** Credentials.

Soll-Zustand im Repo:

- `scripts/brain-ingest.sh` — Pipeline (Chunking → LLM-Transform → MOC → Prune → Gates → Delivery)
```

Gegenbeleg (alle drei fehlen im Worktree, verifiziert): `scripts/brain-ingest.sh`, `scripts/brain/`, `.opencode/skills/brain-ingest`. Dann löschen:

```bash
ls docs/runbooks/brain-ingest.md && test "$(wc -l < docs/runbooks/brain-ingest.md | tr -d ' ')" = "201"
test ! -e scripts/brain-ingest.sh && test ! -e scripts/brain && test ! -e .opencode/skills/brain-ingest
git rm docs/runbooks/brain-ingest.md
```

1.2 `docs/agent-guide/registry/skills.yaml`: Block Zeilen 47-67 entfernen (exakte Spanne, Delegations-Schätzung 47-65 war um 2 Zeilen zu kurz — `sync` + `exclusions` gehören zum Block). Anker: `grep -n "id: brain-ingest" docs/agent-guide/registry/skills.yaml` → genau Zeile 47; Vorgänger Zeile 46 `    exclusions: {}`, Nachfolger Zeile 68 `  - id: database-specialist`. Alt (47-67):

```text
  - id: brain-ingest
    provenance: project
    exposure: portable
    source: .agents/skills/brain-ingest
    harnesses:
      codex:
        path: .agents/skills/brain-ingest
        sync: identical
      agy:
        path: .agents/skills/brain-ingest
        sync: identical
      opencode:
        path: .opencode/skills/brain-ingest
        sync: identical
      claude_code:
        path: .claude/skills/brain-ingest
        sync: identical
      muse:
        path: .agents/skills/brain-ingest
        sync: identical
    exclusions: {}
```

Rest der Datei byte-identisch. Regen-Frage (mit Evidenz beantwortet, nicht angenommen): `agent-guide:docs` regeneriert NICHT aus `skills.yaml` — `scripts/agent-guide/load.mjs:7` lädt nur `taxonomy, guardrails, tools, goals, components, agents`, `validate.mjs`/`emit-maps.mjs`/`emit-webapp.mjs` enthalten 0 `skills`-Treffer. Konsumenten sind nur `scripts/agent-skills/project.mjs` (Check-only-Projektions-Validator, in keinem Task verdrahtet) und `scripts/vendor-sync.py` (liest das Inventar). Folge: kein Regen-Command, nur Validierung:

```bash
test "$(grep -c 'brain-ingest' docs/agent-guide/registry/skills.yaml)" = "0"
yq eval '.' docs/agent-guide/registry/skills.yaml > /dev/null && echo "yaml ok"
node scripts/agent-skills/project.mjs --check
```

## Task 2 — Skill-Doku (system-audit + deploy-routing, Symlink-Disziplin)

Symlink-Regel zuerst verifizieren, dann genau EINMAL unter `.opencode/` editieren: `.agents/skills -> ../.opencode/skills` (Verzeichnis-Symlink) und `.claude/skills/system-audit`, `.claude/skills/references` (Einzel-Symlinks auf die `.opencode/`-Gegenstücke) — alle per `ls -la` belegt. Niemals dreifach editieren.

2.1 `.opencode/skills/system-audit/SKILL.md`, 2 Hunks. Hunk A — Tabellenzeile 29 entfernen, Alt:

```text
| `brain-wiki` | Brain-Wiki-Frische gegen die Quellen | Skill `brain-ingest` Dry-Run | delegiert |
```

Anker: `grep -n "brain-wiki.*Frische" .opencode/skills/system-audit/SKILL.md` → genau 1 Treffer. Hunk B — Sektion Zeilen 117-124 entfernen (Überschrift + Absatz + Folge-Leerzeile, damit `## Phase B` direkt auf den §5-Absatz folgt), Alt:

```text
### brain-wiki → `task brain:ingest:dry` (direkt, nicht über `brain-ingest`-Skill)

Der `brain-ingest`-Skill ist write-heavy (kompiliert und publishet die Wiki). Für den Audit
reicht der Dry-Run-Task: `task brain:ingest:dry` (bzw. Worklist-Generierung; der Task setzt
LM_MODEL-Default `gemma-4-12b-qat` und den Ingest-Pool `:8093`, überschreibbar via Environment).
Jede Quelle, die eine Wiki-Seite ändern würde, ist ein Warning-Befund (Wiki driftet); ein
fehlgeschlagener Dry-Run ist Critical.

```

Anker: `grep -n "brain-wiki →" .opencode/skills/system-audit/SKILL.md` → genau Zeile 117. Assert: `test "$(grep -c 'brain-ingest\|brain-wiki\|brain:ingest' .opencode/skills/system-audit/SKILL.md)" = "0"`.

2.2 `.opencode/skills/references/deploy-routing.md`, 3 Stellen. Fail-closed-Vorbedingung (E7: 5/6 hat den Workflow entfernt; p1-Task-1-Gate läuft vorher, hier nur erneut prüfen):

```bash
test ! -f .github/workflows/build-docs.yml || { echo "STOPP: build-docs.yml existiert noch — 5/6 unvollständig, keine deploy-routing-Edit."; exit 1; }
```

Hunk A — Zeile 11, nur das Token `, \`build-docs.yml\`` entfernen. Alt:

```text
> Images baut GitHub Actions (`build-website.yml`, `build-brett.yml`, `build-docs.yml`).
```

Neu:

```text
> Images baut GitHub Actions (`build-website.yml`, `build-brett.yml`).
```

Hunk B — Zeile 33 (ganze `docs/**`-Zeile, ihr einziger Weg war der gelöschte Workflow) entfernen. Alt:

```text
| `docs/**` | `.github/workflows/build-docs.yml`. Break-Glass: `task docs:deploy`. |
```

Hunk C — Zeile 45 (Auto-Detection-Echo) entfernen. Alt:

```text
echo "$CHANGED" | grep -qE '^docs/'     && echo "→ build-docs.yml (kein lokaler Build)"
```

Anker vor jedem Hunk: `grep -n "build-docs" .opencode/skills/references/deploy-routing.md` → genau die Zeilen 11, 33, 45. Assert danach: `test "$(grep -c 'build-docs' .opencode/skills/references/deploy-routing.md)" = "0"`; Rest der Datei byte-identisch (Review per `git diff -U0`).

## Task 3 — Diagramm-/Dok-Fixes + Entfernungs-Asserts

Vorbedingung: `test -f docs/brain/recall-routing.md` (p1 liegt im selben Worktree darunter). Vor jedem Edit Anker-Grep (genau 1 Treffer), nach jedem Edit Alt=0/Neu=1.

3.1 `docs/brain/k5-openspec.md`, Hunk Zeilen 81-84 (Pfeil) → Retired-Stand. Alt:

```text
  scripts/brain/ingest-sources.yaml
    Gruppe "ssot-specs" ──► liest openspec/specs/*.md (SSOT, NICHT
                              openspec/changes/) ──► scripts/brain-ingest.sh
                              ──► externes Repo Paddione/brain
```

Neu (durchgestrichener Pfeil + Einzeiler; Kopf 79-80 und Folgeprosa 85-87 bleiben):

```text
  ~~scripts/brain/ingest-sources.yaml → scripts/brain-ingest.sh → Paddione/brain~~
  (stillgelegt, K4-Retire: externer Mirror ausgebaut, K4-Kern liegt in docs/)
```

Anker: `grep -n "scripts/brain-ingest.sh" docs/brain/k5-openspec.md` → genau Zeile 83. Assert: `test "$(grep -c 'brain-ingest.sh' docs/brain/k5-openspec.md)" = "0"`.

3.2 `docs/brain/k2-bge-paare.md`, Zeile 87 minimal umformulieren. Alt:

```text
| `scripts/brain-ingest.sh` | Brain-Wiki-Ingestion |
```

Neu:

```text
| `scripts/brain-ingest.sh` (entfernt) | Brain-Wiki-Ingestion (stillgelegt, K4-Retire) |
```

Anker: `grep -n "Brain-Wiki-Ingestion" docs/brain/k2-bge-paare.md` → genau Zeile 87.

3.3 `docs/diagrams/brain-architektur-gesamtbild.md`, nur K4-Zeile 13. Alt:

```text
| K4 | Brain-Wiki (Paddione/brain) | Externes Repo, ingest aus openspec/specs/ + docs/ | T002434 (in Arbeit) |
```

Neu (Retired-Mirror + Rumpf):

```text
| K4 | Authored-Docs-Kern in `docs/` (Mirror stillgelegt) | ADRs, Runbooks, Gotchas, Karten; kein externes Repo mehr | `docs/brain/recall-routing.md` |
```

Anker: `grep -n "| K4 |" docs/diagrams/brain-architektur-gesamtbild.md` → genau Zeile 13. Assert zeilenscharf (Zeilen 37/88/91/146 bleiben bewusst unberührt): `sed -n '13p' docs/diagrams/brain-architektur-gesamtbild.md | grep -q "Mirror stillgelegt"`.

Zusatz (2 Zeilen einfügen): Das Diagramm ist ein Pre-Epic-Snapshot (K1-Hook- und K4-Ingest-Pfade darin sind historisch). Vor den ersten ```-Zaun (Anker: `grep -n '^```$' docs/diagrams/brain-architektur-gesamtbild.md | head -1`) diese Hinweiszeile + Leerzeile einfügen:

```text
> Stand 2026-08-02: Diagramm zeigt die Welt vor dem Epic-Umbau (K1 merge-getrieben seit 2/6, K4-Mirror stillgelegt seit 4/6) — aktuell: `docs/brain/recall-routing.md`.
```

3.4 `docs/diagrams/k1-vector-db.md`: kein Rewrite, nur Addendum am Dateiende (6 Zeilen):

```text

## Addendum (2026-09-26, T900453)

Der post-commit-Hook (`scripts/index-repo.ts`, oben Zeilen 30/98) ist durch
merge-getriebene In-Cluster-Embeds ersetzt (Change 2/6); die Hook-Passagen oben
beschreiben den historischen Stand.
```

Assert: `tail -6 docs/diagrams/k1-vector-db.md | grep -q "In-Cluster-Embeds"`; `git diff --stat` zeigt nur angehängte Zeilen.

3.5 `CLAUDE.md`, nur Zeile 27 (Zeilen 128/147 sind 5/6-owned und bleiben unberührt). Token entfernen — Alt-Ausschnitt:

```text
`bge-mcp`, `brain-mcp-node`, `codebase-memory-mcp`
```

Neu-Ausschnitt:

```text
`bge-mcp`, `codebase-memory-mcp`
```

Anker: `grep -n "brain-mcp-node" CLAUDE.md` → genau Zeile 27. Assert: `test "$(grep -c 'brain-mcp-node' CLAUDE.md)" = "0"`; Zeilenzahl unverändert (193).

## Task 4 — Verify (STRUCT3)

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Danach `git status --porcelain`: nur File-Structure-Dateien modifiziert/gelöscht; Fremdeinträge sind Befund, kein stilles Mitcommitten. Baseline-Key-Count bleibt unverändert (keine Baseline-Einträge in p2).
