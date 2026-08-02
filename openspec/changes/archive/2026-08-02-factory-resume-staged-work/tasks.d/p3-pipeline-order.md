# p3 — Reihenfolge korrigieren und Fremdbesitz zurückstellen

Rolle: `impl`. `depends_on: p1, p2`. Verbraucht die Markerzeile aus p1 und die Rückgabefelder aus p2.

`target_files`: `scripts/factory/pipeline.js` (existiert, 603 Zeilen, steht auf der
`s1.ignore`-Liste in `docs/code-quality/gates.yaml:65`).

## Harte Randbedingung

`pipeline.js` ist ein Claude-Code-Workflow-Skript. Es darf **keine** Top-Level-Importe vor `meta`
und **kein** `import()` zur Laufzeit enthalten (T000460) — das ist die Begründung für die
S1-Ausnahme. Jede Logik, die über Verzweigung und Logging hinausgeht, gehört nach `pipeline-runner.js`
(dort in p2 vorbereitet) und wird über `runRunner(agent, '<command>', payload)` gerufen.

`scripts/factory/pipeline.mjs` ist der ESM-Zwilling derselben Datei. Vor der Änderung prüfen, ob er
denselben Reuse-Block trägt; falls ja, gehört die Korrektur dort ebenso hinein, sonst driften die
beiden auseinander:

```bash
grep -n "read-partials\|setupWorktree" scripts/factory/pipeline.mjs
```

Ist `pipeline.mjs` betroffen, ist das **kein** Grund, ihn stillschweigend mitzuändern: er steht
nicht in `target_files` dieses Partials. Den Befund melden und die Datei als Nachtrag behandeln.

## Aufgaben

- [x] **P3.1 — Ist-Stand lesen.** Der Reuse-Block (314–338) und der Implement-Block (340–356) sind
      die beiden Hälften, deren Reihenfolge sich umkehrt:

```bash
sed -n '310,360p' scripts/factory/pipeline.js
```

- [x] **P3.2 — Worktree vor dem Manifest-Lesen anlegen.** Der `setupWorktree`-Aufruf (Zeile 345)
      muss ausgeführt sein, bevor `read-partials` (Zeile 320) `${WORK_WT}/openspec/changes/<slug>`
      liest. Andernfalls existiert der Pfad nicht und der Fallback greift — der eigentliche Fehler
      dieses Changes.

      **Die Bedingung muss mitwandern.** `setupWorktree` läuft heute nur, wenn `tasks.length &&
      !A.batch_mode` (Zeile 341). Wird der Aufruf nach vorne gezogen, ohne diese Einschränkung zu
      berücksichtigen, legt **jeder** Lauf einen Worktree an — auch Läufe, die nie implementieren.
      Der neue Aufruf gehört daher an den Anfang des `if (REUSE)`-Zweigs, nicht vor ihn.

- [x] **P3.3 — Nicht doppelt anlegen.** Nach der Umstellung darf `setupWorktree` pro Lauf nur
      einmal erfolgreich durchlaufen. Der bestehende Aufruf im Implement-Block muss entweder
      entfallen oder erkennen, dass der Worktree schon steht. Ein zweiter Aufruf mit demselben Pfad
      scheitert (`<path> already exists`) und würde direkt in die Eskalation laufen.

- [x] **P3.4 — Auf den Fremdbesitz-Marker verzweigen.** `setupWorktree` gibt heute
      `{ ok, detail }` zurück; `ok` hängt allein an `/ready on/`. Den aus p1 stammenden
      Fremdbesitz-Fall zusätzlich unterscheiden und aus der Funktion herausreichen (etwa
      `{ ok:false, reason:'branch-in-use' }`).

- [x] **P3.5 — Fremdbesitz stellt zurück statt zu blockieren.** Im Fremdbesitz-Fall **nicht** den
      Pfad aus Zeile 346–355 nehmen. Kein `update-status --status blocked`, keine
      PushNotification-Eskalation. Stattdessen: den Slot freigeben, ein `phase-event` mit
      erkennbarem Grund schreiben und mit einem eigenen Status zurückkehren, sodass der nächste
      Tick das Ticket regulär erneut aufgreift.

      Die Slot-Freigabe ist der kritische Teil: bleibt der Slot belegt, verhungert die Queue. Wie
      andere Rückgabepfade den Slot freigeben, vorher ablesen:

```bash
grep -n "slots.sh\|release" scripts/factory/pipeline.js | head -20
```

- [x] **P3.6 — Echten Fehlschlag unverändert lassen.** Jeder andere Grund für ein gescheitertes
      `setupWorktree` führt weiterhin zu `blocked` plus Eskalation. Dieser Pfad wird nicht
      angefasst.

- [x] **P3.7 — Übersprungene Partials protokollieren.** Die aus p2 zurückgegebenen IDs über `log()`
      ausgeben, im selben Stil wie die vorhandene Meldung in Zeile 323. Ohne diese Zeile ist im
      Nachhinein nicht nachvollziehbar, warum ein Lauf weniger Tasks hatte als der Plan Partials.

- [x] **P3.8 — Den Fallback laut machen.** Meldet p2 ein fehlendes Manifest, das ausdrücklich
      loggen, bevor der LLM-Decompose in Zeile 327 anläuft. Ebenso den in P2.4 erkennbar gemachten
      Fehlschlag der Phase-Event-Abfrage. Ein stiller Fallback ist die Fehlersituation, die dieser
      Change beseitigt — er darf nicht in anderer Form zurückkehren.

- [x] **P3.9 — Strukturvertrag prüfen.** `pipeline.js` wird von einem Kontrakttest abgesichert.
      Diesen vor dem Commit laufen lassen:

```bash
grep -rn "FA-SF-20" tests/ | head -5
```

      Den gefundenen Test ausführen und grün bekommen.

- [x] **P3.10 — Reihenfolge am Quelltext belegen.** Die erste Fundstelle von `setupWorktree(agent`
      muss eine kleinere Zeilennummer haben als die erste von `'read-partials'`:

```bash
grep -n 'setupWorktree(agent' scripts/factory/pipeline.js | head -1
grep -n "'read-partials'" scripts/factory/pipeline.js | head -1
```

## Abnahmekriterien

- `setupWorktree` läuft im REUSE-Pfad vor `read-partials`; die Zeilennummern belegen es.
- Der Worktree wird pro Lauf höchstens einmal angelegt, und nur wenn tatsächlich implementiert wird.
- Ein anderweitig ausgecheckter Branch führt zu Slot-Freigabe und einem `phase-event`, **nicht** zu
  `blocked` und **nicht** zu einer PushNotification.
- Jeder andere Worktree-Fehlschlag eskaliert unverändert.
- Übersprungene Partial-IDs, ein fehlendes Manifest und ein Fehlschlag der Phase-Event-Abfrage
  erscheinen jeweils als eigene Log-Zeile.
- Keine Top-Level-Importe und kein `import()` in `pipeline.js`; der FA-SF-20-Kontrakttest ist grün.
- Falls `pipeline.mjs` denselben Block trägt, ist der Befund gemeldet (nicht stillschweigend
  mitgeändert).
