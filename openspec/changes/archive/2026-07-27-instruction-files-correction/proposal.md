# Proposal: instruction-files-correction

## Why

Die drei Instruktionsdateien im Repo-Root (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`) steuern das
Verhalten jedes Agenten, der an diesem Repo arbeitet. Sechzehn Aussagen darin sind gegen den
Repo-Stand vom 2026-07-27 nachweislich falsch — darunter der Identity Provider (Keycloak statt
Pocket ID), der Deploy-Pfad (push-basiert ohne Flux statt Flux-primär seit T002083), vier
nicht existierende Tasks und ein Anleitungs-Beispiel, das genau den Fehlerfall produziert, den das
zugehörige Skript verhindern soll.

Falsche Instruktionen sind teurer als fehlende: Sie führen Agenten aktiv in die Irre, statt sie
nachfragen zu lassen. Zugleich fehlt jeder Drift-Schutz — AGENTS.md bezeichnet sich als
cross-harness SSOT der OpenSpec-Konventionen, CLAUDE.md spiegelt sie, GEMINI.md spiegelt die
halbe Architektur. Genau diese Konstellation hat die sechzehn Fehler erzeugt.

## What

- Jede verifizierte Falschaussage in `CLAUDE.md`, `AGENTS.md` und `GEMINI.md` korrigieren.
- `GEMINI.md` von einem Architektur-Spiegel auf einen dünnen Zeiger reduzieren — die Datei bleibt
  bestehen (agy lädt sie konventionsgemäß), hört aber auf, Inhalte doppelt zu führen. Begründung
  und verworfene Alternativen: `design.md` § "Entscheidung".
- Ein fail-closed BATS-Gate in `tests/spec/agent-skills.bats`, das den Rückfall verhindert:
  Zeilenbudget für `GEMINI.md`, kein Task-/Service-Inventar darin, kein `Keycloak` in einer der
  drei Dateien, und Agent-/Runtime-Namen konsistent mit der K5-Registry
  `docs/agent-guide/registry/agents.yaml`.
- `website/CLAUDE.md` und `VideoVault/CLAUDE.md` nachweisbar auf Widersprüche prüfen (Vorbefund:
  keine).

**Nicht Teil dieses Changes:** die fehlenden `domains:`-Frontmatter in 85 von 86 Proposals
(T002322) und die Keycloak-Reste außerhalb der Instruktionsdateien (Taskfile-Descriptions,
`scripts/plan-context.sh`).

_Ticket: T002305_
