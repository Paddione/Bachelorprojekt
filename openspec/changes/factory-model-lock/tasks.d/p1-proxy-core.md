---
title: P1 — Proxy-Kern (Validierung, Admin-Route, Seed)
ticket_id: T013144
domains: [llm-proxy]
status: plan_staged
---

# P1 — Proxy-Kern

## target_files

- `scripts/llm-proxy/loadouts.mjs`
- `scripts/llm-proxy/server.mjs`
- `scripts/llm/loadouts.json`

## Schritt 1.1 — `factory`-Block validieren

In `scripts/llm-proxy/loadouts.mjs`, in `parseLoadouts`, direkt **nach** dem
`doc.roles`-Block (er endet mit `return doc;`) einen `doc.factory`-Block einfuegen. Die
Reihenfolge ist nicht beliebig: der Existenz-Check braucht die bereits validierten
`doc.loadouts`.

```js
// T013144 — Das Default-Factory-Modell. Optional: ein Proxy ohne Factory laeuft
// ohne diesen Block. Ist er da, wird er fail-closed geprueft — und zwar gegen die
// LOADOUTS, nicht nur auf Form.
//
// Der Existenz-Check ist der Zweck des Blocks, nicht seine Formalie. Ein toter
// Modellname erzeugte bisher NIRGENDS einen Fehler, weil resolveModel() eine
// unbekannte ID still auf das erste gesunde Backend umleitet — zweimal passiert
// (T002582 'gemma-4-12b', T003538 'gemma26-factory'). Was nicht schreibbar ist,
// kann nicht still umgeleitet werden.
if (doc.factory != null) {
  const f = doc.factory;
  if (typeof f !== 'object' || Array.isArray(f)) fail('factory muss ein Objekt sein');
  for (const k of Object.keys(f)) {
    if (k !== 'model' && k !== 'locked') fail(`factory: unbekanntes Feld '${k}'`);
  }
  if (typeof f.model !== 'string' || !f.model) fail('factory.model muss ein nicht-leerer String sein');
  if (!doc.loadouts.some((l) => l.slug === f.model)) {
    fail(`factory.model '${f.model}' existiert nicht in loadouts`);
  }
  if (f.locked != null && typeof f.locked !== 'boolean') fail('factory.locked muss ein Boolean sein');
}
```

Zusaetzlich zwei Leser exportieren, damit `server.mjs` die Default-Regel nicht kopiert —
dieselbe Ueberlegung, die `isLoadoutEnabled` (T003204) zu einer Funktion statt zu
verstreuten Vergleichen gemacht hat:

```js
/** T013144 — Die EINE Definition von "was benutzt die Factory". Fehlt der Block,
 *  gibt es kein Pin: null heisst "kein Pin", nicht "kaputt". */
export function factoryModel(doc) { return doc?.factory?.model ?? null; }

/** Gesperrt ist nur, was ausdruecklich gesperrt wurde — ein fehlendes Feld ist
 *  offen. Umgekehrt waere ein stiller Verhaltenswechsel beim Merge. */
export function factoryLocked(doc) { return doc?.factory?.locked === true; }
```

## Schritt 1.2 — Admin-Routen

In `scripts/llm-proxy/server.mjs`, im Loadout-Verwaltungsblock direkt nach der
`/admin/loadouts/status`-Route (vor `startMatch`), zwei Routen ergaenzen. Der Import oben
um `factoryModel, factoryLocked` erweitern.

```js
if (path === '/admin/factory' && method === 'GET') {
  try {
    const { doc, mtimeMs } = readLoadouts(DEFAULT_PATH);
    return sendJson(res, 200, {
      model: factoryModel(doc),
      locked: factoryLocked(doc),
      mtimeMs,
      // Auswaehlbar sind nur aktivierte Loadouts. Ein abgeschaltetes anzubieten
      // hiesse, eine Sperre auf etwas setzen zu lassen, das planAutoStart
      // ausdruecklich nicht mehr startet (T003204).
      selectable: doc.loadouts.filter(isLoadoutEnabled).map((l) => ({
        slug: l.slug, label: l.label, port: l.port,
      })),
    });
  } catch (err) {
    return sendJson(res, 500, { error: { code: 'loadouts_invalid', message: err.message } });
  }
}
if (path === '/admin/factory' && method === 'PUT') {
  try {
    const body = await readBody(req);
    const { doc } = readLoadouts(DEFAULT_PATH);
    // Der Schreibweg geht durch writeLoadouts, nicht an ihm vorbei: dort sitzt
    // die kanonische Serialisierung (T002553) UND die Validierung aus 1.1. Ein
    // eigener Serializer hier wuerde beim naechsten regulaeren Schreibvorgang
    // einen Vollzeilen-Diff erzeugen.
    doc.factory = { model: body.model, locked: body.locked === true };
    writeLoadouts(doc, DEFAULT_PATH, body.mtimeMs ?? null);
    const { mtimeMs } = readLoadouts(DEFAULT_PATH);
    return sendJson(res, 200, { saved: true, mtimeMs });
  } catch (err) {
    const conflict = /conflict|geaendert/i.test(err.message);
    return sendJson(res, conflict ? 409 : 400,
      { error: { code: conflict ? 'stale_write' : 'invalid', message: err.message } });
  }
}
```

Die 400/409-Unterscheidung wird woertlich von `PUT /admin/loadouts` uebernommen, damit
beide Schreibwege denselben Konfliktschutz haben und nicht auseinanderlaufen.

## Schritt 1.3 — Seed in `loadouts.json`

Top-Level-Block ergaenzen, **nicht** von Hand formatiert, sondern ueber den kanonischen
Schreibweg (`node -e` mit `readLoadouts`/`writeLoadouts`), damit die Dateiform stimmt:

```json
"factory": { "model": "gemma26-throughput", "locked": false }
```

`locked: false` beim Merge ist Absicht: der Merge selbst darf das Verhalten der Factory
nicht aendern. Der Wert `gemma26-throughput` ist derselbe, den `route-provider.sh` heute
als Default fuehrt — die Datei schreibt also zunaechst nur fest, was ohnehin gilt. Das
Sperren ist ein Klick im Webinterface, keine Merge-Nebenwirkung.

Anschliessend `task llm:loadouts:check` — die Datei muss kanonisch bleiben.
