---
title: "p2 — CLAUDE.md: Rollennamen-Beispiel und MCP-Absatz auf die Registry ziehen"
ticket_id: T002305
domains: [agent-config, docs]
status: active
partial_id: p2
role: impl
target_files: ["CLAUDE.md"]
depends_on: []
---

# p2 — CLAUDE.md korrigieren

_Ticket: T002305 · Partial p2 · target_files: `CLAUDE.md`_

## File Structure

| Datei | Änderung |
|---|---|
| `CLAUDE.md` | zwei Blöcke ändern: das `plan-context.sh`-Beispiel im Agent-Routing-Abschnitt und den MCP-Absatz darüber |

## Kontext

CLAUDE.md hält der Stichprobe weitgehend stand — Agent-Tabelle, MCP-Ports, Flux-Beschreibung und
Cluster-Topologie wurden am 2026-07-27 gegen den Repo-Stand geprüft und stimmen. Es gibt **einen**
harten Fehler.

**Der Fehler.** Der Block "Before dispatching any agent, inject active plan context" zeigt:

```bash
context=$(bash scripts/plan-context.sh infra --with-openspec)
```

`_role_allowlist()` in `scripts/plan-context.sh` kennt aber nur die vollen Rollennamen
`bachelorprojekt-website`, `bachelorprojekt-ops`, `bachelorprojekt-infra`, `bachelorprojekt-test`,
`bachelorprojekt-db`, `bachelorprojekt-security` sowie `orchestrator`. Alles andere fällt in den
`*)`-Zweig, gibt `WARN: unknown role "…" — including all proposals as fail-soft` auf stderr aus und
liefert `__ALL__` — also ungefiltert **alle** Proposals. Das Beispiel in der Anleitung produziert
damit exakt den Fehlerfall, den der Rollenfilter verhindern soll. Betrifft alle Kurzformen
(`infra`, `db`, `test`, `website`, `ops`, `security`) gleichermaßen. Erfasst als T002322.

**Selbstbezug-Guard:** Dieses Partial ändert die Datei, die das Verhalten des ausführenden Agenten
steuert. Geändert werden ausschließlich die beiden unten benannten Blöcke. Regeln, die unbequem
erscheinen, werden **nicht** entschärft — Divergenzen gehören in `design.md` § "Offene Fragen an
Patrick".

## Schritte

- [ ] **Fehler reproduzieren, bevor er korrigiert wird.** Der WARN muss sichtbar sein:

```bash
bash scripts/plan-context.sh infra --with-openspec 2>&1 >/dev/null | grep 'unknown role'
# erwartet: eine Zeile 'WARN: unknown role "infra" — including all proposals as fail-soft'
```

- [ ] **Beispiel korrigieren.** Im Codeblock `infra` durch `bachelorprojekt-infra` ersetzen.

- [ ] **Falle explizit machen.** Direkt beim Beispiel ergänzen, dass `<role>` einer der sieben in
      `_role_allowlist()` in `scripts/plan-context.sh` gelisteten Namen sein muss
      (`bachelorprojekt-{website,ops,infra,test,db,security}` oder `orchestrator`), und dass eine
      Kurzform nicht etwa fehlschlägt, sondern still auf `__ALL__` zurückfällt — der Filter wirkt
      dann gar nicht. Die Allowlist wird **nicht** in CLAUDE.md dupliziert; verwiesen wird auf die
      Funktion im Skript, damit hier keine neue Drift-Fläche entsteht.

- [ ] **MCP-Absatz auf die K1-Registry ziehen.** Der Absatz, der die MCP-Server pro Harness
      aufzählt, benennt derzeit die opencode-Serverliste im Fließtext. Ergänzen, dass seit T002300
      `docs/agent-guide/registry/mcp.yaml` die SSOT für alle drei Harness-Configs ist, dass
      `task mcp:sync` `.mcp.json`, `.opencode/opencode.jsonc` und `~/.gemini/config/mcp_config.json`
      daraus regeneriert und `task mcp:check` auf Drift prüft. Die aufgezählten Servernamen bleiben
      erhalten (sie sind korrekt), bekommen aber die Registry als Quelle vorangestellt.

- [ ] **Nichts anderes anfassen.** Insbesondere bleiben Agent-Routing-Tabelle, Cluster-Topologie,
      Development Rules und der Gotchas-Abschnitt unverändert — sie wurden geprüft und sind
      korrekt.

## Verifikation dieses Partials

```bash
grep -n 'plan-context.sh' CLAUDE.md
bash scripts/plan-context.sh bachelorprojekt-infra --with-openspec 2>&1 >/dev/null | grep -c 'unknown role'
grep -c 'docs/agent-guide/registry/mcp.yaml' CLAUDE.md
git diff --stat CLAUDE.md
```

**Akzeptanz:**

- Kein `plan-context.sh`-Aufruf in `CLAUDE.md` verwendet noch eine Kurzform; jedes Vorkommen nennt
  einen Namen aus `_role_allowlist()`.
- `bash scripts/plan-context.sh bachelorprojekt-infra --with-openspec 2>&1 >/dev/null | grep -c 'unknown role'`
  liefert `0`.
- `grep -c 'docs/agent-guide/registry/mcp.yaml' CLAUDE.md` liefert mindestens `1`.
- `git diff --stat CLAUDE.md` zeigt nur die beiden beschriebenen Blöcke.
