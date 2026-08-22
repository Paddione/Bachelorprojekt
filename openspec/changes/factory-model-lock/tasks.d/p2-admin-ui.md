---
title: P2 — Auswahl im Webinterface
ticket_id: T013144
domains: [llm-proxy]
status: implemented
---

# P2 — Auswahl im Webinterface

## target_files

- `scripts/llm-proxy/ui/index.html`

## Schritt 2.1 — Abschnitt "Default-Factory-Modell"

Ueber der bestehenden Loadout-Tabelle, unter `<div id="msg">`, einfuegen:

```html
<fieldset id="factory">
  <legend>Default-Factory-Modell</legend>
  <select id="factory-model"></select>
  <label><input type="checkbox" id="factory-locked"> sperren</label>
  <button id="factory-save">speichern</button>
  <p id="factory-hint"></p>
</fieldset>
```

Kein Freitextfeld (D2). Der Existenz-Check aus P1 ist die Absicherung gegen tote
Modellnamen; ein Textfeld daneben wuerde ihn wirkungslos machen.

## Schritt 2.2 — Laden, Anzeigen, Speichern

```js
let factoryMtime = null

async function loadFactory(status) {
  const f = await api('/admin/factory')
  factoryMtime = f.mtimeMs
  const byslug = Object.fromEntries((status ?? []).map((s) => [s.slug, s]))
  $('#factory-model').replaceChildren(...f.selectable.map((s) => {
    const o = document.createElement('option')
    o.value = s.slug
    // Laufzustand steht MIT in der Option (R1 im Design): "aktiviert" und
    // "geladen" sind verschiedene Dinge, und nur das zweite entscheidet, ob eine
    // Anfrage wirklich bei diesem Modell landet. Genau diese Verwechslung war
    // T003538. Der Start wird hier NICHT erzwungen — man will ein Modell sperren
    // koennen, bevor man es startet.
    o.textContent = `${s.label} (${s.slug}) — ${byslug[s.slug]?.running ? 'laeuft' : 'gestoppt'}`
    o.selected = s.slug === f.model
    return o
  }))
  $('#factory-locked').checked = f.locked
  $('#factory-hint').textContent = f.locked
    ? 'Gesperrt: die Factory benutzt ausschliesslich dieses Modell. Die Eskalation auf ein externes Modell ist damit abgeschaltet.'
    : 'Nicht gesperrt: der Wert ist nur der Default. Phase-Pin und Provider-Kette in der Datenbank entscheiden weiterhin.'
}

$('#factory-save').onclick = async () => {
  $('#factory-save').disabled = true
  try {
    await api('/admin/factory', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: $('#factory-model').value,
        locked: $('#factory-locked').checked,
        mtimeMs: factoryMtime,
      }),
    })
    msg('Default-Factory-Modell gespeichert.')
  } catch (err) { msg(err.message, true) }
  $('#factory-save').disabled = false
  refresh()
}
```

`loadFactory(status)` wird in `refresh()` mit dem dort ohnehin geholten `status` aufgerufen
— kein zweiter Statusabruf, und der Laufzustand in der Auswahl bleibt mit der Tabelle
synchron. Der bestehende `setInterval(refresh, 5000)` traegt das mit.

**Achtung beim Einbau:** `refresh()` darf `loadFactory` erst aufrufen, nachdem die
Auswahl gerendert ist, sonst ueberschreibt der 5-Sekunden-Takt eine gerade getroffene,
noch nicht gespeicherte Auswahl. Deshalb in `loadFactory` die Neu-Bestueckung
ueberspringen, solange `document.activeElement === $('#factory-model')`.
