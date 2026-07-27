# Proposal: skill-inventory-cleanup

## Why

`.claude/skills/` ist ein Namespace, kein kuratierter Satz. Name und `description` jedes Skills
werden in **jeder** Session eager gelistet und kosten Kontext — bei 39 getrackten `SKILL.md`
trägt ein relevanter Teil nichts bei:

- **Sechs STUB-Skills** (je 27 Zeilen), deren gesamter Inhalt ein Verweis auf ein Built-in ist.
  Drei davon deklarieren `name: superpowers:brainstorming` / `superpowers:writing-plans` /
  `superpowers:executing-plans` — **exakt die Bezeichner der echten Plugin-Skills**. In Claude
  Code gewinnt derzeit das Plugin (empirisch geprüft: ein Aufruf von `superpowers:brainstorming`
  lieferte die Plugin-Version aus `plugins/cache/…/superpowers/6.2.0/`), aber die
  Auflösungsreihenfolge ist nirgends garantiert. In opencode denyt die Deny-Liste unter demselben
  Namen **beide**.
- **Ein Grabstein**: `llm-ops` (`archived: true`, Body: „ARCHIVIERT → infra-ops §5").
- **Vier fachfremde Vendor-Skills**: `gguf-quantization`, `llama-cpp`, `speculative-decoding`,
  `unsloth` — inhaltlich durch `infra-ops` §5 abgedeckt.

Dazu zwei **ungetrackte**, lokal per market-cli installierte Skills
(`haniakrim21-everything-claude-code-react-bits` mit `name: react-bits`, sowie `whisper`), die in
Claude Code weiterhin gelistet werden, aber von keinem PR entfernt werden können.

Der Eingriff ist nicht mechanisch. Vier Subsysteme hängen am Inventar:

| Subsystem | Kopplung |
|---|---|
| `.claude/lib/goals.md` → G-AGENTIC06 | misst `claimed − real` als Betrag; real = getrackte `SKILL.md` via `git ls-files`. Ziel 0. |
| `.claude/lib/goals.md` → G-AGENTIC07 | zählt verwaiste aktive Skills (mit `description`, ohne Referenz). Ziel 0. |
| `tests/spec/superpowers-writing-plans.bats`, `tests/spec/superpowers-executing-plans.bats` | je 9 Tests, davon 5 auf den Stub und 4 auf `dev-flow-plan` bzw. `dev-flow-execute` selbst |
| `openspec/specs/superpowers-writing-plans.md`, `openspec/specs/superpowers-executing-plans.md` | eigene SSOT-Specs (86 / 101 Zeilen) |

Ein blankes Löschen der Verzeichnisse kippt G-AGENTIC06, bricht `task test:all` und verliert die
vier Tests je Datei, die `dev-flow-plan` und `dev-flow-execute` gegen Regressionen absichern
(plan-lint-Regeln, Worktree-Guard, Squash-Merge).

## What

**Entfernt — 11 getrackte Skill-Verzeichnisse:**
`test-driven-development`, `verification-before-completion`, `requesting-code-review`,
`superpowers-brainstorming`, `superpowers-writing-plans`, `superpowers-executing-plans`,
`llm-ops`, `gguf-quantization`, `llama-cpp`, `speculative-decoding`, `unsloth`.

Getrackte `SKILL.md`: **39 → 28**.

**Bleibt bewusst erhalten:** `gitops-*` (echter Flux-Bezug seit T002083), `vitest`
(website-Tests), `lavish`, `update-dependencies`, `ui-ux-pro-max`.

**Testabdeckung wird umgebaut statt verworfen:** Die je vier Tests, die `dev-flow-plan` und
`dev-flow-execute` prüfen, wandern nach `tests/spec/dev-flow-plan.bats` (existiert, 111 Zeilen)
bzw. `tests/spec/dev-flow-execute.bats` (neu). Die fünf Stub-Existenz-Tests je Datei entfallen
mit dem Stub.

**Mitgezogen:** `skills-lock.json` (Eintrag `llama-cpp`), `.claude/skills/OVERVIEW.md` (Zähler
und Registrierungs-Sektion), die Querverweise in `dev-flow-plan`, `dev-flow-execute`, `infra-ops`
und `bachelorprojekt-ops.md`, die Skill-Deny-Liste in `.opencode/opencode.jsonc`, sowie
`.claude/lib/goals.md` (Baseline-Notiz).

**Die zwei ungetrackten Skills** werden nicht per Commit entfernt, sondern als dokumentierter
manueller Schritt in `OVERVIEW.md` festgehalten — ein PR kann Dateien nicht löschen, die git
nicht kennt.

**Nicht Teil dieses Changes:** die inhaltliche Überarbeitung der verbleibenden Skills nach
`skill-creator`-Standard. Das ist T002303 (K4) und hängt von diesem Change ab.

_Ticket: T002302_
