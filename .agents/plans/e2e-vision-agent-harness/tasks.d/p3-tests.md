---
partial: p3
role: tests
ticket_id: T901645
depends_on: [p1, p2]
---

# p3 — Orakel-Tests (`tests/e2e/agent/oracle.test.mjs`)

Fixture-basierte `node --test`-Suite für `tests/e2e/agent/oracle.mjs` aus p1:
Orakel-Checks gegen URL/Text/State-Tripel, Positiv- und Negativfälle, kein
Browser. Muster: `scripts/llm-proxy/bge-routes.test.mjs` (`node:test` +
`node:assert/strict`). Commit als `test: oracle-tests fuer vision-agent-harness`.

Budget: `tests/e2e/agent/oracle.test.mjs` ist neu, Ist 0, nicht-baselined,
.mjs-Limit 800 → volles Budget 800, geplant ca. 150 Zeilen.

## Task 1: Rot — erster Orakel-Test schlägt fehl

### Steps

1. `tests/e2e/agent/oracle.test.mjs` anlegen, Importe aus
   `scripts/llm-proxy/bge-routes.test.mjs` übernehmen (`node:test`,
   `node:assert/strict`, dazu der Orakel-Import aus
   `tests/e2e/agent/oracle.mjs`).
2. Einen Test schreiben, der `evaluateFlow` (Name aus p1, nicht `checkFlow`) mit einem Login-Fixture-Tripel
   (URL `/login`, sichtbarer Text mit `Anmelden`, leerer API-State)
   aufruft und `{pass: true}` erwartet.
3. Suite laufen lassen:

```bash
node --test tests/e2e/agent/oracle.test.mjs
```

Das Ergebnis lautet expected: FAIL, weil der Orakel-Import aus p1 zu
diesem Zeitpunkt noch nicht existiert.

### Verify

- `node --test tests/e2e/agent/oracle.test.mjs` endet mit Fehlerstatus und
  nennt den fehlenden Orakel-Import.

## Task 2: Grün — vollständige Orakel-Suite gegen Fixtures

### Steps

1. Nach p1 die Suite auf alle Orakel-Checks ausweiten: je Check ein
   Positiv-Tripel (alle Bedingungen erfüllt → `pass: true`, jeder Eintrag
   in `checks` grün) und je ein Negativ-Tripel pro Bedingung (falsche URL,
   fehlender Text, abweichender API-State → `pass: false`, genau der
   betroffene Check rot mit belegtem `detail`).
2. Flow-Namen der Fixtures aus `tests/e2e/agent/curated.json` (p2)
   übernehmen, damit jede Fixture einem kuratierten Flow entspricht.
3. Suite grün laufen lassen:

```bash
node --test tests/e2e/agent/oracle.test.mjs
```

### Verify

- `node --test tests/e2e/agent/oracle.test.mjs` meldet alle Tests bestanden.
- `wc -l tests/e2e/agent/oracle.test.mjs` bleibt deutlich unter dem
  .mjs-Limit 800.

## Task 3: Runner-Smoke als manueller Verify-Step

### Steps

1. Lokale Dev-Instanz starten (`AGENT_BASE_URL`, Default
   `http://localhost:4321`), Modell-Endpunkt via `AGENT_MODEL_URL`
   (Default `http://127.0.0.1:1931`) bereitstellen.
2. Einen Smoke-Flow aus `tests/e2e/agent/curated.json` mit genau einer
   Wiederholung fahren:

```bash
node tests/e2e/agent/runner.mjs --flows tests/e2e/agent/curated.json --model "$AGENT_MODEL_URL" --reps 1 --out /tmp/p3-smoke.jsonl
```

3. `/tmp/p3-smoke.jsonl` lesen: Orakel-Ergebnis `{pass, checks}` liegt vor,
   bei Fehlschlag nennt `detail` den Grund.

### Verify

- Manuell: JSONL-Zeile vorhanden und Orakel-Felder befüllt. Kein CI-Gate,
  nur Smoke-Nachweis für diesen Partial.
