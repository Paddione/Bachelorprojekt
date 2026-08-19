# p1 — Vision-Client

Ziel: `tests/e2e/lib/vision-judge.ts`. Ein reines Modul ohne Playwright-Import, damit es in
vitest ohne Browser prüfbar ist (S2: kein Rück-Import auf Sweep- oder DB-Schichten).

## Aufgaben

- [x] **Konfiguration aus der Umgebung lesen.** Eine Funktion `visionConfig()` liefert Endpunkt,
      Modellalias, Zeitgrenze und den Ein-/Aus-Schalter. Vorgaben:
      `VISION_URL` → `http://127.0.0.1:18235/v1/chat/completions`,
      `VISION_MODEL` → `gemma12-vision`,
      `VISION_TIMEOUT_MS` → `60000`,
      `VISUAL_SWEEP_VISION` → aus, sofern nicht `1`.
      Der Endpunkt zeigt auf den llm-proxy, nicht auf Port 8089: der llama.cpp-Server läuft auf
      dem Windows-GPU-Host und ist aus WSL nicht direkt erreichbar.

- [x] **Erreichbarkeit einmalig prüfen.** `probeVision()` holt `/v1/models` vom Proxy und stellt
      fest, ob der Modellalias geführt wird. Das Ergebnis wird für den Lauf zwischengespeichert.
      Rückgabe ist ein Zustand mit Begründung, kein nackter Wahrheitswert — die Begründung landet
      später in jeder übersprungenen Zeile.

      Der Alias kann fehlen, obwohl der Proxy antwortet: die Modellliste kommt aus der
      Backend-Tabelle in der Datenbank, nicht aus einer Datei. Eine leere Liste bedeutet, dass
      die Migration `scripts/migrations/2026-08-19-llm-proxy-parallel-slots.sql` in dieser
      Umgebung nicht angewandt wurde. Diesen Fall als eigene Begründung ausgeben
      („Alias nicht geführt") und nicht mit „Proxy nicht erreichbar" vermengen — die Abhilfe ist
      eine andere.

- [x] **Anfrage bauen.** `buildVisionRequest({ route, brand, viewport, domStatus, imageBase64 })`
      erzeugt den Rumpf nach Abschnitt 2 des Designs: `temperature: 0`, `max_tokens: 320`, ein
      Text-Teil mit dem Fragenkatalog aus Abschnitt 3 und ein `image_url`-Teil mit
      `data:image/jpeg;base64,…`. Der Fragenkatalog nennt die fünf Kennungen wörtlich, damit sie
      mit dem Schema übereinstimmen. Route, Brand, Viewport und der DOM-Status stehen im
      Text-Teil — ohne sie ist `unexpected_auth_wall` nicht beantwortbar.

- [x] **Antwortform erzwingen.** Die Anfrage trägt `response_format` mit dem JSON-Schema aus
      Abschnitt 4 des Designs. Das Schema wird als Konstante exportiert, damit der Test in p6
      gegen dieselbe Quelle prüft und nicht gegen eine Abschrift.

- [x] **Antwort auswerten.** `parseVerdict(raw)` prüft die Antwort gegen das Schema und liefert
      entweder ein Urteil oder `{ status: 'unusable', raw }`. Kein teilweises Parsen: eine
      abgeschnittene oder formfremde Antwort wird verworfen, nicht gerettet. Ein halb geparstes
      Urteil sieht aus wie ein Ergebnis und ist keins.

- [x] **Aufruf kapseln.** `judgeScreenshot(...)` verbindet die Teile, setzt
      `AbortSignal.timeout(VISION_TIMEOUT_MS)` und fängt jeden Fehler ab. Die Funktion wirft
      niemals — sie liefert im Fehlerfall eine Zeile mit `status: 'skipped'` und der Begründung.
      Das ist die technische Umsetzung von REQ-vs-02.

## Prüfung dieses Partials

Reine Funktionen, deshalb ohne laufenden Server prüfbar. Der zugehörige vitest-Test entsteht
in p6.
