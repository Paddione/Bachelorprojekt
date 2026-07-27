# p5 — Absicherung der Wiederaufnahme

Rolle: `tests`. `depends_on: p1, p2, p3, p4`. Letztes Partial, trägt den RED-Schritt.

`target_files`: `tests/spec/software-factory.bats` (existiert, 4298 Zeilen; `.bats` steht nicht in
`s1.limits`).

**Kein neues Testfile.** Die Konvention verlangt eine Datei je SSOT-Spec; die Delta-Spec dieses
Changes zielt auf `software-factory`, also gehören die Assertions dorthin. Keine
ticket-nummerierte Datei anlegen.

## Was hier nicht geprüft werden kann

`tickets.factory_phase_events` ist in CI nicht erreichbar. Die Tests prüfen deshalb **Struktur und
Verzweigung**, nicht den Datenbank-Roundtrip: dass die Reihenfolge im Quelltext stimmt, dass der
Marker existiert, dass die Fremdbesitz-Verzweigung nicht in den `blocked`-Pfad führt. Das ist die
Grenze dieses Partials und soll als Kommentar im Testfile stehen, damit niemand später einen
DB-Test hier vermutet.

## Achtung — `$output`-Falle

Der Worktree dieses Changes heißt `factory-resume-staged-work`. Jede unqualifizierte Assertion der
Form `[[ "$output" == *"resume"* ]]` gegen die Ausgabe eines Skripts, das `$0` mitdruckt, ist
**dauerhaft grün** — der Pfad enthält den Suchbegriff bereits. Genau dieser Fehler wurde in
`tests/spec/factory-reclaim-lock-respect.bats` gefunden (T002267/T002272). Assertions daher immer
auf die relevante Zeile einschränken, etwa
`run bash -c "… 2>&1 | grep '^worktree-create:' | grep -c 'branch in use'"`.

## Aufgaben

- [ ] **P5.1 — RED.** Die neuen Assertions vor p1 bis p3 laufen lassen. Weder Markerzeile noch
      korrigierte Reihenfolge existieren, der Lauf muss rot sein:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats
# expected: FAIL (rot — Marker und korrigierte Reihenfolge existieren noch nicht)
```

- [ ] **P5.2 — Assertion: Reihenfolge im Quelltext.** Die erste Fundstelle von `setupWorktree(agent`
      in `scripts/factory/pipeline.js` hat eine kleinere Zeilennummer als die erste von
      `'read-partials'`. Beide Zeilennummern im Test vergleichen, nicht nur auf Vorkommen prüfen —
      ein reiner Existenztest wäre schon vor dem Fix grün.

- [ ] **P5.3 — Assertion: Markerzeile in `worktree-create.sh`.** Der Begriff `branch in use`
      erscheint in einer `worktree-create:`-Ausgabezeile, wenn derselbe Branch ein zweites Mal
      angefordert wird. Der Testbranch wird im Test selbst angelegt und wieder entfernt; auf
      keinen Fall einen Branch einer fremden Session verwenden.

- [ ] **P5.4 — Assertion: kein Rest bei Fremdbesitz.** Nach dem abgewiesenen Aufruf existiert kein
      Worktree-Verzeichnis am Zielpfad und der belegte Branch existiert unverändert weiter. Das ist
      die Absicherung gegen den schwersten Fehlermodus aus P1.4.

- [ ] **P5.5 — Assertion: dedizierter Exit-Code.** Der Fremdbesitz-Fall endet mit dem in p1
      festgelegten Exit-Code, nicht mit `0` und nicht mit dem generischen Fehlercode.

- [ ] **P5.6 — Assertion: Fremdbesitz führt nicht zu `blocked`.** Im Fremdbesitz-Zweig von
      `pipeline.js` darf weder `--status blocked` noch die PushNotification-Eskalation stehen. Da
      der Zweig nicht ausführbar getestet werden kann, prüft der Test den Quelltext des Zweigs —
      und kommentiert genau das als bewusste Einschränkung.

- [ ] **P5.7 — Assertion: `queue.sh` unverändert.** Das Hold-Gate aus T002272 bleibt unangetastet:

```bash
git diff --exit-code origin/main -- scripts/factory/queue.sh
```

- [ ] **P5.8 — Assertion: keine Import-Verletzung in `pipeline.js`.** Weder ein Top-Level-Import vor
      `meta` noch ein `import(` zur Laufzeit. Falls der FA-SF-20-Kontrakttest das bereits abdeckt,
      **keine zweite Assertion schreiben**, sondern im Kommentar auf ihn verweisen — doppelte
      Zusicherungen driften auseinander.

```bash
grep -rn "FA-SF-20" tests/ | head -5
```

- [ ] **P5.9 — Jede Assertion einmal künstlich brechen.** Reihenfolge in `pipeline.js` tauschen,
      Markerzeile umformulieren, Exit-Code ändern — und jeweils bestätigen, dass BATS rot wird.
      Ohne diesen Schritt ist nicht belegt, dass die Tests überhaupt etwas prüfen. Danach
      zurücknehmen.

- [ ] **P5.10 — Test-Inventar.** Es kommt keine Datei hinzu, aber die `@test`-Zählung ändert sich:

```bash
task test:inventory
git status --porcelain website/src/data/test-inventory.json
```

- [ ] **P5.11 — Finale Verifikation.**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

## Abnahmekriterien

- Die Assertions decken ab: Aufrufreihenfolge, Markerzeile, Ausbleiben eines Rest-Worktrees,
  dedizierter Exit-Code, Fehlen des `blocked`-Pfads im Fremdbesitz-Zweig, Unverändertheit von
  `queue.sh`.
- Keine Assertion prüft unqualifiziert gegen `$output`; jede ist auf die relevante Ausgabezeile
  eingeschränkt.
- Jede neue Assertion wurde einmal künstlich zum Fehlschlagen gebracht (P5.9).
- Die Grenze „kein DB-Roundtrip in CI" steht als Kommentar im Testfile.
- Kein neues Testfile; alle Assertions liegen in `tests/spec/software-factory.bats`.
- `task test:changed`, `task freshness:regenerate` und `task freshness:check` sind grün.
