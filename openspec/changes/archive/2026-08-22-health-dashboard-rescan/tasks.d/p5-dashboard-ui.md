# p5 — Dashboard-UI

_Ticket: T013306 · Rolle: impl · depends_on: p4_

## Zieldatei

- `components/website/src/components/sdlc/GoalsDashboard.svelte` (349 → ca. 540 Zeilen,
  S1-Limit `.svelte` 1100)

Die Komponente ist Svelte 4 (`on:click`, `$:`-Reaktivität, `export let`) — Stil und Syntax der
bestehenden Datei beibehalten, nicht auf Runes umstellen.

## Aufgaben

- [ ] Auswahl-State: `let selected = new Set<string>()`. Svelte 4 erkennt Mutationen an einem `Set`
      nicht — nach jeder Änderung neu zuweisen (`selected = new Set(selected)`), sonst rendert die
      Anzeige nicht nach.

- [ ] Checkbox je Ziel-Karte. Sie darf **nicht** im vorhandenen `<button class="goal-header">`
      liegen — ein `<input>` in einem `<button>` ist ungültiges Markup und der Klick würde das
      Ausklappen auslösen. Die Checkbox davor setzen, mit `<label>` und sichtbarem Bezug zum Ziel
      (`aria-label` mit Ziel-ID und Titel).

- [ ] Auswahl bleibt über den Kategorie-Filter stabil: `selected` hält Ziel-IDs, nicht Indizes,
      und wird bei `selectedCategory`-Wechsel nicht zurückgesetzt. Die Aktionsleiste zeigt die
      Gesamtzahl der markierten Ziele, auch wenn ein Teil gerade ausgefiltert ist — sonst schickt
      der Button mehr Ziele weg, als der Nutzer sieht.

- [ ] Auswahl auch für die Green Gates in `GREEN_GATES` anbieten, wenn das ohne Umbau des
      `<details>`-Blocks geht. Andernfalls hier weglassen und im Abschlussbericht benennen — nicht
      still auslassen.

- [ ] Aktionsleiste über dem Grid (`sticky`, sobald etwas markiert ist):
      - `N markiert` + „Auswahl aufheben"
      - Button **Neu scannen** → `POST /sdlc/api/health-goals/rescan` mit `{ ids: [...selected] }`
      - Button **Tickets erzeugen** → `POST /sdlc/api/health-goals/tickets`
      - Beide Buttons `disabled` bei leerer Auswahl und während eines laufenden Requests, mit
        sichtbarem Ladezustand. Der Rescan kann Minuten dauern; ein Button ohne Rückmeldung wird
        mehrfach gedrückt.
      - Die Obergrenze aus `p4` (25 IDs) im UI spiegeln: bei mehr Markierungen den Button sperren
        und den Grund anzeigen, statt den `400` erst nach dem Klick zu zeigen.

- [ ] Rescan-Ergebnis als Overlay: `let scanResults: Record<string, ScanResult> = {}` plus
      `scannedAt`. Auf der Karte eines gescannten Ziels erscheint zusätzlich zur bestehenden
      Anzeige:
      - `measurable: true` → der frische Wert, dazu die Kennzeichnung, ob er vom dokumentierten
        abweicht. Der dokumentierte Wert bleibt sichtbar und als solcher erkennbar
        (REQ-HEALTH-GOALS-011, zweites Szenario). Der Balken darf mitlaufen, aber nur zusätzlich —
        der dokumentierte Stand darf nicht überschrieben aussehen.
      - `measurable: false` → **„nicht messbar"** im Klartext an der Wertstelle. Nicht der alte
        Wert, keine leere Zelle, kein Häkchen (REQ-HEALTH-GOALS-012).
      - Zeitstempel des Scans in der Kopfzeile, deutlich getrennt vom `Mess-Stichtag` der SSOT.
        Zwei Datumsangaben ohne Beschriftung sind schlimmer als eine.

- [ ] Ticket-Ergebnis anzeigen: je Ziel `created` (mit `external_id`), `skipped` (mit dem bereits
      offenen Titel) oder `failed` (mit Meldung). Als Liste in der Aktionsleiste, nicht als
      `alert()` — ein Dialog blockiert und der Nutzer verliert das Ergebnis beim Wegklicken.

- [ ] Fehlerbehandlung: `res.ok === false` → Meldung aus dem Body anzeigen. Kein stiller
      `catch {}`; ein fehlgeschlagener Scan, der aussieht wie „nichts gefunden", ist genau die
      Fehlerklasse, gegen die dieser Change geschrieben ist.

- [ ] Styles im vorhandenen Blockstil ergänzen (Monospace-Palette, `#e2e8f0`/`#94a3b8`). Keine
      Brand-Domain-Literale, keine neuen Font-Imports.

## Abschluss dieses Partials

```bash
cd components/website && pnpm exec svelte-check --threshold error 2>&1 | tail -20
wc -l src/components/sdlc/GoalsDashboard.svelte   # erwartet: deutlich unter 1100
```

Danach der Sichttest im laufenden Leitstand: Ziele markieren, scannen, Ergebnis prüfen — inklusive
eines Ziels, das „nicht messbar" liefert.
