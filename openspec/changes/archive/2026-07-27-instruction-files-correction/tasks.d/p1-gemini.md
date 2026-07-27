---
title: "p1 — GEMINI.md vom Spiegel zum Zeiger"
ticket_id: T002305
domains: [agent-config, docs]
status: active
partial_id: p1
role: impl
target_files: ["GEMINI.md"]
depends_on: []
---

# p1 — GEMINI.md vom Spiegel zum Zeiger

_Ticket: T002305 · Partial p1 · target_files: `GEMINI.md`_

## File Structure

| Datei | Änderung |
|---|---|
| `GEMINI.md` | vollständig ersetzen; 107 → höchstens 40 Zeilen |

## Kontext

Die Entscheidung ist in `design.md` § "Entscheidung: GEMINI.md bleibt eine eigene Datei — aber als
Zeiger, nicht als Spiegel" hergeleitet und gilt als getroffen. Dieses Partial setzt sie um; es
entscheidet sie nicht neu.

Zehn verifizierte Falschaussagen sitzen in genau den Sektionen, die gestrichen werden
(Core-Services-Liste, Infrastructure-Absatz, Key-Task-Commands, Specialized-Taskgroups, User
Lifecycle Management, Documentation). Die Korrektur besteht deshalb nicht darin, sie einzeln
richtigzustellen, sondern darin, die duplizierte Ebene zu entfernen.

**Was NICHT verloren gehen darf** — vor dem Löschen einer Sektion prüfen, dass ihr Inhalt an der
angegebenen Stelle wirklich steht (alle vier wurden am 2026-07-27 verifiziert):

| Sektion in GEMINI.md | Bleibt erhalten in |
|---|---|
| Session-Koordination (Z. 65–75) | `.claude/skills/references/session-coordination.md`, plus AGENTS.md § Agent Coordination |
| ENV=-Footgun (Z. 77–81) | `docs/superpowers/references/gotchas-footguns.md` § Environment targeting |
| coturn/HPB podAffinity (Z. 96–100) | `docs/diagrams/architecture.md` |
| tls-sync-CronJob (Z. 102–105) | `docs/diagrams/architecture.md` |

## Schritte

- [ ] **Nachweis vor dem Löschen.** Die vier Zielorte aus der Tabelle oben stichprobenartig
      bestätigen, damit das Kürzen kein Informationsverlust ist:

```bash
grep -c "agent-lock" .claude/skills/references/session-coordination.md
grep -c "ENV= ist always explicit\|ENV=\` is always explicit" docs/superpowers/references/gotchas-footguns.md
grep -c "podAffinity\|tls-sync" docs/diagrams/architecture.md
```

Jeder Aufruf muss einen Wert größer `0` liefern. Liefert einer `0`, wird die zugehörige Sektion
**nicht** gelöscht, sondern zuerst an ihren Zielort verschoben — und dieser Schritt im Plan
vermerkt.

- [ ] **GEMINI.md neu schreiben.** Die Datei enthält danach ausschließlich:
      1. Eine H1 und einen Satz, der sagt, was die Datei ist (Kontextdatei für die Gemini-CLI/agy).
      2. Den Verweis auf `CLAUDE.md` als umfassende Referenz und `AGENTS.md` als cross-harness
         Quick-Start — mit der ausdrücklichen Anweisung, sie zu lesen statt sich auf diese Datei
         zu verlassen.
      3. Den Verweis auf `bash scripts/vda.sh oracle '<goal>'` statt einer Task-Liste, mit der
         Begründung aus CLAUDE.md ("Never look up or hardcode task commands").
      4. Die einzige agy-exklusive Information: agy liest MCP-Server ausschließlich aus
         `~/.gemini/config/mcp_config.json`; diese Datei wird von `task mcp:sync` aus der Registry
         `docs/agent-guide/registry/mcp.yaml` generiert, Drift-Prüfung mit `task mcp:check`.
      5. Einen Satz, der erklärt, **warum** die Datei so dünn ist, damit die nächste Session sie
         nicht "vervollständigt": Duplikate driften; diese Datei stand am 2026-07-27 mit zehn
         falschen Aussagen im Repo. Verweis auf das Gate in `tests/spec/agent-skills.bats`.

- [ ] **Keine Service-Namen, keine Task-Literale.** Die fertige Datei enthält weder
      `Keycloak`, `Nextcloud`, `Vaultwarden`, `Collabora`, `DocuSeal`, `Janus`, `coturn`,
      `Traefik`, `LiveKit` noch ein `task <gruppe>:<name>`-Literal außer `task mcp:sync` und
      `task mcp:check`.

## Verifikation dieses Partials

```bash
wc -l < GEMINI.md
grep -c "Keycloak\|LiveKit" GEMINI.md || true
grep -nE 'task [a-z][a-z-]*:' GEMINI.md || true
```

**Akzeptanz:**

- `wc -l < GEMINI.md` liefert höchstens `40`.
- `grep -c "Keycloak\|LiveKit" GEMINI.md` liefert `0`.
- Die einzigen `task …:…`-Treffer sind `task mcp:sync` und `task mcp:check`.
- `GEMINI.md` verlinkt `CLAUDE.md` und `AGENTS.md`.
