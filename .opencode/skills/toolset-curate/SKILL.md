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
      roles: [bp-run, bp-ship, orchestrator]
      tier: caution             # safe | caution | assisted | dangerous
      deep_ref: ".agents/skills/references/mcp-tool-guide.md"
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
in `.claude/settings.json`, `skill:` aus dem `name:`-Frontmatter der Skill-Dateien (`SKILL.md`),
`cli:` und `agent:` aus `docs/agent-guide/registry/tools.yaml`. Alles, was in
`capabilities.yaml` fehlt, trägt `curation: "unreviewed"`.

### 2. Je Eintrag den Entscheidungskontext zeigen

Vor der Frage an den Operator gehören drei Angaben auf den Tisch:

- **Welche Fähigkeit** der Eintrag berührt — und welche Instanz dort heute `canonical` ist.
- **Die gemessene Tool-Zahl** und die riskanten Tools aus
  `docs/agent-guide/registry/toolset.lock.yaml` (`node scripts/toolset/probe.mjs`, siehe
  „Tool-Ebene" unten). Ein Server mit 40 Tools kostet spürbar Kontext; das gehört in die
  Entscheidung.
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

Gültige Rollen: `bp-build` (infra + security), `bp-run` (ops + db), `bp-ship` (website + test),
`orchestrator`, `big-pickle`, `omp`, `all` — SSOT `scripts/toolset/lib/roles.mjs` (T900980).
Die alten `bachelorprojekt-*`-Namen lehnt `check.mjs` in der Registry mit Ersatzvorschlag ab;
`toolset-context.sh` löst sie für Aufrufer noch auf und meldet `veraltet`.

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

## Tool-Ebene (T900983)

Instanzen sind kuratiert, einzelne Tools darunter über den Lock und `tool_tiers`.
Design und Entscheidungen: `.agents/plans/toolset-tool-level/design.md`.

```bash
node scripts/toolset/probe.mjs                        # misst tools/list aller Server aus mcp.yaml
node scripts/toolset/probe.mjs --server warden        # nur einen Server
node scripts/toolset/probe.mjs --ack warden           # gemessenen Stand nach Prüfung übernehmen
```

- **Lock** `toolset.lock.yaml`: je Server `status` (`ok`/`unreachable`/`auth_failed`/`timeout`/
  `protocol`), `tools` (gemessen: Hash, `read_only`, `destructive` aus den MCP-Annotations),
  `reviewed` (geprüft, nur per `--ack`). Ein unerreichbarer Server behält seine Tools.
  `duplicate_names` zeigt Server, die einen Namen doppelt ausliefern (T900984).
- **`tool_tiers`** an einer `mcp:`-Instanz: Glob → Tier, erste passende Zeile gewinnt; nicht
  genannte Tools erben `tier` der Instanz. Startwert für Mutationen ist der `destructiveHint`
  aus dem Lock; Server ohne Annotations (ticket-mcp-node, task-runner) brauchen Handarbeit.
- **Gate:** `check.mjs` bricht bei ungültigem Tier, `tool_tiers` an Nicht-mcp-Instanzen und
  einem Glob ohne Treffer (veraltete Kuration). Neue, entfernte oder geänderte Tools und ein
  `destructiveHint` auf einem `safe`-Tool meldet es nur — erst prüfen, dann `--ack`.
- **Prompt-Block:** `toolset-context.sh` nennt Tools ab `caution` einzeln, sofern sie über dem
  Instanz-Tier liegen; der Rest erscheint gezählt je Tier. `--json` liefert alle Tools mit Tier.

## Injektion in einen Agenten

```bash
tools=$(bash scripts/toolset-context.sh bp-run) || exit 1
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
| `.agents/skills/references/mcp-tool-guide.md` | handgepflegte Tiefenreferenz |
| `scripts/toolset-context.sh` | Prompt-Block je Rolle |
| `scripts/toolset/{collect,check,sync,emit-map,probe}.mjs` | Erhebung, Gate, Sync, Karte, Probe |

## Nachbereitung

Frictionen am Ende über `mishap-tracker` melden
(`bash scripts/hooks/mishap-tracker.sh --friction '<text>'`).
