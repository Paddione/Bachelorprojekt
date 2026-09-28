---
title: harness-specialization design
ticket_id: T900791
domains: [agents, toolset, developer-experience]
status: approved
---

# harness-specialization — Design

Brainstorming 2026-09-28 (Claude Code Session, Nutzer freigegeben). Teilprojekt P1 von fünf.

## Ziel

Jede kuratierte Harness bekommt eine feste Aufgabe und lädt nur die Werkzeuge ihrer Aufgabe,
statt dass alle Harnesses dasselbe globale Arsenal in den Kontext ziehen. Hintergrund: Der
Nutzer zahlt 5–20 € pro externem Anbieter und wechselt zwischen Harnesses. Die Aufgabenzuordnung
ersetzt das planlose Wechseln.

## Entscheidungen

- **D1** Aufgabe bestimmt den Werkzeugsatz, Kosten bestimmen das Modell.
- **D2** Neovim macht den Harness-Wechsel billig (P5, T900795).
- **D3** Budget-/Quota-Anzeige ist out of scope.
- **D4** opencode-Eskalation: Qwen-Instruct-Worker → Qwen3.8-27B → Zen-Muse free → Go-Muse (P2, T900792).
- **D5** muse läuft direkt auf der Meta-API.
- **D6** Keine DeepSeek-Agenten in irgendeiner Harness. Harte Sperre über `forbidden_providers`.
- **D7** Mechanismus: Registry und Generator (O1).
- **D8** omp ersetzt pi, Standardmodell `muse-spark-1.3-contributor-free` über Zen, Go als Fallback (P3, T900793).
- **D9** Lokale Flotte: 5070 Ti Qwen3.8-27B Q2-MTP, 3060 Ti je ein 6–7-GB-Qwen-Instruct-Worker (P2).

## Teilprojekte

| Code | Ticket | Inhalt | hängt ab von |
|---|---|---|---|
| P1 | T900791 | Harness-Registry, Sync, Guards (dieser Plan) | — |
| P2 | T900792 | opencode-Eskalationskette, DeepSeek raus | P1 |
| P3 | T900793 | omp ersetzt pi | P1 |
| P4 | T900794 | OpenClaw wiederbeleben | P1 |
| P5 | T900795 | Neovim-Steuerung aller Harnesses | P1 |

## Harness-Zuordnung

| Harness | Aufgabe | Anbieter | Rollen |
|---|---|---|---|
| claude | Planung und Risikoarbeit | anthropic | bachelorprojekt-infra, -security, -ops, -db |
| codex | Pläne umsetzen, Tests, CI-Fix | openai | bachelorprojekt-test, -website |
| omp | interaktiver Editor-Agent | opencode-zen | pi |
| opencode | Orchestrator der lokalen Flotte | local | orchestrator |
| muse | Cloud-Ausführung mit großem Kontext | meta | bachelorprojekt-test, -website |
| agy | Website und Frontend | google | bachelorprojekt-website |
| openclaw | Always-on-Assistent GPU-Host | local | bachelorprojekt-ops |

## Abschnitt 1 — Registry-Schema

`docs/agent-guide/registry/capabilities.yaml` bekommt zwei neue Top-Level-Keys neben
`capabilities:`. Der bestehende Block bleibt unverändert.

```yaml
harnesses:
  claude:
    job: "Planung und Risikoarbeit: dev-flow-plan, Infra, Security"
    provider: anthropic
    default_model: opus
    roles: [bachelorprojekt-infra, bachelorprojekt-security, bachelorprojekt-ops, bachelorprojekt-db]
    config: .claude/settings.json
  # … je Harness ein Eintrag; config: null, solange kein Adapter existiert
forbidden_providers: [deepseek]
```

Regeln:

1. Werkzeugsatz einer Harness = alle nicht-`suppressed` Instanzen, deren `roles` eine
   Harness-Rolle enthalten oder `all` enthalten und mindestens eine Harness-Rolle in der
   Wildcard-Liste steht. Dieselbe Semantik wie `scripts/toolset-context.sh`, `pi` fällt nicht
   unter `all`.
2. Jede `harnesses.*.roles`-Rolle muss im Rollen-Vokabular von `check.mjs` stehen.
3. Pflichtfelder je Harness: `job`, `provider`, `default_model`, `roles` (nicht leer),
   `config` (Pfad oder `null`).
4. `provider` einer Harness darf nicht in `forbidden_providers` stehen.

## Abschnitt 2 — Generator

`scripts/toolset/sync.mjs` wird Dispatcher über Adapter in
`scripts/toolset/lib/adapters/<harness>.mjs`. Jeder Adapter exportiert:

```js
export const scope = 'project';
export function render(currentText, toolset) { /* → neuer Dateitext, reine Funktion */ }
```

P1 liefert Adapter nur für die zwei Harnesses mit belegtem Projekt-Konfigurationsziel:

- **claude** (`.claude/settings.json`): `disabledMcpjsonServers` = alle in `.mcp.json`
  eingetragenen Server, die in der Registry als `mcp:`-Instanz stehen und nicht im Werkzeugsatz
  sind, vereinigt mit allen `suppressed`-Servern der Registry. Server ohne Registry-Eintrag
  bleiben unangetastet (Quarantäne bleibt Sache von `check.mjs` §3). Alle anderen Keys bleiben.
- **opencode** (`.opencode/opencode.jsonc`): pro Server-Block unter `"mcp"` wird nur die Zeile
  `"enabled": true|false` textuell ersetzt. Kommentare und Formatierung bleiben erhalten. Die
  heutige Implementierung liest `config.mcpServers`, einen Key, den die Datei nicht hat, und
  würde beim Schreiben alle Kommentare verlieren. Beides wird ersetzt.

`sync.mjs --dry-run` gibt pro Datei einen Unified-Diff aus und schreibt nichts.
`--harness <name>` beschränkt den Lauf.

Erwarteter Effekt beim ersten echten Sync (**E1**): claude verliert `mcp-task-runner` (Rolle nur
`orchestrator`). Alle übrigen claude-Server bleiben aktiv. opencode ändert sich nicht.

Die übrigen Harnesses (codex, omp, muse, agy, openclaw) bekommen in P1 nur ihren
Registry-Eintrag mit `config: null`. Partial p5 misst, welche Projekt- oder User-Konfiguration
jede davon liest, und dokumentiert Befehl und Ergebnis (Mess-Konvention T002717). Die Adapter
dafür folgen in P3, P4 oder einem eigenen Ticket.

## Abschnitt 3 — Check und Tests

`scripts/toolset/check.mjs` bekommt drei harte Prüfungen, jede mit Exit 1:

1. **Drift**: Jeder Adapter rendert im Speicher gegen den aktuellen Dateitext. Ist das
   Ergebnis ungleich dem Dateitext, erscheint `DRIFT <harness> <pfad>` mit Diff.
2. **Harness-Schema**: Pflichtfelder und unbekannte Rollen aus Abschnitt 1.
3. **Verbotener Anbieter**: `forbidden provider <name> in harness <harness>`.

`.opencode/agent-models.jsonc` wird in P1 bewusst nicht geprüft. Die DeepSeek-Einträge dort
baut P2 um und hängt die Datei danach an den Guard.

Tests prüfen Befehlsausgaben (T002448-M4):

- `scripts/toolset/lib/adapters/adapters.test.mjs`: `render()` beider Adapter gegen Fixtures,
  inklusive Kommentarerhalt in JSONC.
- `tests/spec/toolset-registry/harness-specialization.bats`: `check.mjs` mit Fixture-Registry
  liefert Exit 1 für DeepSeek-Anbieter, Exit 1 für unbekannte Rolle, Exit 1 für Drift und Exit 0
  für eine saubere Fixture. `sync.mjs --dry-run` schreibt nichts.

## Risiken

- **R3** Die Werkzeugsätze der Rollen sind heute für Subagent-Prompts kuratiert, nicht für
  ganze Harnesses. E1 ist die einzige erwartete Wirkung. Weitere Abweichungen zeigt der
  Dry-Run vor dem ersten echten Sync.
- **R4** Konfigurationsziele von codex, omp, muse, agy und openclaw sind unbelegt. Sie werden
  in p5 gemessen, nicht angenommen.
