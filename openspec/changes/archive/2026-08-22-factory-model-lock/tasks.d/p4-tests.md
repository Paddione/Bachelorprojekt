---
title: P4 — Tests und Runner-Registrierung
ticket_id: T013144
domains: [test, llm, factory]
status: implemented
---

# P4 — Tests und Runner-Registrierung

## target_files

- `scripts/llm-proxy/factory-pin.test.mjs`
- `scripts/llm-proxy/loadouts.test.mjs`
- `scripts/llm-proxy/server.test.mjs`
- `tests/spec/local-llm-proxy/factory-model-lock.bats`
- `tests/spec/software-factory/factory-model-lock.bats`
- `Taskfile.yml`
- `.github/workflows/ci.yml`

## Schritt 4.1 — Failing-Test-Step (rot vor gruen)

Zuerst rot, bevor irgendeine Implementierung aus P1 bis P3 steht. In
`scripts/llm-proxy/loadouts.test.mjs` ergaenzen:

```js
test('factory.model muss ein existierender Loadout-Slug sein', () => {
  const doc = { version: 1, modelRoots: [], loadouts: [{ slug: 'a', model: 'a.gguf', port: 8091 }],
                factory: { model: 'gibt-es-nicht', locked: true } };
  assert.throws(() => parseLoadouts(JSON.stringify(doc)), /gibt-es-nicht/);
});
```

Lauf:

```bash
node --test scripts/llm-proxy/loadouts.test.mjs
# expected: FAIL — parseLoadouts kennt den factory-Block noch nicht und wirft nicht
```

Erst danach P1 implementieren und denselben Befehl gruen sehen. Ein Test, der vor dem
Fix schon gruen ist, schuetzt nicht, er beruhigt nur — genau der Punkt, den der Kommentar
in `factory-model-id-default.bats` an seinem eigenen Verworfenen-Entwurf festhaelt.

## Schritt 4.2 — `scripts/llm-proxy/factory-pin.test.mjs` (neu)

node:test-Datei fuer die beiden Admin-Routen, gegen einen in-process gestarteten Server
mit temporaerer `loadouts.json` (Muster: `server.test.mjs`):

- `GET /admin/factory` ohne Block liefert `model: null, locked: false`
- `GET /admin/factory` listet in `selectable` nur Loadouts mit `enabled !== false`
- `PUT` mit unbekanntem Slug liefert 400 und laesst die Datei unveraendert
  (Dateiinhalt vorher/nachher vergleichen — der Positiv-Anker ist, dass der Vorher-Inhalt
  nicht leer ist)
- `PUT` mit veraltetem `mtimeMs` liefert 409 `stale_write`
- `PUT` mit gueltigem Slug schreibt und die Datei entspricht danach `serializeLoadouts`

## Schritt 4.3 — `tests/spec/local-llm-proxy/factory-model-lock.bats` (neu)

- `scripts/llm/loadouts.json` parst mit dem ausgelieferten `factory`-Block
- `scripts/llm-proxy/ui/index.html` enthaelt `id="factory-model"` und `id="factory-locked"`
- die UI enthaelt **kein** Freitextfeld fuer die Modell-ID (D2): kein
  `<input` mit `type="text"` innerhalb des `factory`-Fieldsets

## Schritt 4.4 — `tests/spec/software-factory/factory-model-lock.bats` (neu)

Geprueft wird das **Kommando-Ergebnis**, nicht die Quelle: `route-provider.sh` mit einem
gestubbten `factory_model_pin` aufrufen (via `PATH`-Stub fuer `curl`, der die
Admin-Antwort liefert) und die JSON-Ausgabe pruefen.

- gesperrt: `route-provider.sh factory-implement sonnet` und `... factory-scout opus`
  liefern beide `modelId` = gesperrtes Modell und `slotId` = `null`
- gesperrt: die stderr-Ausgabe nennt das gesperrte Modell (Positiv-Anker: stderr ist
  nicht leer)
- kein Proxy (curl-Stub liefert nichts): die Ausgabe ist unveraendert gegenueber dem
  heutigen Verhalten, kein Abbruch, Exit 0
- `dispatcher-bridge.sh` setzt bei Sperre `FACTORY_MODEL_LOCKED=1` und `model_tier=flash`
- `pipeline.mjs` ignoriert `args.model_tier` bei `FACTORY_MODEL_LOCKED=1`

Fuer den letzten Punkt gilt dieselbe dokumentierte Ausnahme wie in
`factory-model-id-default.bats`: `pipeline.mjs` laeuft nur in der Workflow-Harness, also
wird die Bedingung an der Quelle gelesen. Die Begruendung gehoert als Kommentar in die
Testdatei, nicht nur in diesen Plan.

## Schritt 4.5 — Runner-Registrierung (Pflicht)

`scripts/llm-proxy/factory-pin.test.mjs` in **beiden** Listen eintragen — sonst schlaegt
`tests/spec/local-llm-proxy/proxy-tests-registered.bats` fehl, und zwar zu Recht: eine
Testdatei, die in keinem Ziel laeuft, ist kein Regressionsschutz.

- `Taskfile.yml`, Task `test:llm-proxy`, die `node --test`-Zeile
- `.github/workflows/ci.yml`, llm-proxy-Schritt

Danach:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy/proxy-tests-registered.bats
```
