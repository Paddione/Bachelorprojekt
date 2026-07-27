# Proposal: agent-definitions-unification

## Why

Dieses Repo bedient drei Agent-Harnesses, aber „Agent" bedeutet in zweien davon etwas anderes:

- `.claude/agents/bachelorprojekt-{db,infra,ops,security,test,website}.md` — sechs **Domänen**-Agenten
  mit Routing-Signalen und Modell-Tiering im Frontmatter. Gelesen von Claude Code und, über
  `~/.gemini/config/agents → .agents/agents → .claude/agents`, auch von agy.
- `.opencode/agent-models.jsonc` — vier **Modell-Tier**-Agenten (`gemma-4-12b`,
  `gemma-4-12b-primary`, `deepseek-helper`, `orchestrator`). opencode liest `.agents/agents`
  nicht.

Die beiden Achsen sind orthogonal und teilen nur das Wort. Es gibt keine gemeinsame Quelle, die
sagt, welcher Agent in welchem Harness mit welchem Modell existiert — und dadurch ist die
Beschreibung bereits gedriftet und in Teilen unbelegt:

**Belegter Drift.** `CLAUDE.md` Zeile 9 nennt als opencode-Subagenten `qwen35-iq4`, `qwen35`,
`qwen35-hq`, `qwen3-14b`. Keiner davon existiert; `.opencode/skills/dev-flow/background-agents.ts`
Zeile 233 protokolliert „qwen35-iq4/hq agents deleted — 2026-07-22". Die `qwen`-Bezeichner
überleben ausschließlich als **Modell**-IDs unter dem lmstudio-Provider
(`qwen3.5-9b@q4_k_xl` und Geschwister) — eine andere Kategorie. `AGENTS.md` dagegen ist korrekt
und listet die drei realen Agenten samt Kontextgrößen. Damit ist `CLAUDE.md` genau an der Stelle
falsch, an der es behauptet, `AGENTS.md` zu spiegeln.

**Unbelegte Behauptung.** Dass agy diese Agenten nutzt, ist strukturell wahr — die Symlink-Kette
löst auf und agy sieht alle sechs Dateien (empirisch geprüft am 2026-07-27). Das mitgemeinte
Modell-Tiering ist für agy aber bedeutungslos: die Dateien deklarieren `model: sonnet` bzw.
`model: opus`, also **Anthropic**-Modellnamen, während agy Gemini fährt. `~/.gemini/settings.json`
enthält ausschließlich Hooks, keinerlei Agent- oder Modell-Konfiguration. Ob agy das
`model:`-Feld ignoriert oder daran scheitert, ist nirgends festgehalten.

**Kein Schutz.** `docs/agent-guide/registry/` modelliert Ziele, Werkzeuge, Komponenten,
Guardrails und Taxonomie — aber **keine Agenten** (null Treffer auf `bachelorprojekt-`). Der
Agenten-Bestand ist damit die einzige zentrale Größe dieses Repos ohne Registry, ohne Generator
und ohne Drift-Gate. Genau deshalb konnte die qwen-Liste über zwei Monate falsch bleiben.

## What

**Neue Registry-Datei** `docs/agent-guide/registry/agents.yaml` mit zwei bewusst getrennten
Achsen:

- `roles:` — die sechs Domänen-Agenten. Pro Harness ein Eintrag mit Modell oder `null`, wenn der
  Agent dort nicht existiert. Damit wird „opencode hat diese Agenten nicht" zu einer
  maschinenlesbaren Aussage statt zu einem Nebensatz.
- `runtimes:` — die opencode-Modell-Tiers mit `mode` (primary/subagent), Schreibrecht und
  Eskalationsrolle.

**Generator.** `scripts/agent-guide/load.mjs` lädt die neue Datei mit; `emit-maps.mjs` emittiert
`docs/agent-guide/maps/agents-map.md` neben den bestehenden drei Karten. `task agent-guide:maps`
und damit auch `task freshness:regenerate` ziehen sie automatisch mit.

**Drift-Gate.** `tests/spec/agent-roster.bats` vergleicht die Registry fail-closed gegen den
Ist-Zustand: `roles`-Schlüssel gegen die Dateinamen in `.claude/agents/`, `runtimes`-Schlüssel
gegen die `agent`-Schlüssel in `.opencode/agent-models.jsonc`, und die in `CLAUDE.md` genannten
Agentennamen gegen beide.

**Punktuelle Korrektur in `CLAUDE.md`.** Ausschließlich der Subagent-Layout-Block (Zeile 9) wird
richtiggestellt. Der Rest der Datei gehört T002305 (K6).

**Empirische agy-Verifikation.** Ein dokumentierter Versuch klärt, ob agy das `model:`-Frontmatter
interpretiert, ignoriert oder daran scheitert. Das Ergebnis landet in der Registry als
`agy:`-Wert — auch ein `unsupported` ist eine belastbare Aussage.

**Mitgenommen:** T002308 (`type=bug`) — `atomicWriteFile()` in `emit-maps.mjs` wiederholt im
`catch` die fehlgeschlagene `rename(tmp, dest)`, statt `unlink(tmp)` aufzurufen. Deshalb liegen
drei verwaiste `danger-map.md.*.tmp` in `docs/agent-guide/maps/`. Da dieser Change denselben
Emitter erweitert, wird der Fix hier miterledigt.

**Nicht Teil dieses Changes:** die Routing-Tabellen in `CLAUDE.md`/`AGENTS.md` inhaltlich
umzuschreiben (K6), und die Skill-Seite (K3/K4).

_Ticket: T002304_
