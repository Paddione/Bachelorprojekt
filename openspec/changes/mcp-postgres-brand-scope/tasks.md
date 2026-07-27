---
title: "mcp-postgres-brand-scope — Implementation Plan"
ticket_id: T002278
domains: [mcp, agent-config, tests]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mcp-postgres-brand-scope — Implementation Plan

_Ticket: T002278 — bug, hoch/major._
Design: `openspec/changes/mcp-postgres-brand-scope/proposal.md`.
Delta-Spec: `openspec/changes/mcp-postgres-brand-scope/specs/mcp-gateway.md`.

## File Structure

```
tests/spec/mcp-gateway.bats                        (geändert — RED-Tests, bereits im Stage-Commit)
docs/agent-guide/registry/mcp.yaml                 (geändert — Brand-Scope-Deklaration)
.claude/skills/references/mcp-tool-guide.md        (geändert — Warnung + Routing-Regel)
CLAUDE.md                                          (geändert — Fehlleitung in Routing-Tabelle korrigiert)
```

Nicht angefasst — bewusst, siehe Proposal §„Bewusst nicht Teil dieses Change":
`k3d/default/claude-code-mcp-monolith-deploy.yaml` (Kollision mit T002321, und ein
`kubectl apply -k k3d/default` wäre nötig, weil das Verzeichnis von keiner Overlay- oder
Flux-Kustomization referenziert wird). Der Change ist damit rein repository-seitig und
braucht **keinen** Deploy-Schritt.

## Budgets (S1)

`docs/code-quality/gates.yaml` §`s1.limits` vergibt Zeilenbudgets ausschließlich für
Code-Endungen (`.astro .ts .svelte .sh .mjs .mts .py .js .jsx .tsx .cjs .bash .java
.php`). Alle vier berührten Dateien sind `.md`, `.yaml` oder `.bats` und tragen daher
**kein** S1-Budget — es gibt nichts zu verkleinern und nichts zu splitten. Die einzige
Größengrenze im Skill-Baum (`tests/spec/agent-skills.bats`, 250 Zeilen) gilt laut
Testkörper nur für `SKILL.md`-Dateien; `mcp-tool-guide.md` ist eine Reference (168 Zeilen)
und fällt nicht darunter.

## Tasks

- [ ] **Failing-Test-Step (RED).** Die fünf Guard-Tests in `tests/spec/mcp-gateway.bats`
      sind bereits Teil des Stage-Commits dieses Branches. Vor der Umsetzung nachweisen,
      dass sie rot sind — und dass die 13 bestehenden Tests der Datei grün bleiben.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/mcp-gateway.bats
# expected: FAIL — 5 not ok:
#   "registry declares mcp-postgres brand binding and target database"
#   "registry names the sanctioned korczewski read path for mcp-postgres"
#   "mcp-tool-guide warns that mcp-postgres is brand-scoped to mentolder"
#   "mcp-tool-guide routes ticket reads to ticket-mcp with explicit brand"
#   "CLAUDE.md routing table no longer sells mcp-postgres as the ticket-query path"
```

- [ ] **Registry: Brand-Scope deklarieren.** In `docs/agent-guide/registry/mcp.yaml` den
      Eintrag `clients.mcp-postgres` um vier Schlüssel **neben** `transport`, `endpoint`
      und `harness` ergänzen (nicht innerhalb `harness`, sonst wandern sie in die
      gerenderten Configs):

```yaml
  mcp-postgres:
    transport: http
    endpoint: http://localhost:13001/mcp
    brand: mentolder
    database: shared-db.workspace.svc.cluster.local/website
    scope_warning: >-
      Fest an die mentolder-DB gebunden (DATABASE_URL im postgres-Container des
      MCP-Monolithen). external_id ist nur pro Brand eindeutig — eine Abfrage nach
      einer korczewski-ID liefert still die gleichnamige mentolder-Zeile statt einer
      leeren Menge. Ticket-Reads gehören zu ticket-mcp mit explizitem brand-Argument.
    korczewski_path: >-
      Nicht-Ticket-SQL gegen die korczewski-DB läuft über kubectl exec gegen den
      shared-db-Pod in Namespace workspace-korczewski (Context fleet), nicht über
      diesen Server.
    harness:
      # unverändert
```

      `brand` muss wörtlich `mentolder` sein und `korczewski_path` die Zeichenkette
      `workspace-korczewski` enthalten — beides prüfen die Guard-Tests.

- [ ] **Nachweisen, dass die Registry-Ergänzung inert ist.** `scripts/mcp-sync.sh` rendert
      aus `harness.*`; die neuen Geschwister-Schlüssel dürfen die drei Harness-Configs
      nicht verändern. Wenn `check` Drift meldet, sind die Schlüssel an der falschen
      Stelle gelandet.

```bash
bash scripts/mcp-sync.sh check
# erwartet: "OK .mcp.json" und "OK .opencode/opencode.jsonc", kein DRIFT
git diff --stat .mcp.json .opencode/opencode.jsonc
# erwartet: leer
```

- [ ] **Tool-Guide: Warnung und Routing-Regel.** In
      `.claude/skills/references/mcp-tool-guide.md` den Abschnitt `## mcp-postgres —
      Read-only SQL` um einen Warnblock ergänzen. Er muss (a) die Formulierung
      „brand-gebunden" oder „nur die mentolder-DB" enthalten, (b) den stillen Fehlgriff
      als Fehlermodus benennen, (c) `T002278` referenzieren und (d) Ticket-Reads auf
      `ticket-mcp` mit gesetztem `brand` umrouten. Inhaltlich zu treffen:

  - `mcp-postgres` liefert für eine korczewski-`external_id` still die gleichnamige
    mentolder-Zeile; das brand-gefilterte Query liefert leer und legt fälschlich nahe,
    der Filter sei falsch.
  - Ticket-Reads (`tickets.*`) → `mcp__ticket-mcp__get_ticket` /
    `mcp__ticket-mcp__list_tickets` mit explizitem `brand`. Diese Wrapper liefern
    `description` und `resolution` vollständig; `mcp-postgres` ist dafür nicht mehr der
    empfohlene Weg.
  - Nicht-Ticket-SQL gegen korczewski → `kubectl exec` gegen den `shared-db`-Pod in
    `workspace-korczewski` (Context `fleet`), analog zum bestehenden `psql()`-Helper,
    aber mit dem korczewski-Namespace.

      In der bestehenden Zeile „**Wann bevorzugen:** Read-only SELECTs gegen `tickets.*`
      …" den `tickets.*`-Teil so umformulieren, dass er auf die neue Routing-Regel
      verweist statt ihr zu widersprechen.

- [ ] **CLAUDE.md: Fehlleitung korrigieren.** In der Agent-Routing-Tabelle trägt die
      `bachelorprojekt-test`-Zeile in der Spalte `MCP-Primär (Claude Code)` derzeit
      wörtlich ``` `mcp-postgres` (localhost:13001) — Ticket-Queries ```. Auf
      `ticket-mcp` als primären Weg für Ticket-Reads umstellen und `mcp-postgres` dort
      allenfalls als brand-gebundenen Read-Pfad für Nicht-Ticket-Tabellen nennen. Die
      `bachelorprojekt-db`-Zeile darf `mcp-postgres` behalten — dort geht es um
      Datenbankarbeit, nicht um Ticket-Lookups; ein Hinweis auf die mentolder-Bindung
      gehört aber auch dahin.

      Danach prüfen, ob `AGENTS.md` dieselbe Tabelle spiegelt (CLAUDE.md nennt AGENTS.md
      als SSOT der Routing-Signale) und dort synchron nachziehen, falls die Zeichenkette
      auch dort steht.

```bash
grep -rn 'Ticket-Queries' CLAUDE.md AGENTS.md
# erwartet nach dem Fix: kein Treffer, der mcp-postgres als Ticket-Query-Weg ausweist
```

- [ ] **Guard-Tests grün (GREEN).** Dieselbe Datei erneut laufen lassen; alle 18 Tests
      müssen bestehen.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/mcp-gateway.bats
# erwartet: 18 ok, 0 not ok
```

- [ ] **OpenSpec-Validierung.** Das Delta gegen `openspec/specs/mcp-gateway.md` muss das
      fail-closed CI-Gate passieren.

```bash
task openspec:validate
```

- [ ] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

## Hinweise für die Umsetzung

- **Nicht** `k3d/default/claude-code-mcp-monolith-deploy.yaml` anfassen. T002321 arbeitet
  parallel im selben `env`-Array (`PGOPTIONS`); `DATABASE_URL` bleibt unverändert korrekt
  für den mentolder-Zweck. Ein Manifest-Eingriff brächte hier keinen funktionalen Gewinn
  und erzwänge ein `kubectl apply -k k3d/default`.
- **Nicht** die Read-only-Eigenschaft des Servers behandeln (`ALTER USER`) — das ist
  T002307.
- `openspec/specs/mcp-gateway.md` behauptet laut T002312 fälschlich, der MCP-Monolith sei
  dekommissioniert. Diese Falschaussage gehört zu T002312 und wird hier nicht mitgefixt;
  das Delta dieses Change ergänzt nur neue Requirements.
- Die Registry-Schlüssel bewusst unter `clients:` und nicht unter `cluster.containers:`
  ablegen — T002321 arbeitet im Container-Abschnitt, `clients:` bleibt konfliktfrei.
