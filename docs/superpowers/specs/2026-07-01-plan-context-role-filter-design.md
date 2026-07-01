---
ticket_id: T001387
plan_ref: openspec/changes/plan-context-role-filter/tasks.md
status: active
date: 2026-07-01
---

# Design: plan-context-role-filter

**Datum:** 2026-07-01
**Slug:** `plan-context-role-filter`
**Ticket:** T001387 (Mishap aus T001374 M3)
**Status:** approved

---

## Kontext & Problem

`scripts/plan-context.sh <role> --with-openspec` ist der zentrale Hook, mit dem die
Orchestrator-Session Subagent-Dispatches vorbereitet: das Skript gibt die Liste
der aktuell aktiven OpenSpec-Change-Proposals aus, die der Subagent als
`<active-plans>`-Block in seinen Kontext injiziert bekommt.

Aktuell nimmt das Skript `<role>` als Pflichtargument (Zeile 10:
`ROLE="${1:?Usage: plan-context.sh <role> …}"`), iteriert danach aber
**ungefiltert** über jeden nicht-archivierten Change (`for proposal_file in
"$CHANGES_DIR"/*/proposal.md`).

**Konsequenz** (gemessen in T001374):
- Jeder dispatchte Subagent bekommt ~17.000 Zeilen Output in den Kontext
  geschoben — egal welche Rolle er hat.
- Davon ist der Großteil (Schätzung: >90 %) für seine konkrete Aufgabe
  irrelevant.
- Kontext-Budget wird verschwendet, die Aufmerksamkeit des Modells wird
  auf nicht-zugehörige Pläne gelenkt, teils entstehen Halluzinationen die
  auf einen "passend gemachten" aber falschen Plan verweisen (das ist die
  Beobachtung aus M3).

Die Rolle steht also im Usage-String, ist aber toter Ballast — das ist
ein klassischer "Parameter ohne Wirkung"-Bug.

---

## Root Cause

Eine einzige Code-Stelle:

```bash
ROLE="${1:?Usage: plan-context.sh <role> [--with-openspec [<file>...]]}"   # Zeile 10
shift
...
for proposal_file in "$CHANGES_DIR"/*/proposal.md; do                      # Zeile 28
    [[ -f "$proposal_file" ]] || continue
    slug=$(basename "$(dirname "$proposal_file")")
    [[ "$slug" == "archive" ]] && continue
    ...
    cat "$proposal_file"                                                   # Zeile 38
    ...
done                                                                       # Zeile 46
```

`ROLE` wird nie gelesen. Die Schleife filtert nur den `archive/`-Ordner
heraus — mehr nicht.

---

## Fix-Ansatz

### Filterquelle: Proposal-Frontmatter `domains:`

`openspec/changes/<slug>/proposal.md` und `openspec/changes/<slug>/tasks.md`
tragen in ihrer YAML-Frontmatter ein `domains: [...]`-Feld (von
`scripts/plan-frontmatter-hook.sh` bzw. `vda.sh frontmatter` geschrieben).
Die existierenden Pläne verwenden Tokens wie `website`, `ops`, `infra`,
`db`, `security`, `test`, `quality`, `ci`, `brett`, `llm`, `secrets` —
kurz: das Token-Inventar entspricht in weiten Teilen den "Signals" der
Agent-Routing-Tabelle in `AGENTS.md`.

**Filterregel (Vorschlag):**

> Ein Proposal wird in den Output aufgenommen genau dann, wenn die
> Schnittmenge von `proposal.md`-Frontmatter `domains: [...]` und der
> Domain-Allowlist der Rolle `<role>` nicht leer ist.

### Role → Domain-Allowlist

Hartkodierter Lookup im Skript (Kommentar verweist auf `AGENTS.md` Zeile 7-18
als SSOT für die Signale):

| Rolle (`<role>`)         | Domain-Allowlist                                                     |
|--------------------------|----------------------------------------------------------------------|
| `bachelorprojekt-website`| `website frontend design ui svelte astro css brett`                 |
| `bachelorprojekt-ops`    | `ops llm k8s observability livekit monitoring`                       |
| `bachelorprojekt-infra`  | `infra deploy k3d kustomize prod environments taskfile`              |
| `bachelorprojekt-test`   | `test tests bats playwright factory qa`                              |
| `bachelorprojekt-db`     | `db postgres tracking timeline database`                             |
| `bachelorprojekt-security` | `security secrets keycloak oidc sealed-secret dsgvo credentials`  |
| `orchestrator` / leer    | **alle** (Escape-Hatch für Cross-Cutting-Requests)                  |

Der Lookup wird im Skript als `case "$role" in …` deklariert — klein,
lokal, ohne externe Abhängigkeit, ohne YQ/JQ. Wenn die Agent-Routing-Tabelle
in `AGENTS.md` wächst, muss dieser Lookup mitwachsen (im PR-Checkout
manuell verifizieren — ein Linter-Gate ist nicht Ziel dieser PR, da die
Tabelle klein und code-review-kontrolliert bleibt).

### Edge Cases

| Situation | Verhalten |
|-----------|-----------|
| `proposal.md` ohne `domains:`-Frontmatter | **Include** (Default-Allow für Legacy-Pläne, mit `WARN:`-Marker in stderr — diese müssen in einer Folge-PR auf `domains: [...]` migriert werden) |
| `proposal.md` mit `domains: []` (explizit leer) | **Exclude** (explizit = verbindlich) |
| `proposal.md` mit `domains: [quality, tests, infra]` | **Include** für jede Rolle deren Allowlist `quality`, `tests` oder `infra` enthält → also `bachelorprojekt-test` und `bachelorprojekt-infra` |
| Rolle unbekannt (nicht in der Lookup-Tabelle) | **Include all** + `WARN: unknown role '<role>'` in stderr (Fail-Soft, damit der Orchestrator nicht in einer leeren Active-Plans-Liste landet wenn er einen Tippfehler macht) |
| `role=orchestrator` (Cross-Cutting) | **Include all** (kein Filter) |
| Vorschlag mit `archive/`-Slug | wie bisher excluded |

### Bestehende Skript-Semantik

- `--with-openspec` (OpenSpec-SSOT-Specs anhängen) bleibt unverändert — der
  Filter wirkt **nur** auf die Change-Proposal-Liste.
- `--semantic <query>` (semantische Nachbarn via `/api/openspec/search`)
  bleibt unverändert — semantische Treffer sind orthogonal zum Rollen-Filter.

---

## Betroffene Subsysteme

| Datei | Art | S1-Budget |
|-------|-----|-----------|
| `scripts/plan-context.sh` | Edit (Logik-Erweiterung) | Ist 80, nicht-baselined, Limit 500 → **Budget 420**, nach Edit voraussichtlich ~140 Zeilen → Rest ~360 |
| `tests/spec/plan-context.bats` | Neu (Failing Test) | Neue Datei, `.bats` ist ungated → kein S1-Limit |
| `openspec/specs/dev-flow-plan.md` | Edit (Delta einfügen) | bestehende SSOT — Delta-Hinzufügung im Change-Ordner, Archiv-Merge überschreibt |
| `openspec/changes/plan-context-role-filter/` | Neu | Change-Ordner (vom `openspec.sh propose` geseedet) |

Keine Auswirkungen auf:
- `scripts/openspec.sh` (Propose-Lifecycle bleibt gleich)
- `scripts/openspec-embed.mjs` (semantischer Index unverändert)
- Andere Subagent-Skills (deren einziger Berührungspunkt ist der
  `plan-context.sh`-Aufruf, der nun korrekt filtert)

---

## Test-Strategie (RED → GREEN)

Hermetischer BATS-Test in `tests/spec/plan-context.bats`:

1. **Setup:** Eine `tmpdir` mit einem Mini-`openspec/changes/` anlegen
   (Fixtures: 3 Proposals mit unterschiedlichen `domains:`-Frontmattern,
   1 Proposal ohne `domains:`, 1 in `archive/`).
2. **`@test "filter includes matching role domains"`:** Aufruf mit
   `role=ops` → Proposal mit `domains: [ops, llm]` MUSS im Output sein,
   Proposal mit `domains: [website]` MUSS NICHT im Output sein.
3. **`@test "filter excludes non-matching role domains"`:** Aufruf mit
   `role=website` → inverses Bild.
4. **`@test "filter treats missing domains as include"`:** Proposal ohne
   `domains:`-Frontmatter MUSS in beiden Rollen erscheinen.
5. **`@test "filter treats empty domains as exclude"`:** Proposal mit
   `domains: []` MUSS in beiden Rollen fehlen.
6. **`@test "orchestrator role sees all proposals"`:** Aufruf mit
   `role=orchestrator` → alle Proposals inkl. `archive/`-Ausschluss.
7. **`@test "unknown role warns and includes all"`:** Aufruf mit
   `role=foobar` → Output enthält alle Proposals + `WARN: unknown role`
   in stderr.

Diese Suite ist der RED-Stand, der nach dem Implementierungs-Schritt GREEN
werden muss.

---

## Verifikations-Gates

Der finale Verifikations-Task des Plans enthält die drei Pflicht-Commands:
- `task test:changed`
- `task freshness:regenerate`
- `task freshness:check`

Plus die gezielte BATS-Suite:
- `tests/unit/lib/bats-core/bin/bats tests/spec/plan-context.bats`

---

## Out of Scope (für Folge-Tickets)

- Linter-Gate, das die hartkodierte Role→Domains-Tabelle in
  `plan-context.sh` gegen die `AGENTS.md`-Tabelle diff't. Aktuell reicht
  ein Code-Reviewer-Auge; eine spätere PR kann `scripts/check-role-table.sh`
  + `task role-table:check` ergänzen.
- Migration der Legacy-Pläne ohne `domains:`-Frontmatter. Der `WARN:`
  -Marker in `plan-context.sh` stderr listet sie pro Aufruf — eine
  Folge-PR kann `task plan-context:migrate-domains` bauen.
- Filter nach Ticket-`areas:`-Feld (Postgres-Lookup). Der jetzige Fix
  nutzt nur die lokal vorhandenen Proposal-Frontmatter, weil das
  `--with-openspec` offline funktionieren muss (kein Cluster-Zwang).
