---
title: "opencode-system-message-merge — Implementation Plan"
ticket_id: T900220
domains: [plan-authoring]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# opencode-system-message-merge — Implementation Plan

_Ticket: T900220_

## File Structure

```
.opencode/plugin/system-message-merge.ts                    (new, ~50 LOC)  P1
tests/spec/llm-local-dev/system-message-merge.bats          (new, RED committed)  P1
openspec/changes/opencode-system-message-merge/specs/llm-local-dev.md  (delta, committed)
```

Neue Dateien, kein S1-Budget-Konflikt (Limit fuer neue `.ts`-Dateien weit
ueber 50 Zeilen).

## Kontext fuer den Implementierer

- Ursache und Designentscheidungen: `design.md` in diesem Change.
- Plugin-Form wie `.opencode/plugin/bge-mcp-env.ts`: genau **ein**
  exportierter Funktionswert `export const SystemMessageMerge = async () => ({ config: ... })`.
  opencode ruft jeden exportierten Funktionswert als Plugin auf, deshalb
  Hilfsfunktionen (`text`, `merge`) nicht exportieren.
- `config`-Hook: `cfg.provider["llamacpp-local"]` fehlt → nichts tun.
  Sonst `options` anlegen falls leer, `upstream = options.fetch ?? fetch`,
  dann `options.fetch` ersetzen.
- Wrapper reicht unveraendert durch bei: Body kein String, `JSON.parse`
  wirft, `messages` kein Array, keine `system`-Nachricht, genau eine
  `system`-Nachricht an Index 0. Sonst: alle `system`-Inhalte in
  Originalreihenfolge mit `"\n\n"` verbinden (Array-Content: `text`-Teile mit
  `"\n"`, andere Teile als JSON), als `{role:"system", content}` an Index 0,
  alle uebrigen Nachrichten in Originalreihenfolge dahinter, restliche
  Body-Felder unveraendert, `init` mit neuem `body` an `upstream`.
- Kein Import ausser Node-Builtins noetig. Der Test laedt die Datei per
  `node --experimental-strip-types` (Node 22 in CI) — nur loeschbare
  Typannotationen verwenden (kein `enum`, kein `namespace`, keine
  Parameter-Properties).
- Kopfkommentar im Stil von `bge-mcp-env.ts`: Symptom, Ursache, warum nicht
  `experimental.chat.system.transform`, Verteilung ueber
  `scripts/opencode-sync-agents.sh`.
- Mess-Falle: `ss -ltn` im WSL zeigt den Windows-Listener `:1919` nicht,
  Erreichbarkeit nur per `curl`.

## Partials (Ausfuehrungsreihenfolge)

### P1 — Plugin implementieren [T900220]

- [x] **Failing-Test-Step (RED).** Der Test liegt bereits committed vor und
      scheitert, weil die Plugin-Datei fehlt.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/llm-local-dev/system-message-merge.bats
# expected: FAIL (6 von 6 rot — .opencode/plugin/system-message-merge.ts fehlt)
```

- [x] **Fix-Step (GREEN).** `.opencode/plugin/system-message-merge.ts` nach
      dem Kontext oben anlegen, dann denselben Aufruf wiederholen: 6 von 6 gruen.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/llm-local-dev/system-message-merge.bats
tests/unit/lib/bats-core/bin/bats tests/spec/llm-local-dev/single-static-model.bats tests/spec/agent-skills/harness-guard-registration-T900024.bats
```

### P2 — Live-Nachweis [T900220]

- [x] Plugin verteilen und im Repo gegen FreeToken pruefen. Vorbedingung:
      `curl -s -m5 http://127.0.0.1:1919/health` meldet `"status":"ok"`,
      sonst P2 als nicht ausfuehrbar vermerken.

```bash
bash scripts/opencode-sync-agents.sh
timeout 150 ~/.opencode/bin/opencode run --print-logs --log-level INFO --agent qwen38-primary "Antworte nur mit: ok" > /tmp/t900220-run.log 2>&1
grep -c 'System message must be at the beginning' /tmp/t900220-run.log   # erwartet: 0
```

      Hinweis: `opencode run` kann nach der Antwort beim Beenden haengen,
      der `timeout` ist deshalb Pflicht. Laufende opencode-Server
      (`opencode-freetoken.service`) danach neu starten, damit sie das Plugin
      laden: `systemctl --user restart opencode-freetoken.service`.

### P3 — Final Verification [T900220]

- [x] Die drei CI-Gates laufen lassen.

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
