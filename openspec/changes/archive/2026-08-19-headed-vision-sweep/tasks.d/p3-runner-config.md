# p3 — Lauf-Konfiguration und Taskfile-Ziel

Ziel: ein Aufruf, der die vier Sweep-Projects headed mit drei Workern fährt. Betroffen:
`tests/e2e/playwright.visual-sweep.config.ts`, `Taskfile.yml`.

## Aufgaben

- [x] **Worker-Deckel in der Sweep-Konfiguration setzen.** Die Datei erbt heute `workers` aus
      `playwright.config.ts`, wo der Wert aus `PLAYWRIGHT_WORKERS` mit Vorgabe 4 kommt. Vier
      Worker hieße vier gleichzeitige Vision-Anfragen und damit eine Anfrage mehr, als das
      Modell Slots hat. In der Sweep-Konfiguration deshalb explizit auf 3 deckeln, mit einer
      Kommentarzeile, die die Herkunft der Zahl nennt (drei gemessene Slots,
      `scripts/llm/measurements/2026-08-19-gemma12-slots.md`).

      Vier Projects auf drei Workern ist beabsichtigt: drei laufen, das vierte rückt nach. Die
      Obergrenze hängt an der Worker-Zahl, nicht an der Project-Zahl.

- [x] **Taskfile-Ziel `test:e2e:visual-sweep:vision` anlegen.** Es baut auf dem bestehenden
      Ziel `test:e2e:visual-sweep` auf, setzt aber:
      `VISUAL_SWEEP_VISION=1`, `--headed`, `--workers=3` und alle vier Projects in einem Aufruf.
      Die Brand-Zuordnung der URLs (`WEBSITE_URL`, `PROD_DOMAIN`) folgt dem bestehenden Ziel;
      weil beide Brands im selben Lauf vorkommen, wird die URL je Project über die vorhandene
      Auflösung gesetzt und nicht global überschrieben.

- [x] **Vorbedingung: eine Anzeige muss da sein.** Headed ohne gesetztes `DISPLAY` bricht mit
      einer Chromium-Fehlermeldung ab, die nicht nach der eigentlichen Ursache aussieht. Eine
      `preconditions`-Zeile mit klarer Meldung vorschalten.

- [x] **Vorbedingung: der Vision-Endpunkt muss antworten.** Vor dem Lauf `/v1/models` am Proxy
      abfragen. Anders als im Testcode ist ein Fehlschlag hier zulässig und erwünscht — wer
      dieses Ziel aufruft, will ausdrücklich ein Vision-Urteil, und ein stiller Lauf ohne jedes
      Urteil wäre die schlechtere Antwort. Die Meldung nennt beide Abhilfen getrennt: Proxy
      starten, oder die Backend-Migration anwenden.

- [x] **Kein CI-Anschluss.** Das Ziel wird in keinem Workflow unter `.github/workflows/`
      aufgerufen. REQ-k8-02 bleibt unangetastet.

- [x] **S4 beachten.** Es entsteht kein neues Skript unter `scripts/`; die Logik bleibt im
      Taskfile-Ziel. Damit gibt es nichts, was verwaisen könnte.
