# p6 — Tests

**Rolle:** tests
**Dateien:** `scripts/llm-proxy/request-log.test.mjs`, `scripts/llm-proxy/respond.test.mjs`,
`tests/spec/local-llm-proxy/dispatch-capture.bats`,
`website/src/pages/sdlc/api/llm-proxy/__tests__/requests.test.ts`

## Kontext

Geprüft wird **Kommando-Output und Resultat**, nicht die Implementierungsquelle (Repo-Konvention
T002448-M4). Ein `grep` auf `server.mjs` belegt nur, dass Text existiert — genau diese Form steht
heute in `tests/spec/local-llm-proxy.bats:452` und ist der Grund, warum die Konvention es
ausdrücklich untersagt.

Neue `@test`-Blöcke gehören in eine **eigene Datei** unter `tests/spec/<spec-slug>/` (T002416); an
die Sammeldatei `tests/spec/local-llm-proxy.bats` wird nichts angehängt.

## Aufgaben

- [ ] **Failing-Test-Step (RED).** Die Prüfungen gegen einen Fake-Backend-Server schreiben und
      gegen den Stand **vor** p2 laufen lassen:

```bash
node --test scripts/llm-proxy/request-log.test.mjs
# expected: FAIL (rot — request-log.mjs existiert noch nicht)
```

- [ ] **Nicht-streamender Dispatch wird vollständig erfasst.** Echte Anfrage durch den echten
      Proxy gegen einen Fake-Backend; danach die geschriebene Zeile prüfen — Bodies, Backend,
      Status, Dauer.

- [ ] **Streamender Dispatch: Antwort beim Aufrufer unverändert.** Die beim Client ankommenden
      Bytes mit denen ohne Mitschnitt vergleichen. Der Tap ist genau dann richtig gebaut, wenn er
      hier nichts ändert.

- [ ] **Backend bricht mitten im Stream ab.** Der wichtigste Fall: der Client behält die bereits
      empfangenen Chunks, eine **nachfolgende** Anfrage auf demselben Backend wird noch bedient
      (die Warteschlange lebt), und die Zeile trägt `stream_incomplete = true`. Der Test stellt den
      Abbruch aktiv her, statt ihn abzuwarten.

- [ ] **Datenbank nicht erreichbar.** Bei fehlschlagendem Schreibweg liefert der Dispatch dieselbe
      Antwort mit demselben Status wie bei erreichbarer Datenbank, und es entsteht keine Zeile.

- [ ] **Bündelung.** Zwanzig Dispatches innerhalb eines Fensters erzeugen zwanzig Zeilen und
      **einen** Schreibvorgang. Gezählt werden die Aufrufe des Schreibwegs, nicht die Zeilen im
      Quelltext.

- [ ] **Kappung.** Ein Body über 256 KiB führt zu `truncated = true` und einem `original_bytes`,
      das der Größe vor der Kappung entspricht.

- [ ] **Korrelation.** Mit gesetzten Headern landen Slot, Ticket und Partial in der Zeile; ohne sie
      bleiben die Spalten `NULL`. Positiv-Anker zuerst: erst belegen, dass der gefüllte Fall
      durchläuft, dann die Negativ-Aussage prüfen — sonst besteht der Negativtest vakuos, wenn die
      Erfassung gar nicht läuft (T002356-M1).

- [ ] **Liste führt keine Bodies.** Vitest gegen `requests.ts`: die Antwort enthält weder
      `request_body` noch `response_body`. Positiv-Anker: zuerst prüfen, dass überhaupt ein
      Eintrag zurückkommt — sonst ist „kein Body enthalten" über einer leeren Liste trivial wahr.

- [ ] **Detail führt die Bodies.** Vitest gegen `requests/[id].ts`, samt HTTP 404 bei unbekannter
      Kennung.

- [ ] **Testinventar erneuern.** `task test:inventory` ausführen und
      `website/src/data/test-inventory.json` mitcommitten — CI vergleicht die Datei und schlägt bei
      Abweichung fehl.

- [ ] **Beide BATS-Formen laufen lassen.** Sammeldatei und Verzeichnis sind gleichzeitig gültig;
      eine Suche nur nach `tests/spec/local-llm-proxy.bats` fände die Hälfte (T002696):

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/local-llm-proxy*
```

## Budgets

Alle vier Dateien sind neu und werden mit Reserve unter ihren Extension-Limits geschnitten
(`.mjs` 800, `.ts` 900; `.bats` trägt keine S1-Schwelle).
