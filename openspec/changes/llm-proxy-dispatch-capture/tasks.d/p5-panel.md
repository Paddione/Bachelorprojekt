# p5 — Cockpit-Panel und Adapter

**Rolle:** implementation
**Dateien:** `website/src/components/cockpit/DispatchLogPanel.svelte`,
`website/src/pages/sdlc/cockpit.astro`, `.lavish/kit/adapter.js`,
`website/public/cockpit/kit/adapter.js`

## Kontext

Das Panel greift nicht selbst zum Netz. `openspec/specs/sdlc-cockpit.md` verlangt unter
*„Daten-Adapter — Kein direkter fetch() aus Panels"* den Weg über den Adapter; *„D10 —
Panel-deklarierte Refresh-Rate"* und *„D11 — Kein Polling unsichtbarer Panels"* gelten mit.

**Die Adapter-Datei existiert zweimal und die Kopien sind byte-identisch:** `.lavish/kit/adapter.js`
und `website/public/cockpit/kit/adapter.js`. Der Vertragstest
`tests/spec/sdlc-cockpit/adapter-contract.bats` prüft ausschließlich die erste. Wer nur eine der
beiden ändert, erzeugt eine Abweichung, die dieser Test nicht bemerkt — beide Kopien werden
gleichlautend geändert.

## Aufgaben

- [ ] **Adapter erweitern.** Zwei Lesemethoden ergänzen: eine für die Liste, eine für das Detail,
      nach dem Muster der bestehenden Methoden in derselben Datei. Danach die zweite Kopie auf den
      identischen Stand bringen und das mit `diff -q` belegen.

- [ ] **Panel anlegen.** `DispatchLogPanel.svelte` zeigt die Liste, neueste zuerst, mit den Spalten
      Zeitpunkt, Backend, Modell, Ticket, Partial, Dauer, Status. Ein Klick auf eine Zeile öffnet
      den Drawer, der über die Detail-Methode Prompt und Antwort nachlädt — erst beim Öffnen, nie
      vorher.

- [ ] **Zustände sichtbar machen.** `truncated` wird als Hinweis mit der Originalgröße angezeigt;
      `stream_incomplete` als eigener Vermerk. Leere Korrelationsfelder erscheinen als
      ausdrückliches Abwesenheitszeichen, nicht als leere Zelle — eine leere Zelle liest sich wie
      ein Wert.

- [ ] **Live-Anbindung.** Das Panel abonniert den bestehenden Ereignisstrom (`cockpit_events`,
      siehe `website/src/lib/sdlc/cockpit-listen-hub.ts`) und ergänzt eintreffende Zeilen oben.
      Kein eigenes Abfrageintervall.

- [ ] **Panel einhängen.** In `website/src/pages/sdlc/cockpit.astro` neben `PipelinePanel`
      einbinden. Es entsteht keine neue SDLC-Fläche — das Cockpit-Spec verlangt unter *„Genau eine
      SDLC-Fläche im Admin-Menü"* genau das.

- [ ] **Darstellung im Browser prüfen** — geprüft wird die gerenderte Seite, nicht der Quelltext:
      `http://web.localhost/sdlc/cockpit` öffnen, einen Dispatch auslösen und belegen, dass die
      Zeile ohne Neuladen erscheint und der Drawer die Bodies zeigt.

## Budgets

| Datei | Ist | Budget |
| --- | --- | --- |
| `website/src/pages/sdlc/cockpit.astro` | 265 | 335 |
| `.lavish/kit/adapter.js` | 628 | 172 |
| `website/public/cockpit/kit/adapter.js` | 628 | 172 |

Keine der drei Dateien ist gebaselinet; wirksame Schwellen sind die Extension-Limits (`.astro` 600,
`.js` 800). Die beiden Adapter-Kopien sind byte-identisch und müssen es bleiben.
`DispatchLogPanel.svelte` ist neu und wird mit Reserve unter dem `.svelte`-Limit von 800
geschnitten.

<!-- vitest: die Tests fuer Panel und API liegen gesammelt in p6 -->
