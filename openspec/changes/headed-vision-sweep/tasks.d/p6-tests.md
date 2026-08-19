# p6 — Tests (Rot vor Grün)

Ziel: die Zusicherungen aus dem Delta-Spec sind maschinell geprüft. Betroffen:
`tests/e2e/lib/vision-judge.test.ts`, `tests/spec/e2e-test-infrastructure/vision-sweep.bats`,
`components/website/src/data/test-inventory.json`.

Geprüft wird **Kommandoausgabe und Rückgabewert**, nicht der Quelltext. Zwei Ebenen, weil zwei
verschiedene Dinge schiefgehen können: die Auswertung einer Modellantwort (reine Funktionen,
vitest) und die Verdrahtung des Laufs (Kommandoausgabe, BATS).

## Aufgaben

- [ ] **Rotphase — beide Testdateien anlegen und scheitern sehen.** Vor jeder Implementierung
      ausführen. Der vitest-Lauf scheitert, weil `tests/e2e/lib/vision-judge.ts` noch nicht
      existiert; der BATS-Lauf scheitert, weil weder das Taskfile-Ziel noch der korrigierte
      Vision-Pfad da sind.

```bash
cd tests/e2e && ./node_modules/.bin/vitest run lib/vision-judge.test.ts
# expected: FAIL (rot — das Modul existiert noch nicht)

cd "$(git rev-parse --show-toplevel)"
tests/unit/lib/bats-core/bin/bats tests/spec/e2e-test-infrastructure/vision-sweep.bats
# expected: FAIL (rot — Ziel und Pfadkorrektur fehlen noch)
```

- [ ] **vitest: Antwortauswertung** (`tests/e2e/lib/vision-judge.test.ts`). Fälle, jeder gegen
      den Rückgabewert der Funktion, nicht gegen deren Quelltext:
      eine schemakonforme Antwort ergibt ein Urteil mit den erwarteten Befundkennungen;
      eine abgeschnittene Antwort ergibt `unusable` und lässt die Rohantwort stehen;
      eine schemafremde Antwort mit plausibel aussehendem Inhalt ergibt ebenfalls `unusable` und
      **kein** teilweise gefülltes Urteil — das ist der eigentliche Punkt von REQ-vs-04.

- [ ] **vitest: Anfrageaufbau.** Der erzeugte Rumpf trägt `temperature: 0`, ein
      `response_format`, und der Text-Teil nennt alle fünf Befundkennungen. Geprüft wird gegen
      die aus dem Modul exportierte Schema-Konstante, nicht gegen eine Abschrift im Test —
      sonst prüft der Test seine eigene Kopie.

- [ ] **vitest: Vorgabewerte.** Ohne gesetzte Umgebungsvariablen zeigt der Endpunkt auf
      `127.0.0.1:18235` und der Modellname ist `gemma12-vision`. Positiv-Anker: der Test prüft
      zuerst, dass `visionConfig()` überhaupt ein Objekt mit nicht-leerem Endpunkt liefert, und
      erst danach dessen Inhalt. Ohne diesen Anker bestünde der Test auch, wenn die Funktion
      nichts zurückgäbe.

- [ ] **vitest: die Stufe ist standardmäßig aus.** Ohne `VISUAL_SWEEP_VISION=1` meldet die
      Konfiguration den Zustand „aus" (REQ-vs-01, zweites Szenario).

- [ ] **BATS: Verdrahtung des Laufs** (`tests/spec/e2e-test-infrastructure/vision-sweep.bats`).
      Geprüft wird die Ausgabe von Kommandos:

      Das Taskfile-Ziel existiert und ist beschrieben — `task --list` enthält
      `test:e2e:visual-sweep:vision`.

      Der Lauf ist auf drei Worker gedeckelt und headed — der Trockenlauf des Ziels gibt
      `--workers=3` und `--headed` aus. Bei jeder Zusicherung ein Positiv-Anker mitprüfen: die
      Ausgabe ist nicht leer. Eine leere Ausgabe darf nicht als „Muster nicht gefunden" und
      damit als bestandener Negativtest durchgehen.

      Das Ziel wird von keinem Workflow aufgerufen — Suche über `.github/workflows/` liefert
      keinen Treffer, und der Positiv-Anker belegt, dass das Verzeichnis überhaupt durchsucht
      wurde (Trefferzahl für ein bekannt vorhandenes Muster größer als null).

- [ ] **BATS: der falsche Vision-Pfad ist weg.** Weder `k8-headed-verify.spec.ts` noch
      Schritt 8.5 des Skills nennen 8094 oder 8091 als Vision-Endpunkt; beide nennen 18235.
      Auch hier gilt die Positiv-Anker-Pflicht: erst belegen, dass die Dateien gelesen wurden,
      dann die Abwesenheit prüfen.

      Anker CRLF-tolerant formulieren.

- [ ] **Grünphase.** Beide Läufe aus der Rotphase erneut ausführen; beide bestehen.

- [ ] **Testinventar regenerieren.** Zwei neue Testdateien, deshalb Pflicht — der CI-Job
      vergleicht die eingecheckte Datei gegen den neu erzeugten Stand:

```bash
task test:inventory
```

## Was hier bewusst nicht geprüft wird

Die Qualität des Modellurteils. Ob Gemma eine kaputte Seite als kaputt erkennt, ist kein
Gegenstand eines Merge-Gates — die Stufe berichtet und entscheidet nicht (REQ-vs-02). Ein Test
dagegen wäre nicht reproduzierbar und würde bei jedem Modellwechsel rot.

Ebenso wenig geprüft wird der laufende Vision-Server. Kein Test in diesem Partial setzt einen
erreichbaren Endpunkt voraus; alle laufen offline. Ein Test, der einen laufenden GPU-Host
braucht, misst in CI die Ausstattung des Runners statt den Zustand des Codes, und „rot, weil
Server fehlt" ist von „rot, weil Code kaputt" in der Ausgabe nicht zu unterscheiden. Der
Nachweis am lebenden Endpunkt steht stattdessen als Messschritt in der abschließenden
Verifikation des Index-Plans.
