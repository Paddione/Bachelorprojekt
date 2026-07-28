# p2 — `read-partials` meldet, was es übersprungen hat

Rolle: `impl`. Keine Vorbedingung. Parallel zu p1 lauffähig.

`target_files`: `scripts/factory/pipeline-runner.js` (existiert, 476 Zeilen, S1-Limit `.js` 600 →
Reserve 124 Zeilen).

## Ausgangslage

`read-partials` (ab Zeile 403) ermittelt bereits die erledigten Partials: es liest die
`partial-done`-Einträge aus `tickets.factory_phase_events` und reicht sie an `orderAndFilter` aus
`scripts/factory/partial-order.cjs`. Diese Information verlässt die Funktion aber nicht — der
Aufrufer erfährt weder, welche IDs herausgefiltert wurden, noch ob überhaupt ein Manifest gefunden
wurde.

Damit kann `pipeline.js` heute den Rückfall auf den LLM-Decompose nicht vom Normalfall
unterscheiden. Genau diese Ununterscheidbarkeit hat den Reihenfolgefehler so lange verdeckt.

**Die Erkennung selbst wird nicht angefasst.** Es entsteht kein zweiter Fortschrittsmechanismus
(Design E1) — die Phase-Events bleiben die einzige Quelle.

## Aufgaben

- [x] **P2.1 — Ist-Stand lesen.** Der vollständige `read-partials`-Zweig samt Rückgabeform:

```bash
sed -n '400,470p' scripts/factory/pipeline-runner.js
```

- [x] **P2.2 — Übersprungene IDs zurückgeben.** Die von `orderAndFilter` entfernten Partial-IDs in
      die Rückgabe aufnehmen (etwa als `skipped: [...]`). Die bestehenden Felder — insbesondere
      `partials` und `sub_features` — behalten Name und Bedeutung, weil `pipeline.js:321` auf
      `partials.partials` und `Array.isArray(partials.sub_features)` prüft.

- [x] **P2.3 — Fehlendes Manifest ausdrücklich melden.** Findet `P.readPartials(dir)` kein
      Manifest, muss die Rückgabe das unterscheidbar ausdrücken (etwa `manifest: 'absent'`) statt
      nur ein leeres Objekt zu liefern. Der Aufrufer soll „kein Manifest vorhanden" von
      „Verzeichnis nicht lesbar" trennen können — Ersteres ist ein legitimer Plan ohne `tasks.d/`,
      Letzteres ein Umgebungsfehler.

- [x] **P2.4 — Den DB-Fehlerpfad nicht verschlucken.** Die Abfrage der Phase-Events steht heute in
      einem `try`-Block. Schlägt sie fehl, bleibt `doneIds` leer und alle Partials gelten als
      offen — die Pipeline würde stillschweigend alles wiederholen. Diesen Fall in der Rückgabe
      kenntlich machen, damit p3 ihn protokollieren kann. **Das Verhalten selbst bleibt
      unverändert** (weiterlaufen statt abbrechen); nur die Stille wird beseitigt.

- [x] **P2.5 — Rückwärtskompatibel bleiben.** Andere Aufrufer von `read-partials` prüfen:

```bash
grep -rn "read-partials" scripts/ tests/ | grep -v node_modules
```

      Jeder gefundene Aufrufer muss mit der erweiterten Rückgabe unverändert funktionieren. Neue
      Felder werden ergänzt, keine bestehenden umbenannt oder entfernt.

- [x] **P2.6 — Zeilenbudget prüfen.** Nach der Änderung:

```bash
wc -l scripts/factory/pipeline-runner.js
```

      Bei mehr als 600 Zeilen ist das Limit gerissen. Dann **nicht** Zeilen zusammenziehen, sondern
      den `read-partials`-Zweig in ein eigenes Modul unter `scripts/factory/` auslagern und von
      `pipeline-runner.js` importieren. Diese Datei darf importieren — die Import-Sperre aus
      T000460 gilt nur für `pipeline.js` und `pipeline.mjs`.

- [x] **P2.7 — Lokal gegenprüfen.** Der Runner wird normalerweise von der Pipeline gerufen. Für
      eine isolierte Probe genügt ein Plan-Verzeichnis mit `tasks.d/` — dieser Change bringt
      selbst eines mit:

```bash
node -e "const P=require('./scripts/factory/partials.cjs'); console.log(JSON.stringify(P.readPartials('openspec/changes/factory-resume-staged-work'),null,1))" 2>&1 | head -20
```

      Der Modulpfad ist vor dem Aufruf zu verifizieren (`grep -n "require.*partial" scripts/factory/pipeline-runner.js`);
      der Name oben ist eine Annahme, keine Zusicherung.

## Abnahmekriterien

- `read-partials` gibt die übersprungenen Partial-IDs zurück.
- Ein fehlendes Manifest ist in der Rückgabe von einem Lesefehler unterscheidbar.
- Ein Fehlschlag der Phase-Event-Abfrage ist in der Rückgabe erkennbar; das Laufzeitverhalten
  bleibt unverändert.
- Kein bestehendes Rückgabefeld wurde umbenannt oder entfernt; `pipeline.js:321` funktioniert ohne
  Anpassung weiter.
- `scripts/factory/pipeline-runner.js` liegt unter 600 Zeilen, oder die Logik wurde ausgelagert.
