---
title: "mcp-authenticated-http-headers — Implementation Plan"
ticket_id: T002487
domains: [bachelorprojekt-infra]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mcp-authenticated-http-headers — Implementation Plan

_Ticket: T002487_

## File Structure

```
scripts/mcp-sync.sh                                          (ändern, 212 Zeilen)
docs/agent-guide/registry/mcp.yaml                           (ändern, 335 Zeilen)
.mcp.json                                                    (generiert)
.opencode/opencode.jsonc                                     (generiert)
~/.gemini/config/mcp_config.json                             (generiert, ausserhalb Repo)
tests/spec/mcp-gateway/authenticated-http-headers.bats       (liegt bereits im Branch, RED)
.claude/skills/references/mcp-tool-guide.md                  (ändern, Doku)
```

| Datei | S1-Schwelle | Zeilen jetzt | Budget |
|---|---|---|---|
| `scripts/mcp-sync.sh` | 800 (`.sh`, nicht gebaselined) | 212 | 588 |

Genau eine S1-relevante Datei ist betroffen und liegt weit unter der Schwelle; die erwartete
Erweiterung (Header-Durchreichung in drei Renderern plus zwei Env-Overrides) bewegt sich im
Bereich von rund 30 Zeilen. Kein Verkleinerungs- oder Split-Schritt nötig. `.yaml`, `.json`,
`.jsonc`, `.bats` und `.md` sind nicht S1-erfasst.

## Verify (RED → GREEN)

- [ ] **Task 1 — Spike: Env-Expansion am realen Harness belegen.**
      Der gesamte Plan steht auf der Annahme, dass Claude Code `${BGE_MCP_TOKEN}` in `.mcp.json`
      expandiert. Diese Annahme wird **vor** jeder Code-Änderung geprüft, damit ein Widerlegen
      nicht erst nach dem fertigen Generator-Diff auffällt.
      Ablauf: Token laden (`set -a; . ~/.config/bge-mcp/server.env; set +a`, Wert nie ausgeben),
      den `headers`-Block probeweise und ohne Commit in `.mcp.json` eintragen, Harness neu laden,
      Serverstatus beobachten, danach sofort `git checkout -- .mcp.json`.
      Verbindet der Server (200), weiter mit Task 2. Bleibt es bei 401, ist die Annahme
      widerlegt: dann **Plan anhalten** und auf den im Brainstorming verworfenen Overlay-Weg
      umstellen (gitignorierte Harness-Overlay-Datei mit Klartext-Token). Das ist ein anderer
      Zuschnitt und braucht eine Plan-Revision, keinen Workaround im laufenden Task.

```bash
# Referenzwert: dieser Handshake liefert nachweislich 200 und dient als Vergleich
set -a; . ~/.config/bge-mcp/server.env; set +a
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:13005/mcp \
  -H "Authorization: Bearer $BGE_MCP_TOKEN" \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"probe","version":"1"}}}'
```

- [ ] **Task 2 — Failing-Test-Step (RED).** Die Testdatei liegt bereits im Branch. Ihren roten
      Zustand reproduzieren. Sechs der sieben Tests müssen fehlschlagen; Test 5
      (`mcp-sync.sh check stays green`) ist der Regressions-Anker und muss schon jetzt grün sein
      — schlägt er fehl, driftet die Arbeitskopie bereits und das ist vor allem anderen zu klären.
      Die Sicherung im Test (Backup der Repo-Ziele plus `HOME`-Override) darf nicht entfernt
      werden: solange `MCP_OUT_DIR` fehlt, fällt `render` auf die realen Ziele zurück statt zu
      scheitern, und würde dabei `~/.gemini/config/mcp_config.json` ausserhalb jeder
      git-Rückholbarkeit überschreiben.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/mcp-gateway/authenticated-http-headers.bats
# expected: FAIL (rot — Registry-Feld und Renderer-Durchreichung fehlen noch)
```

- [ ] **Task 3 — Generator: Output-Overrides einführen.**
      In `scripts/mcp-sync.sh` die hartkodierten Pfade über zwei Env-Overrides führen:
      `REGISTRY` aus `${MCP_REGISTRY:-$REPO/docs/agent-guide/registry/mcp.yaml}`, und ein
      Ausgabewurzel-Präfix `${MCP_OUT_DIR:-$REPO}` für `CLAUDE_TARGET`, `OPENCODE_TARGET` und
      `LLAMACPP_TARGET`. `AGY_TARGET` bleibt an `$HOME` gebunden (es liegt konstruktionsbedingt
      ausserhalb des Repos), profitiert aber davon, dass ein Test `HOME` überschreiben kann.
      Bei gesetztem `MCP_OUT_DIR` die Zielverzeichnisse anlegen (`.opencode/`, `scripts/llm/`),
      sonst scheitert `render` am fehlenden Pfad.
      Zu beachten: `render_opencode_jsonc` liest die **bestehende** Zieldatei ein, um alles
      ausserhalb des `"mcp"`-Blocks zu erhalten. Existiert unter `MCP_OUT_DIR` noch keine Datei,
      muss die Repo-Variante als Vorlage dienen — andernfalls bricht der Renderer beim
      Fixture-Lauf ab.

```bash
# Zwischenprüfung: ohne gesetzte Overrides ändert sich nichts
bash scripts/mcp-sync.sh check
```

- [ ] **Task 4 — Registry: `headers` für `bge-mcp` deklarieren.**
      In `docs/agent-guide/registry/mcp.yaml` beim Client `bge-mcp` ergänzen:
      `headers:` mit `Authorization: "Bearer ${BGE_MCP_TOKEN}"`.
      Im selben Zug den `auth_note` fortschreiben: er beschreibt heute die Generator-Lücke als
      bestehende Einschränkung und beschreibt neu den gelösten Zustand plus die verbleibende
      Betriebsvoraussetzung — `BGE_MCP_TOKEN` muss in der Umgebung exportiert sein, aus der der
      Harness startet; Quelle ist `~/.config/bge-mcp/server.env`, dieselbe Datei, die die
      systemd-Unit per `EnvironmentFile=` liest. Der Hinweis auf den UI-Dialog der llama-Web-UI
      bleibt bestehen: dieser Weg ist nicht betroffen, weil llama.cpp den Server nicht aus dieser
      Registry bezieht.

- [ ] **Task 5 — Fix-Step (GREEN): Renderer reichen Header generisch durch.**
      Alle drei HTTP-Zweige in `scripts/mcp-sync.sh` erweitern, ohne dass **ein Servername** im
      Generator auftaucht — das Feld gilt für jeden `transport: http`-Client:
      `render_claude_json` (`:25-27`) setzt `headers` auf dem `{ type, url }`-Objekt,
      `render_agy_json` (`:49-50`) analog auf `{ serverUrl }`, und `render_opencode_jsonc`
      (`:133-134`) reiht ein `headers`-Feld vor `enabled` in die `fields`-Liste ein.
      Zwei Eigenschaften sind zwingend: Werte werden **verbatim** emittiert (keine Expansion im
      Generator — der String `Bearer ${BGE_MCP_TOKEN}` landet unverändert in der Datei, expandiert
      wird erst vom Harness), und Clients ohne `headers` bleiben **byte-identisch** (kein leeres
      `headers: {}`, sonst meldet `check` Drift für jeden unbeteiligten Server).
      Der anschliessende Diff darf ausschliesslich den `bge-mcp`-Block berühren.

```bash
bash scripts/mcp-sync.sh render
bash scripts/mcp-sync.sh check
git diff --stat .mcp.json .opencode/opencode.jsonc
tests/unit/lib/bats-core/bin/bats tests/spec/mcp-gateway/authenticated-http-headers.bats
# expected: PASS (alle sieben Tests)
```

- [ ] **Task 6 — Doku: Token-Zustellung festhalten.**
      In `.claude/skills/references/mcp-tool-guide.md` beim `bge-mcp`-Abschnitt ergänzen, dass der
      Server Bearer-Auth verlangt und wie der Token in die Harness-Umgebung gelangt
      (`set -a; . ~/.config/bge-mcp/server.env; set +a` vor dem Start des Harness).
      Ausdrücklich mit aufnehmen, woran ein fehlender Token erkennbar ist: der Server erscheint
      als inaktiv, und ein direkter `initialize`-Aufruf antwortet mit `HTTP 401` und
      `www-authenticate: Bearer`. Das ist die Diagnose, die diesen Vorgang ausgelöst hat, und sie
      war ohne den Hinweis nicht vom Fall „Dienst läuft nicht" zu unterscheiden.

- [ ] **Task 7 — Final Verification.**
      Bestandssuite der Spec muss unverändert grün bleiben — sie enthält den Drift-Test, der die
      häufigste Regressionsquelle dieser Änderung abdeckt. Danach der Nachweis, dass kein Secret
      in eine getrackte Datei gelangt ist, das Ende-zu-Ende am realen Dienst (Harness neu laden;
      `bge-mcp` erscheint verbunden und listet `bge_embed` / `bge_rerank`), und zuletzt die drei
      Pflicht-Gates.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/mcp-gateway.bats

set -a; . ~/.config/bge-mcp/server.env; set +a
grep -rF "$BGE_MCP_TOKEN" .mcp.json .opencode/opencode.jsonc docs/agent-guide/registry/mcp.yaml || echo "clean"

task test:changed
task freshness:regenerate
task freshness:check
```
