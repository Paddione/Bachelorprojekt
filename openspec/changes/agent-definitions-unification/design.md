---
title: "agent-definitions-unification — Design"
ticket_id: "T002304"
plan_ref: openspec/changes/agent-definitions-unification/tasks.md
domains:
  - "agent-config"
  - "agents"
status: active
date: 2026-07-27
---

# agent-definitions-unification — Design

Kind K5 von Epic **T002299**. Dekompositions-Spec:
`docs/superpowers/specs/2026-07-27-agent-resources-rework-design.md`.

## Ist-Zustand (erhoben 2026-07-27)

### Domänen-Agenten — `.claude/agents/`

| Datei | Zeilen | `model:` | `tools:` |
|---|---|---|---|
| `bachelorprojekt-db.md` | 90 | `sonnet` | — |
| `bachelorprojekt-infra.md` | 98 | `opus` | — |
| `bachelorprojekt-ops.md` | 88 | `sonnet` | `[Bash, Read, Glob, Grep]` |
| `bachelorprojekt-security.md` | 110 | `opus` | — |
| `bachelorprojekt-test.md` | 85 | `sonnet` | — |
| `bachelorprojekt-website.md` | 80 | `sonnet` | — |

### Modell-Tiers — `.opencode/agent-models.jsonc`

| Schlüssel | `mode` | Modell |
|---|---|---|
| `gemma-4-12b` | `subagent` | `llamacpp-mtp/gemma-4-12B-it-qat-UD-Q4_K_XL.gguf`, write-capable, ein Slot |
| `gemma-4-12b-primary` | `primary` | dasselbe Modell, Tab-wählbar, nicht per `task` beschwörbar |
| `deepseek-helper` | `subagent` | `opencode-go/deepseek-v4-flash`, Eskalation |
| `orchestrator` | — | — |

### agy — empirisch geprüft

`~/.gemini/config/agents` ist ein Symlink auf `/home/patrick/Bachelorprojekt/.agents/agents`,
das seinerseits auf `../.claude/agents` zeigt. `readlink -f` löst nach
`/home/patrick/Bachelorprojekt/.claude/agents` auf; `ls` zeigt alle sechs Dateien. Die
Behauptung „agy sieht diese Agenten" ist damit belegt.

`~/.gemini/settings.json` enthält ausschließlich `hooks` — keine `agents`-, `model`- oder
Provider-Sektion. Es gibt also keinen konfigurierten Mechanismus, über den agy die
Anthropic-Modellnamen im Frontmatter auf ein Gemini-Modell abbilden könnte.

## Entscheidungen

### E1 — Eine Registry, zwei Achsen

`docs/agent-guide/registry/agents.yaml` mit getrennten Top-Level-Schlüsseln `roles:` und
`runtimes:`.

**Warum getrennt:** Domänen-Agenten und Modell-Tiers sind orthogonal. Ein `bachelorprojekt-infra`
ist eine *Zuständigkeit*; ein `gemma-4-12b` ist eine *Ausführungsumgebung*. Sie in eine flache
Liste zu zwingen würde eine Symmetrie behaupten, die nicht existiert, und die nächste Person zu
der Frage verleiten, warum `bachelorprojekt-infra` kein `mode:` hat.

**Warum überhaupt eine Registry:** K1 (T002300) löst dasselbe Problem für MCP-Server mit
Registry plus Generator plus fail-closed Test. Zwei strukturgleiche Probleme unterschiedlich zu
lösen ist schlechter als jede der beiden Lösungen für sich.

**Verworfen:** nur ein Drift-Test ohne Registry. Er hätte den qwen-Fehler gefangen, aber die
Frage „welcher Agent existiert wo mit welchem Modell" bliebe weiterhin nur in Prosa beantwortet.
**Verworfen:** getrennt lassen und nur dokumentieren. Kein Schutz gegen den nächsten Drift.

### E2 — `agy:` darf `unsupported` sein

Die Registry erzwingt für jede Rolle einen Eintrag pro Harness. Zulässige Werte: ein Modellname,
`null` (Agent existiert dort nicht) oder `unsupported` (Datei ist sichtbar, das Modell-Feld wird
aber nicht honoriert). Ohne den dritten Wert müsste die agy-Spalte lügen — entweder ein
Anthropic-Modell behaupten, das Gemini nicht kennt, oder `null` sagen, obwohl agy die Datei
sehr wohl lädt.

Welcher Wert für agy stimmt, entscheidet die Verifikation in p1. Das Ergebnis ist Teil der
Lieferung, nicht Voraussetzung dafür.

### E3 — `CLAUDE.md` nur punktuell

Nur der Subagent-Layout-Block. Grund: K6 (T002305) besitzt die Instruktionsdateien und ist
`blocked_by` K5 — es läuft also ohnehin danach. Die vier falschen Agentennamen jetzt schon zu
korrigieren nimmt K6 nichts weg und verkürzt die Zeit, in der eine nachweislich falsche
Anweisung im Kontext jeder Session steht.

### E4 — T002308 hier mitnehmen

Der `atomicWriteFile`-Bug sitzt in genau der Datei, die p3 erweitert. Ihn getrennt zu behandeln
hieße, dieselbe Funktion zweimal anzufassen. Der Bug hat ein eigenes Ticket (Bug-Triage-Konvention
G-DORA03), wird aber in diesem Change behoben und dort referenziert.

## Risiken

| Risiko | Abfederung |
|---|---|
| Die agy-Verifikation bleibt ergebnislos (agy nicht startbar) | `unsupported` als dokumentierte Annahme eintragen und im Ticket vermerken, dass die Messung aussteht — kein Blocker für den Rest |
| `emit-maps.mjs` überschreitet sein S1-Budget | Ist 292, Limit 500, Budget 208 — die Agenten-Karte ist ein Template von ~40 Zeilen. Reserve ausreichend. |
| Ein paralleler Change fasst `CLAUDE.md` an | K3 (T002302) fasst `CLAUDE.md` nicht an; K6 läuft nach K5. Konfliktfrei. |
| K3 ändert `.claude/agents/bachelorprojekt-ops.md` (llm-ops-Verweis) | Überlappung nur auf dieser einen Datei und nur auf einer Zeile. K5 fasst die Agenten-Dateien **inhaltlich nicht** an — es liest sie nur. Vor dem Execute auf `main` rebasen, nachdem K3 gemergt ist. |
| Drei registry-Dateien (`themes`, `flow`, `glossary`) werden von `load.mjs` gar nicht geladen | Vorgefundener Zustand, nicht Teil dieses Changes — als Beobachtung im Ticket festhalten |
