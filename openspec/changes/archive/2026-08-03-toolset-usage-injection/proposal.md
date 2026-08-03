---
domains: [agent-guide, tooling, plan-authoring]
status: planning
ticket_id: T002592
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Proposal: toolset-usage-injection

## Why

Werkzeug-Wissen liegt heute in drei Registern, die nichts voneinander wissen:

| Register | Umfang | Beantwortet |
|---|---|---|
| `docs/agent-guide/registry/capabilities.yaml` (71 Z.) | 15 Instanzen, nur `mcp:`/`cli:`/`skill:` vereinzelt | „Darf ich?" |
| `.claude/skills/references/mcp-tool-guide.md` (262 Z.) | 13 MCP-Server, handgepflegte Prosa | „Wann bevorzugen, was ist der Fallback?" |
| `docs/agent-guide/registry/tools.yaml` (320 Z.) | Skills/Tasks/Agenten, menschenlesbar | „Wofür ist das da?" |

Daraus folgen zwei belegbare Lücken:

1. **Die Quarantäne aus dem SSOT-Spec existiert nicht.** `openspec/specs/toolset-registry.md`
   verlangt, dass eine von `collect.mjs` entdeckte, in `capabilities.yaml` fehlende Instanz als
   `unreviewed` gemeldet wird. `collect.mjs` liest jedoch ausschließlich `mcpServers` aus den
   Harness-Configs — die rund 35 Einträge unter `enabledPlugins` in `.claude/settings.json`
   werden nie gesehen, und `check.mjs` meldet trotzdem `Toolset registry check passed.`
   Der Spec-Satz „SHALL be reported as `unreviewed` with a warning" ist damit unerfüllt.

2. **Es gibt keinen Injektionspfad.** `scripts/plan-context.sh <role>` injiziert Plan-Kontext
   rollengefiltert in Agent-Prompts; für Werkzeuge existiert kein Pendant. Ein Subagent bekommt
   deshalb entweder das komplette Arsenal oder gar keine Führung — und wählt im Zweifel den
   nicht-kanonischen Pfad (`gh` statt `gh-axi`, `kubectl exec … psql` statt `ticket-mcp`).

`.claude/skills/toolset-curate/SKILL.md` ist ein Stub aus drei Aufzählungspunkten
(`collect.mjs` → „Status klären" → `sync.mjs`); der eigentliche Kurationsvorgang ist
unspezifiziert, und der Skill wurde nie benutzt.

## What

`capabilities.yaml` wird vom **Erlaubnis**- zum **Kurations**-Register erweitert und speist einen
rollengefilterten Werkzeug-Block für Agent-Dispatches.

**1. Schema-Erweiterung.** Jede Instanz trägt zusätzlich zu `state`/`reason`:

```yaml
capabilities:
  ticket-lifecycle:
    mcp:ticket-mcp:
      state: canonical
      use_when: "Ticket lesen, anlegen, Status setzen, Plan stagen"
      avoid_when: "Bulk-SQL über Nicht-Ticket-Tabellen; stage_plan im Worktree"
      fallback: "scripts/ticket.sh — sanktionierter Write-Pfad, funktioniert im Worktree"
      roles: [bachelorprojekt-test, bachelorprojekt-db, orchestrator]
      tier: caution
      deep_ref: ".claude/skills/references/mcp-tool-guide.md#ticket-mcp"
```

**2. Vollständige Erfassung.** `collect.mjs` erfasst erstmals auch `plugin:` (aus
`enabledPlugins`), `skill:` (aus `.claude/skills/*/SKILL.md`), `cli:` und `agent:` und meldet
jede nicht in der Registry gelistete Instanz als `unreviewed` — warnend, nicht fail-closed, wie
der SSOT-Spec es vorschreibt.

**3. Injektion.** Neu: `scripts/toolset-context.sh <rolle>` rendert den `<toolset>`-Block für
genau eine Rolle, als Pendant zu `plan-context.sh`:

```bash
context=$(bash scripts/toolset-context.sh bachelorprojekt-db)
[ -n "$context" ] && prompt="<toolset>\n${context}\n</toolset>\n\n${task_prompt}"
```

**4. Kuration.** `toolset-curate` wird der interaktive Workflow: `unreviewed` auflisten, je
Eintrag Capability-Überlappung und — wo vorhanden — die in `toolset.lock.yaml` gemessene
Tool-Zahl zeigen, Entscheidung samt Begründung und Nutzungsfeldern erfassen, `sync.mjs` und
`check.mjs` nachziehen.

### Entscheidungen und ihre Begründung

- **Ein Register statt zwei.** Nutzungssemantik geht in `capabilities.yaml`, nicht in eine
  separate `tool-usage.yaml`. Zwei Dateien müssten synchron gehalten werden und bräuchten einen
  eigenen Drift-Guard.
- **`toolset-context.sh` ist fail-closed.** Eine unbekannte Rolle beendet das Skript mit Exit ≠ 0.
  `plan-context.sh` fällt in diesem Fall still auf `__ALL__` zurück (T002322) und der Rollenfilter
  wirkt dann gar nicht — bei einem Werkzeug-Block hieße das, dem Agenten das gesamte Arsenal zu
  injizieren, also genau den Kontext-Bloat zu erzeugen, den die Kuration verhindern soll.
- **`mcp-tool-guide.md` wird NICHT generiert.** Die Datei bleibt handgepflegte Tiefenreferenz;
  der Block verlinkt per `deep_ref` dorthin. Ihre 262 Zeilen tragen Guard-Wissen — Portforward-
  Guard, Prod-Write-Guard (T001954), read-only-Transaktionssemantik von `mcp-postgres` —, das ein
  einzeiliges YAML-Feld nicht verlustfrei aufnimmt. `tests/spec/mcp-tooling.bats`, das jedes im
  Go-Quellcode exponierte `ticket-mcp`-Tool gegen diese Datei prüft, bleibt unangetastet.
- **Rollen-Vokabular sind volle Namen.** `bachelorprojekt-{website,ops,infra,test,db,security}`
  plus `orchestrator` — identisch zur Allowlist in `plan-context.sh`, damit ein Dispatch beide
  Skripte mit derselben Variable aufrufen kann.

### Nicht Teil dieses Vorgangs

- `sync.mjs` bleibt unverändert: die Durchsetzung von `suppressed` funktioniert bereits und wird
  durch die neuen Felder nicht berührt.
- `tools.yaml` und `tools-map.md` bleiben, was sie sind — die menschenlesbare Agent-Guide-Karte.
  Sie werden als Quelle für die Befüllung gelesen, nicht umgebaut.
- Automatische Verdrahtung in die Agent-Dispatch-Pfade der `dev-flow-*`-Skills. Dieser Vorgang
  liefert Skript und Dokumentation in `CLAUDE.md`/`AGENTS.md`; das Einweben in jeden einzelnen
  Dispatch-Aufruf ist ein Folgevorgang.

_Ticket: T002592_
