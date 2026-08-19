# Proposal: dsh-harness-integration

## Why

Wir betreiben heute zwei Harnesses — Claude Code und opencode — und der Vertrag zwischen
ihnen ist in `openspec/specs/harness-workflow-split.md` festgeschrieben. In beiden können wir
Skills, Agenten und MCP-Server anhängen, aber nicht die Agent-Schleife selbst verändern. Unsere
Repo-Regeln (Worktree-Schutz, Plan-Preflight, Commit-vs-Diff) leben deshalb als Shell-Hooks am
Rand des Ablaufs: Sie sehen einen Werkzeugaufruf, dürfen ihn ablehnen, und mehr nicht.

Der DeepSeek Harness (`dsh`, 0.1.0-rc.7) ist auf Cordis gebaut und macht jeden Teil zu einem
Plugin — Modelladapter, Werkzeug-Registry, Sitzungs-Log und die Schleife selbst. Damit werden
drei Dinge möglich, die uns heute fehlen:

1. **Guards mit typisierten Entscheidungen statt Exit-Codes.** `tools/pre-execute` ist ein
   Waterfall mit `deny`/`ask`, `agent/pre-step` darf die Nachrichten umschreiben, bevor das
   Modell sie sieht.
2. **Ein Headless-Runner ohne Server** (`dsh-headless`) — die Form, die unsere Factory für
   einen dritten Executor neben `claude -p` und `opencode run` braucht.
3. **Ein append-only Sitzungs-Log als Laufzeit-Invariante** („model-visible means logged"),
   aus dem sich ein Audit-Trail ableiten lässt, statt ihn nachträglich zu rekonstruieren.

Der Einstieg ist billiger als erwartet: `@deepseek-ai/dsh-hooks-claude-code` liest eine
bestehende Claude-Code-Hook-Konfiguration und bildet `PreToolUse` auf `tools/pre-execute` ab.
Unsere `.claude/settings.json` trägt 2 `PreToolUse`- und 7 `SessionStart`-Hooks — sie laufen
unter dsh ohne eine Zeile neuen Guard-Code.

## What

Ein vertikaler Durchstich, der dsh zum **dritten Harness** macht und an einer laufenden
Web-Oberfläche vorführbar ist. Vier Teile:

- **Harness-Vertrag (D1).** Das `harness`-Enum in `docs/agent-guide/registry/tools.yaml` wird um
  `dsh` erweitert, `scripts/agent-guide/validate.mjs` validiert den neuen Wert, die
  Werkzeug-Karte rendert ihn. Das ist ein bewusstes MODIFIED-Delta auf den bestehenden
  Zwei-Harness-Vertrag, keine stille Nebenschrift.
- **Guards (V1).** Ein Bundle `tools/dsh/` mit zwei Stufen: die CC-Hook-Bridge fährt unsere
  bestehenden Hooks unverändert, ein natives Plugin `repo-guard.mjs` setzt dieselben Regeln
  typisiert durch und zeigt, was die Bridge nicht kann.
- **Factory-Executor (V3).** `scripts/factory/dsh-exec.sh` nach dem Muster von
  `opencode-exec.sh`, angeschlossen am `FACTORY_EXECUTOR`-Schalter in
  `scripts/factory/dispatcher-bridge.sh`.
- **Audit-Log (V4).** Ein Plugin, das `session/event` abonniert und die Phasen-Ereignisse in
  unsere Ticket-Datenbank schreibt — derselbe Kanal, den die anderen Executor bereits nutzen.

**Nicht in diesem Change:** der Remote-Sandbox-Provider (V2, `ctx.fs`/`ctx.subprocess` gegen den
k3d-SDLC-Stack) bleibt Folge-Epic. `deepseek-harness/` bleibt gitignorierter externer Klon
(T012960) — es wird kein Upstream-Code ins Repo kopiert.

_Ticket: T012962_
