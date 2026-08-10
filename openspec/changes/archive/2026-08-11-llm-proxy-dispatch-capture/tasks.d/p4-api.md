# p4 — API-Routen

**Rolle:** implementation
**Dateien:** `website/src/pages/sdlc/api/llm-proxy/requests.ts`,
`website/src/pages/sdlc/api/llm-proxy/requests/[id].ts`

## Kontext

Die Routen liegen neben den bestehenden `website/src/pages/sdlc/api/llm-proxy/*`-Endpunkten
(`backends.ts`, `status.ts`, `reload.ts`) und folgen deren Wach- und Validierungsmuster.
Die Trennung von Liste und Detail ist der Grund, warum das Panel überhaupt live sein kann —
siehe `design.md` → D5.

## Aufgaben

- [ ] **Liste: `requests.ts`.** `GET` liefert die neuesten Zeilen mit Kopfdaten. Die Abfrage
      benennt ihre Spalten einzeln und wählt `request_body` und `response_body` **nicht** aus.
      Kein `SELECT *`: die Body-Spalten sind der Grund, warum ein Panel-Aufruf sonst zweistellige
      MB zöge.

- [ ] **Seitengröße begrenzen** (Vorgabe 50, Obergrenze 200) und den Zeitraum optional über einen
      Parameter einschränkbar machen. Eine stillschweigende Kappung der Ergebnismenge wird in der
      Antwort ausgewiesen, nicht verschwiegen.

- [ ] **Detail: `requests/[id].ts`.** `GET` liefert eine Zeile einschließlich beider Bodies sowie
      `truncated`, `original_bytes` und `stream_incomplete`, damit die Anzeige den Zustand des
      Mitschnitts benennen kann. Unbekannte Kennung ergibt HTTP 404, keine leere Zeile.

- [ ] **Zugriffsschutz** wie bei den benachbarten `llm-proxy`-Routen: Sitzung prüfen und
      Admin-Rolle verlangen, bevor irgendetwas gelesen wird.

- [ ] **Typisierung ohne `any`.** Beide Handler und der Zeilentyp sind ausdrücklich typisiert. Das
      Gate CQ02 deckelt explizite `any`-Verwendungen in `website/src` bei 200; dieser Vorgang darf
      die Zahl nicht erhöhen.

- [ ] **Antwortform von Hand prüfen** — geprüft wird der Antwortkörper, nicht der Quelltext:

```bash
curl -s 'http://web.localhost/sdlc/api/llm-proxy/requests?limit=1' | jq 'keys, (.items[0] | keys)'
# erwartet: die Schluessel eines Eintrags enthalten weder request_body noch response_body
curl -s 'http://web.localhost/sdlc/api/llm-proxy/requests/1' | jq 'has("request_body"), has("response_body")'
# erwartet: true, true
```

## Budgets

Beide Dateien sind neu. Wirksame Schwelle ist das `.ts`-Limit von 900 Zeilen; beide werden mit
großer Reserve darunter geschnitten (je unter 120 Zeilen erwartet).
