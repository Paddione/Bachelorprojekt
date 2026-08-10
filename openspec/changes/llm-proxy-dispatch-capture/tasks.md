---
title: "llm-proxy-dispatch-capture — Implementation Plan"
ticket_id: T003277
domains: [llm-proxy, sdlc-cockpit, factory]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# llm-proxy-dispatch-capture — Implementation Plan

**Ticket:** T003277
**Branch:** `feature/llm-proxy-dispatch-capture-T003277`
**Design:** `openspec/changes/llm-proxy-dispatch-capture/design.md`

## File Structure

```
scripts/
├── llm-proxy/
│   ├── request-log.mjs          # neu — capture(), truncate(), flush()
│   ├── respond.mjs              # neu — Antwortpfade aus proxyV1 extrahiert
│   ├── request-log.test.mjs     # neu
│   ├── respond.test.mjs         # neu
│   └── server.mjs               # geaendert — zwei Aufrufe in proxyV1
├── factory/pipeline.mjs         # geaendert — Korrelations-Header
└── migrations/2026-08-10-llm-proxy-request-log.sql   # neu
```

```
website/src/
├── pages/sdlc/
│   ├── api/llm-proxy/requests.ts               # neu — Liste ohne Bodies
│   ├── api/llm-proxy/requests/[id].ts          # neu — Detail mit Bodies
│   ├── api/llm-proxy/__tests__/requests.test.ts # neu
│   └── cockpit.astro                           # geaendert — Panel eingehaengt
└── components/cockpit/DispatchLogPanel.svelte  # neu
```

```
.lavish/kit/adapter.js                  # geaendert — zwei Lesemethoden
website/public/cockpit/kit/adapter.js   # geaendert — identische Kopie
.opencode/agent-models.jsonc            # geaendert — Header im Provider-Block
Taskfile.yml                            # geaendert — Aufraeum-Task
tests/spec/local-llm-proxy/dispatch-capture.bats   # neu
```

## Partials

| p1 | tasks.d/p1-schema.md | implementation | scripts/migrations/2026-08-10-llm-proxy-request-log.sql, Taskfile.yml |
| p2 | tasks.d/p2-capture.md | implementation | scripts/llm-proxy/request-log.mjs, scripts/llm-proxy/respond.mjs, scripts/llm-proxy/server.mjs |
| p3 | tasks.d/p3-correlation.md | implementation | .opencode/agent-models.jsonc, scripts/factory/pipeline.mjs |
| p4 | tasks.d/p4-api.md | implementation | website/src/pages/sdlc/api/llm-proxy/requests.ts, website/src/pages/sdlc/api/llm-proxy/requests/[id].ts |
| p5 | tasks.d/p5-panel.md | implementation | website/src/components/cockpit/DispatchLogPanel.svelte, website/src/pages/sdlc/cockpit.astro, .lavish/kit/adapter.js, website/public/cockpit/kit/adapter.js |
| p6 | tasks.d/p6-tests.md | tests | scripts/llm-proxy/request-log.test.mjs, scripts/llm-proxy/respond.test.mjs, tests/spec/local-llm-proxy/dispatch-capture.bats, website/src/pages/sdlc/api/llm-proxy/__tests__/requests.test.ts |

**Disjunktheit:** Keine Datei kommt in mehr als einem Partial vor (D1).

## S1-Budgets der geänderten Dateien

Gemessen am Branch-Stand `d041220e6` mit `wc -l` und dem Baseline-Nachschlag aus
`docs/code-quality/baseline.json`:

```bash
for f in scripts/llm-proxy/server.mjs scripts/factory/pipeline.mjs \
         website/src/pages/sdlc/cockpit.astro .lavish/kit/adapter.js \
         website/public/cockpit/kit/adapter.js; do
  ist=$(wc -l < "$f" | tr -d ' ')
  base=$(jq -r --arg k "S1:$f" '.[$k].metric // "nicht-baselined"' docs/code-quality/baseline.json)
  echo "$f Ist=$ist Baseline=$base"
done
```

| Datei | Ist | Budget |
| --- | --- | --- |
| `scripts/llm-proxy/server.mjs` | 665 | 135 |
| `website/src/pages/sdlc/cockpit.astro` | 265 | 335 |
| `.lavish/kit/adapter.js` | 628 | 172 |
| `website/public/cockpit/kit/adapter.js` | 628 | 172 |

Keine dieser Dateien ist gebaselinet; wirksame Schwelle ist jeweils das Extension-Limit aus
`docs/code-quality/gates.yaml` (`.mjs`/`.js` 800, `.astro` 600). `server.mjs` liegt mit 83 % am
dichtesten an seiner Schwelle — deshalb enthält p2 eine echte Extraktion nach `respond.mjs`, durch
die die Datei netto schrumpft, statt das Budget aufzubrauchen.

**Ohne S1-Schwelle**, deshalb bewusst ohne Budgetzahl: `scripts/factory/pipeline.mjs` steht in
`gates.yaml` → `s1.ignore`, das Gate misst die Datei also nicht — eine Budgetangabe dort sähe wie
eine Messung aus, wäre aber keine. `.opencode/agent-models.jsonc` und `Taskfile.yml` fallen unter
keine Extension-Regel (`.jsonc` und `.yml` stehen nicht in `s1.limits`). Alle übrigen Dateien des
Vorgangs sind neu und werden mit Reserve unter ihren Limits geschnitten.

**Reihenfolge:** p1 vor p2 (die Tabelle muss stehen, bevor geschrieben wird) und p4 vor p5 (das
Panel liest über die Routen). p3 ist unabhängig und beginnt mit einer Machbarkeitsprobe, deren
Ausgang den übrigen Vorgang nicht aufhält.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Die Prüfungen aus p6 gegen den Stand vor p2 laufen lassen:

```bash
node --test scripts/llm-proxy/request-log.test.mjs
# expected: FAIL (rot — request-log.mjs existiert noch nicht)
```

- [ ] **Umsetzung (GREEN).** p1 bis p6 abarbeiten; danach laufen dieselben Prüfungen durch:

```bash
node --test scripts/llm-proxy/request-log.test.mjs scripts/llm-proxy/respond.test.mjs
tests/unit/lib/bats-core/bin/bats -r tests/spec/local-llm-proxy*
```

- [ ] **Rückwirkungsfreiheit belegen.** Der Mitschnitt darf den Transport nicht verändern. Vor und
      nach der Umsetzung dieselbe Anfrage stellen und die Antworten vergleichen:

```bash
curl -s -X POST http://127.0.0.1:18235/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{"model":"gemma26-factory","messages":[{"role":"user","content":"ping"}]}' | jq -S . > /tmp/nachher.json
# erwartet: gleiche Struktur und gleicher Status wie vor der Aenderung
```

- [ ] **Abschließende Prüfung.** Die drei verbindlichen Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
