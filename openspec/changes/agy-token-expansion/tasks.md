---
title: "agy-token-expansion — Implementation Plan"
ticket_id: T002704
domains: [ops, llm]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# agy-token-expansion — Implementation Plan

_Ticket: T002704_

## File Structure

```
scripts/mcp-sync.sh                                  (geändert — Auflösung in render_agy_json, 260 → ~290 Zeilen)
tests/spec/mcp-gateway/agy-token-expansion.bats      (neu — bereits im RED-Commit enthalten)
openspec/changes/agy-token-expansion/                (Plan-Artefakte: proposal.md, design.md, specs/mcp-gateway.md)
```

**S1-Budget:** `.sh` hat ein Limit von 800 Zeilen (`docs/code-quality/gates.yaml`),
`scripts/mcp-sync.sh` steht bei 260 und hat keinen Baseline-Eintrag. Wirksame Schwelle ist damit
das Limit; auch mit ~30 zusätzlichen Zeilen bleibt reichlich Reserve. Kein Verkleinerungsschritt
nötig.

## Partials

Ein Partial — eine Funktion in einer Datei, dazu der bereits geschriebene Test. Eine Aufteilung
erzeugte nur Koordinationsaufwand.

| # | Rolle | target_files |
|---|-------|--------------|
| p1 | fix + tests | `scripts/mcp-sync.sh`, `tests/spec/mcp-gateway/agy-token-expansion.bats` |

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).** `tests/spec/mcp-gateway/agy-token-expansion.bats` liegt bereits
      im Stage-Commit. Er rendert gegen eine Fixture-Registry in einem tmpdir und prüft die
      erzeugte agy-Config. Vor dem Fix fallen drei der fünf Tests: der Header trägt weiterhin
      `Bearer ${PROBE_TOKEN}` statt des Werts (Umgebung **und** `server.env`-Fallback), und die
      Warnung für den unauflösbaren Fall fehlt. Die Tests 4 und 5 sind bereits grün — sie sichern
      ab, dass der Fix weder platzhalterfreie Werte anfasst noch den aufgelösten Wert in die
      getrackten Dateien trägt.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/mcp-gateway/agy-token-expansion.bats
# expected: FAIL (rot — 3 von 5 fallen, 2 sind Regressionsanker)
```

- [x] **Fix-Step (GREEN).** In `scripts/mcp-sync.sh` eine Auflösungsfunktion ergänzen und in
      `render_agy_json` auf jeden Header-Wert anwenden:
      - Variablenquelle: zuerst die Umgebung des Aufrufers, dann `$HOME/.config/bge-mcp/server.env`.
        Die Datei zeilenweise als `KEY=VALUE` lesen, **nicht** `source`-n — sie ist eine
        systemd-`EnvironmentFile`, kein Shell-Skript; `source` würde beliebigen Code ausführen und
        Anführungszeichen anders behandeln als systemd.
      - Jedes `${VAR}` im Wert ersetzen, auch mehrere im selben Wert. Werte ohne `${...}` bleiben
        byte-identisch.
      - Ist eine Variable nirgends definiert: Platzhalter stehen lassen, eine Warnung **mit dem
        Variablennamen** auf stderr, Exit 0.
      - Gilt für alle Clients, nicht für einen hart kodierten Variablennamen.
      - `render_claude_json` und `render_opencode_jsonc` bleiben unverändert.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/mcp-gateway/agy-token-expansion.bats
# erwartet: 5 von 5 grün
```

- [x] **Drift-Prüfung.** `check` rendert frisch und vergleicht gegen die reale Datei. Weil beide
      Pfade dieselbe Auflösungsfunktion benutzen, muss der Vergleich nach einem `render` sauber
      sein:

```bash
task mcp:sync
task mcp:check
# erwartet: OK für alle vier Ziele, insbesondere mcp_config.json
```

- [x] **End-to-End-Beleg — erbracht.** Der Sync lief bewusst **ohne** `BGE_MCP_TOKEN` in der
      Umgebung, also über den `server.env`-Fallback — genau der Normalfall, an dem es gescheitert
      war. Danach zählte agy **sieben** Server statt sechs, `bge-mcp` inbegriffen:

```bash
env -u BGE_MCP_TOKEN bash scripts/mcp-sync.sh render
agy --print-timeout 2m -p 'Liste NUR die Namen aller dir verfuegbaren MCP-Server auf, kommasepariert. Wenn du keine hast, antworte exakt: KEINE.'
# Ergebnis 2026-08-08:
#   bge-mcp, codebase-memory-mcp, factory-mcp, mcp-kubernetes, mcp-postgres, mcp-task-runner, ticket-mcp
```

> **Was dieser Beleg NICHT zeigt:** ein anschliessender Versuch, `bge_embed` über agy aufzurufen,
> endete mit `a tool required the "mcp" permission that headless mode cannot prompt for, so it was
> auto-denied`. Das ist agys Berechtigungssystem im Headless-Betrieb, nicht die Verbindung — ein
> nicht erreichbarer Server erschiene gar nicht erst in der Aufzählung. Wer agy headless mit
> MCP-Tools fahren will, braucht dafür eine `permissions.allow`-Regel; das ist ein eigener
> Vorgang und nicht Teil dieses Fixes.

- [ ] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
