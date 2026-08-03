---
name: toolset-curate
description: Use to curate the tool registry — decide which instance provides a capability, record why, and capture when it should be used. Triggers on toolset-curate, unreviewed tools, capabilities.yaml, toolset:check, "which MCP server should I use", "a new plugin appeared", tool registry, Werkzeug-Kuration, toolset-context. Also the place to look up how the curated toolset is injected into an agent prompt.
---

# toolset-curate — Werkzeug-Kuration & Agent-Injektion

Zwei zusammenhängende Aufgaben:

1. **Kuration** — unkuratierte Werkzeug-Instanzen entscheiden und ihre Nutzungssemantik
   in `docs/agent-guide/registry/capabilities.yaml` festhalten.
2. **Injektion** — den kuratierten Satz rollengefiltert in einen Agent-Prompt geben.

Der zweite Punkt ist der Zweck des ersten. Ohne ihn ist die Registry eine Liste, die niemand
liest; mit ihm entscheidet sie, welches Werkzeug ein Subagent überhaupt in Betracht zieht.

## Was die Registry hält

`capabilities.yaml` ordnet jeder **Fähigkeit** die Instanzen zu, die sie liefern können, und
hält je Instanz fest, wann sie einzusetzen ist:

```yaml
capabilities:
  ticket-lebenszyklus:
    mcp:ticket-mcp:
      state: canonical          # canonical | suppressed | unreviewed
      use_when: "Tickets lesen, anlegen, Status setzen, Plan stagen."
      avoid_when: "stage_plan im Worktree — schlägt dort immer fehl."
      fallback: "scripts/ticket.sh (worktree-tauglich)"
      roles: [bachelorprojekt-test, bachelorprojekt-db, orchestrator]
      tier: caution             # safe | caution | assisted | dangerous
      deep_ref: ".claude/skills/references/mcp-tool-guide.md"
```

`state` und `reason` regeln die **Auswahl** (was ein Harness benutzen darf), die übrigen Felder
die **Nutzung**. Zwei harte Regeln, beide von `check.mjs` erzwungen:

- `canonical` ohne `use_when` **oder** ohne nicht-leere `roles` → Exit ≠ 0. Ohne diese Felder
  lässt sich die Instanz nicht in einen Prompt rendern; die Registry behauptete dann eine
  Kuration, die nicht stattgefunden hat.
- Jeder non-canonical State braucht einen `reason`.

> **`avoid_when` ist kein Ersatz für die Tiefenreferenz.** Die Guard-Prosa —
> Portforward-Guard, Prod-Write-Guard (T001954), die read-only-Transaktionssemantik von
> `mcp-postgres` — bleibt in [`mcp-tool-guide.md`](../references/mcp-tool-guide.md), die
> **handgepflegt** ist und **nicht** aus dieser Registry generiert wird. `deep_ref` verlinkt
> dorthin. Eine einzeilige YAML-Zeichenkette trägt dieses Wissen nicht verlustfrei.

## Ablauf der Kuration

### 1. Offene Menge holen

```bash
node scripts/toolset/collect.mjs --unreviewed
```

Erfasst werden alle fünf Kinds: `mcp:` aus den Harness-Configs, `plugin:` aus `enabledPlugins`
in `.claude/settings.json`, `skill:` aus dem `name:`-Frontmatter von `.claude/skills/*/SKILL.md`,
`cli:` und `agent:` aus `docs/agent-guide/registry/tools.yaml`. Alles, was in
`capabilities.yaml` fehlt, trägt `curation: "unreviewed"`.

### 2. Je Eintrag den Entscheidungskontext zeigen

Vor der Frage an den Operator gehören drei Angaben auf den Tisch:

- **Welche Fähigkeit** der Eintrag berührt — und welche Instanz dort heute `canonical` ist.
- **Die gemessene Tool-Zahl**, sofern `docs/agent-guide/registry/toolset.lock.yaml` einen
  Eintrag hat (`node scripts/toolset/probe.mjs` füllt sie). Ein Server mit 40 Tools kostet
  spürbar Kontext; das gehört in die Entscheidung.
- **Ob die Unterdrückung technisch durchsetzbar ist**: `mcp:` vollständig, `plugin:`/`skill:`
  teilweise, `cli:` gar nicht. Ein `suppressed` auf `cli:` ist eine Konvention, kein Schalter.

### 3. Entscheidung und Begründung erfassen

Frage den Operator nach dem `state`. **Kein State ohne Begründung** — bei `suppressed` und
`unreviewed` ist `reason` Pflicht.

Bei `canonical` zusätzlich erfassen:

| Feld | Pflicht | Hinweis |
|---|---|---|
| `use_when` | ja | Eine Zeile, ≤ 120 Zeichen. Wird in **jeden** Prompt injiziert. |
| `roles` | ja | Volle Rollennamen oder `all`. Kurzformen sind ungültig. |
| `avoid_when` | nein | Die häufigste Fehlanwendung, nicht die vollständige Liste. |
| `fallback` | nein | Konkreter Befehl oder Pfad, kein Fließtext. |
| `tier` | nein | `safe`/`caution`/`assisted`/`dangerous`. |
| `deep_ref` | nein | Repo-relativer Pfad auf die Tiefenreferenz. |

Gültige Rollen: `bachelorprojekt-website`, `-ops`, `-infra`, `-test`, `-db`, `-security`,
`orchestrator`, `all`.

**Kann eine Entscheidung nicht ohne Raten getroffen werden, bleibt der Eintrag `unreviewed`**,
und der `reason` hält fest, was zu klären ist. `unreviewed` bricht CI nicht. Ein geratenes
`canonical` wäre eine Kuration, die nicht stattgefunden hat.

> **Fähigkeiten fachlich schneiden, nicht nach dem Werkzeug.** Zwei Plugins, die dasselbe
> leisten, gehören unter **eine** Fähigkeit — erst dann zwingt die Invariante „höchstens eine
> kanonische Instanz je Fähigkeit" zur Entscheidung. Umgekehrt gilt: eine Fähigkeit, deren
> Instanzen **alle** unterdrückt sind, lässt `check.mjs` fallen (sie wäre nicht mehr
> beschaffbar). Ungenutzte Werkzeuge bekommen deshalb je eine eigene Einzelinstanz-Fähigkeit.

### 4. Schreiben und nachziehen

```bash
node scripts/toolset/sync.mjs     # Registry → Harness-Configs
node scripts/toolset/check.mjs    # fail-closed
```

**Ein nicht-null Exit von `check.mjs` beendet die Kuration als fehlgeschlagen** — nicht als
erledigt mit Hinweis. Der wahrscheinliche Fall ist eine `canonical`-Instanz ohne `use_when`:
der Zustand steht dann in der Registry, ist aber nicht injizierbar.

Zum Schluss die Karte neu erzeugen:

```bash
node scripts/toolset/emit-map.mjs   # → docs/agent-guide/maps/toolset-map.md
```

## Injektion in einen Agenten

```bash
tools=$(bash scripts/toolset-context.sh bachelorprojekt-db)
[ -n "$tools" ] && prompt="<toolset>\n${tools}\n</toolset>\n\n${task_prompt}"
```

Ausgegeben wird jede nicht-unterdrückte Instanz, deren `roles` die angefragte Rolle oder `all`
enthält. `--json` liefert dasselbe maschinenlesbar.

> **⚠ Fail-closed bei unbekannter Rolle.** Eine ungültige Rolle beendet das Skript mit Exit ≠ 0
> und gibt **keine** Instanz aus. Das unterscheidet es bewusst von `scripts/plan-context.sh`,
> das in diesem Fall still auf `__ALL__` zurückfällt und den Rollenfilter damit wirkungslos
> macht (T002322). Bei Plänen ist das lästig; bei einem Werkzeug-Block hieße es, einer
> vertippten Rolle das gesamte Arsenal zu injizieren — genau der Kontext-Bloat, gegen den
> kuriert wird.

## Verwandte Dateien

| Pfad | Rolle |
|---|---|
| `docs/agent-guide/registry/capabilities.yaml` | SSOT für Auswahl **und** Nutzung |
| `docs/agent-guide/registry/mcp.yaml` | SSOT für die *Erreichbarkeit* eines Servers |
| `docs/agent-guide/maps/toolset-map.md` | generierte, menschenlesbare Karte |
| `docs/agent-guide/registry/toolset.lock.yaml` | gemessene Tool-Zahlen (`probe.mjs`) |
| `.claude/skills/references/mcp-tool-guide.md` | handgepflegte Tiefenreferenz |
| `scripts/toolset-context.sh` | Prompt-Block je Rolle |
| `scripts/toolset/{collect,check,sync,emit-map,probe}.mjs` | Erhebung, Gate, Sync, Karte, Probe |

## Nachbereitung

Frictionen am Ende über `mishap-tracker` melden
(`bash scripts/hooks/mishap-tracker.sh --friction '<text>'`).
