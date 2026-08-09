## Partial p2 — Pipeline

Macht `scripts/brain-ingest.sh` chunk-fähig und ergänzt das Coverage-Gate als
eigenes Skript. Deckt REQ-k4-06 (Eltern-MOC einbinden) und REQ-k4-07
(Coverage-Gate) ab. `scripts/brain-chunk.sh` und
`scripts/brain-ingest-transform.sh` gehören p1 und werden hier nur aufgerufen.

### Zuständige Dateien und S1-Budgets

| Datei | Ist | Budget |
|---|---|---|
| `scripts/brain-ingest.sh` | 540 | 260 |
| `scripts/brain-ingest-coverage.sh` | 0 | 800 |

Wirksame Schwelle ist in beiden Fällen das Extension-Limit `.sh` (800); keine
der beiden Dateien steht in `docs/code-quality/baseline.json`. 640 Zeilen wären
bereits 80 % der Schwelle für `brain-ingest.sh` — deshalb liegt die
Coverage-Logik in einem eigenen Skript, und Aufgabe 12 erzwingt bei
Überschreiten eine echte Extraktion der Phase-2b-Sektion.

### Verlassene p1-Schnittstelle

```
bash scripts/brain-chunk.sh --source <pfad> --slug <quell-slug> --out-dir <dir>
# stdout, TAB-getrennt: <chunk-file>\t<chunk-slug>\t<index>\t<heading>
```

Die Eltern-MOC-Datei wird von `brain-chunk.sh` mit in `--out-dir` geschrieben
und erscheint im Manifest als die Zeile, deren Chunk-Slug exakt dem Quell-Slug
entspricht (Chunk-Slugs tragen laut D2 den Suffix `-<index>`). Ist stattdessen
`0` als Index gesetzt, wird auch diese Zeile als MOC erkannt — beide Formen
werden akzeptiert, damit p2 keine zusätzliche Spalte verlangt.

---

### Aufgabe 1 — Chunk-Vorpass in Phase 1

`scripts/brain-ingest.sh`

- [ ] Nach dem Pilot-Zuschnitt (`:89-94`) und **vor** der Slug-Inventur eine
  Schleife über die Worklist einziehen, die je Zeile
  `bash "$CHUNK_SCRIPT" --source "$REPO_ROOT/$src_path" --slug "$slug" --out-dir "$CHUNK_DIR/$slug"`
  aufruft und dessen stdout um die Quellspalte erweitert nach `$CHUNKS_TSV`
  schreibt: `<src_path>\t<chunk-file>\t<chunk-slug>\t<index>\t<heading>`.
- [ ] `CHUNK_SCRIPT="$HERE/brain-chunk.sh"` neben `TRANSFORM_SCRIPT` (`:30`)
  definieren und analog zu `:70` mit `[ -f … ]` vorprüfen, damit ein fehlender
  Chunker sofort und benannt scheitert statt in Phase 2.
- [ ] `CHUNK_DIR="$(mktemp -d)"`, `CHUNKS_TSV="$(mktemp)"` anlegen; ein
  Chunker-Aufruf mit Exit ≠ 0 bricht Phase 1 ab (kein Weiterlaufen mit
  unvollständigem Manifest — sonst wäre das Slug-Inventar lückenhaft).
- [ ] `CHUNK_TOTAL="$(wc -l < "$CHUNKS_TSV")"` ermitteln und zusammen mit
  `$TOTAL` ausgeben (`Worklist: N Quellen → M Chunks`), damit der Log den
  Faktor sichtbar macht.

### Aufgabe 2 — Slug-Inventar aus dem Chunk-Manifest

`scripts/brain-ingest.sh`

- [ ] `:96-99` von der Worklist auf `$CHUNKS_TSV` umstellen: `awk -F'\t'
  '{print $3}' "$CHUNKS_TSV"` liefert Chunk-Slugs **und** die Eltern-MOC-Slugs
  in einem Durchgang, weil die MOC-Zeile im selben Manifest steht.
- [ ] Ergebnis wie bisher über `jq -R . | jq -s .` nach `$SLUGS_JSON`
  schreiben und die bestehende Zeile `Slug inventory: …` beibehalten.
- [ ] Prüfen, dass `$SLUGS_JSON` vor dem ersten `process_page`-Aufruf
  vollständig ist — es wird an `brain-ingest-transform.sh` (`:174`) als
  Wikilink-Grundlage durchgereicht, und ein nachträglich wachsendes Inventar
  ließe frühe Seiten auf noch nicht existierende Slugs verlinken.

### Aufgabe 3 — `process_page()` auf Chunk-Ebene

`scripts/brain-ingest.sh`

- [ ] Signatur auf `process_page <src_path> <chunk_file> <chunk_slug> <index>`
  erweitern (`:146-147`); `src_file` ist ab jetzt `$chunk_file`, `src_path`
  bleibt der Repo-relative Quellpfad und dient weiterhin als Grundlage für
  `determine_group` (`:157`) und die Typ-/Tag-Auflösung (`:159-172`).
- [ ] Hash-Vergleich (`:153-155`) auf den Chunk beziehen:
  `sha256sum "$chunk_file"`, State-Schlüssel `"$src_path#$index"`. Ein
  unveränderter Chunk liefert weiterhin Rückgabewert 2 (skip).
- [ ] Transform-Aufruf (`:174`) mit `$chunk_file` und `$chunk_slug` ausführen;
  Frontmatter-Prüfung (`:179-182`) unverändert lassen.
- [ ] Den Transform-Aufruf mit `BRAIN_SOURCE_PATH="$src_path"` in der Umgebung
  ausführen. `brain-ingest-transform.sh:69` leitet den Quellpfad sonst aus dem
  übergebenen Dateipfad ab und trüge bei einem Chunk im Temp-Verzeichnis einen
  Pfad ein, den `brain-ingest-prune.sh:56` weder im Repo noch in der Worklist
  findet — jede Chunk-Seite wäre damit sofort Prune-Kandidat. Den Override
  stellt p1 bereit; er wirkt bereits im Prompt, deshalb ist hier **kein**
  nachträgliches `sed` auf der erzeugten Seite nötig.
- [ ] State-Schreibblock (`:186-192`) auf den Chunk-Schlüssel umstellen und um
  `chunk_index` sowie `chars` (Zeichenzahl des Chunks) ergänzen; `slug` bleibt
  der Chunk-Slug, damit die Prune-Rückauflösung über `.value.slug`
  (`brain-ingest-prune.sh:60`) weiter greift.

### Aufgabe 4 — Verwaiste Chunk-Zustände aufräumen

`scripts/brain-ingest.sh`

- [ ] Direkt nach dem Chunk-Vorpass alle State-Schlüssel ermitteln, deren
  Präfix vor `#` einer gechunkten Quelle entspricht, die aber im aktuellen
  `$CHUNKS_TSV` nicht mehr vorkommen (Quelle ist geschrumpft: 5 Chunks → 3).
- [ ] Für jeden solchen Eintrag die zugehörige `wiki/<slug>.md` löschen und den
  State-Eintrag per `jq 'del(.[$k])'` unter demselben `flock`-Muster wie
  `:186-192` entfernen; jede Löschung mit `STALE-CHUNK: <slug>` protokollieren.
- [ ] Begründung im Kommentar festhalten: `brain-ingest-prune.sh` erkennt diese
  Seiten nicht — sie tragen ein gültiges `source::` auf eine noch existierende
  Quelle und gelten damit an `:54-58` als lebend.

### Aufgabe 5 — Dispatch-Schleife über Chunks

`scripts/brain-ingest.sh`

- [ ] `while IFS=$'\t' read -r …` (`:205`) auf `$CHUNKS_TSV` und dessen fünf
  Spalten umstellen; die MOC-Zeile (Chunk-Slug gleich Quell-Slug bzw. Index 0)
  wird übersprungen, da sie ohne LLM erzeugt wird.
- [ ] Fortschrittsausgabe (`:223`) auf `$CHUNK_TOTAL` beziehen und den
  Chunk-Slug statt des Quellpfads anzeigen.
- [ ] Ergebniszeile je Job (`:221`) von reinem Exit-Code auf
  `printf '%s\t%s\t%s\n' "$rc" "$src_path" "$chunk_chars"` erweitern —
  `chunk_chars` ist `wc -c < "$chunk_file"`. Nur so kommt die für das
  Coverage-Gate nötige Zeichenzahl aus der Subshell heraus; der Kommentar bei
  `:196-201` erklärt bereits, warum Zähler nicht direkt mutiert werden können.
- [ ] Auswertungsschleife (`:228-235`) auf die neue Zeilenform anpassen und
  parallel `$DELIVERED_TSV` schreiben: eine Zeile
  `<src_path>\t<chars_or_0>\t<rc>` je versuchtem Chunk. Für `rc=0` und `rc=2`
  zählt `chunk_chars`, sonst 0.

### Aufgabe 6 — Fehlerschwelle auf Chunk-Zählung anpassen

`scripts/brain-ingest.sh`

- [ ] Die Meldungen um `:239` und `:267-287` sprachlich von „Quellen" auf
  „Chunks" umstellen; die Schwellenlogik (`INGEST_MAX_FAIL_ABS`,
  `INGEST_MAX_FAIL_PCT`, `INGEST_MIN_SAMPLE`, `:262-274`) bleibt unverändert.
- [ ] Im Kommentarblock `:241-261` ergänzen, dass sich die absolute Schwelle
  jetzt auf Chunks bezieht und bei ~300 statt 144 Einheiten entsprechend
  früher greift — der Wert bleibt bewusst stehen, weil ein systematischer
  Endpunktausfall weiterhin sofort kippen soll.

### Aufgabe 7 — Eltern-MOC in Phase 2b einbinden

`scripts/brain-ingest.sh`

- [ ] Am Anfang von Phase 2b (`:290-296`) über die MOC-Zeilen aus
  `$CHUNKS_TSV` laufen und jede MOC-Datei nach `$BRAIN_REPO/wiki/<slug>.md`
  kopieren — ohne LLM-Aufruf (D4).
- [ ] Beim Kopieren jede Listenzeile der Form `- [[<chunk-slug>]]` verwerfen,
  für die keine `wiki/<chunk-slug>.md` existiert. Ohne diesen Filter erzeugt
  ein einzelner fehlgeschlagener Chunk einen toten Wikilink, den der
  Reparaturpfad in `:444-452` per `sed` aus der MOC herausputzt — die MOC wäre
  dann still unvollständig statt sichtbar reduziert.
- [ ] Je kopierter MOC einen State-Eintrag `"$src_path#moc"` mit `slug`
  = Quell-Slug und `type: moc` schreiben, damit die Gruppen-MOC-Auflistung
  (`:298-303`) und `brain-ingest-prune.sh:60` sie wie jede andere Seite
  behandeln.
- [ ] Anzahl kopierter Eltern-MOCs ausgeben (`Parent MOCs: N`).

### Aufgabe 8 — `brain-ingest-coverage.sh`: Gerüst und Argumente

`scripts/brain-ingest-coverage.sh`

- [ ] Neues Skript mit `#!/usr/bin/env bash`, `set -euo pipefail`, Kopfkommentar
  (Zweck, Usage, Env) im Stil von `scripts/brain-ingest-prune.sh:1-7`.
- [ ] Argumente: `--worklist <tsv>` (Pflicht), `--root <dir>` (Vorgabe:
  Verzeichnis über dem Skript, wie `brain-ingest-prune.sh:10`),
  `--delivered <tsv>` (Pflicht), `--min-pct <n>`. Unbekannte Argumente mit
  Exit 2 abweisen — dasselbe Muster wie `brain-ingest-prune.sh:20-30`.
- [ ] `BRAIN_MIN_COVERAGE_PCT` als Env-Vorgabe mit Wert 95;
  `--min-pct` überschreibt sie.
- [ ] Fehlende Pflichtdateien mit klarer Meldung und Exit 1 abweisen.

### Aufgabe 9 — `brain-ingest-coverage.sh`: Messung und fail-closed Abbruch

`scripts/brain-ingest-coverage.sh`

- [ ] Bezugsmenge bilden: alle Quellpfade, die in `--delivered` mit mindestens
  einer Zeile mit `rc` ungleich 2 vorkommen. Das sind die **versuchten**
  Quellen — dieselbe Abgrenzung wie bei der Fehlerschwelle
  (`brain-ingest.sh:262-265`); rein idempotent übersprungene Quellen zählen
  weder in Zähler noch in Nenner.
- [ ] Nenner: Summe von `wc -c` über die Quelldateien dieser Menge, aufgelöst
  über `$ROOT/<src_path>` anhand Spalte 1 der Worklist.
- [ ] Zähler: Summe der Zeichenspalte aus `--delivered` über alle Zeilen mit
  `rc` 0 oder 2 dieser Quellen. `rc=2` zählt mit, weil der Chunk unverändert
  bereits im Wiki liegt — gemessen wird die Abdeckung des Wikis, nicht das
  Datenvolumen dieses Laufs.
- [ ] Prozentwert ganzzahlig als `zaehler * 100 / nenner` berechnen; ein Nenner
  von 0 (keine versuchte Quelle) ist kein Fehler und gibt
  `Coverage: keine versuchte Quelle — Gate übersprungen` mit Exit 0 aus.
- [ ] Erfolgsausgabe: `Coverage: <pct>% (Schwelle <min>%, <zaehler> von
  <nenner> Zeichen, <k> versuchte Quellen)`.
- [ ] Unterhalb der Schwelle nach stderr dieselbe Zeile plus den Hinweis auf
  `BRAIN_MIN_COVERAGE_PCT` und `scripts/brain-chunk.sh` ausgeben und mit
  Exit 1 abbrechen.

### Aufgabe 10 — Phase 3 ruft das Coverage-Gate

`scripts/brain-ingest.sh`

- [ ] In Phase 3 (`:424-428`) **vor** `cd "$BRAIN_REPO"` und damit vor
  Frontmatter- und Wikilink-Lint aufrufen:
  `bash "$HERE/brain-ingest-coverage.sh" --worklist "$WORKLIST" --root
  "$REPO_ROOT" --delivered "$DELIVERED_TSV"`.
- [ ] Exit ≠ 0 beendet den Lauf mit Exit 1, bevor Phase 4 (`:476-488`) etwas
  ausliefert — die Reihenfolge ist der ganze Zweck des Gates (REQ-k4-07).
- [ ] Erfolgsfall wie die anderen Gates protokollieren
  (`  Coverage gate: PASS`).

### Aufgabe 11 — Temporäres aufräumen und Dry-Run-Ausgabe

`scripts/brain-ingest.sh`

- [ ] Beide `trap`-Zeilen (`:83`, `:203`) um `$CHUNKS_TSV`, `$DELIVERED_TSV`
  und `rm -rf "$CHUNK_DIR"` ergänzen. Die zweite `trap`-Definition überschreibt
  die erste vollständig — beide müssen dieselbe Liste tragen, sonst bleibt bei
  einem Abbruch in Phase 1 ein Chunk-Verzeichnis stehen.
- [ ] Dry-Run-Zusammenfassung (`:479-484`) und Schlussausgabe (`:538-540`) um
  die Chunk-Zahl erweitern: `Chunks: <CHUNK_TOTAL> aus <TOTAL> Quellen`.
- [ ] PR-Text in `:519-531` auf Chunk-Zählung anpassen und das Coverage-Gate in
  die Liste der bestandenen Quality Gates aufnehmen.

### Aufgabe 12 — S1-Prüfung und bedingte Extraktion der Phase-2b-Sektion

`scripts/brain-ingest.sh`

- [ ] Nach Abschluss von Aufgabe 11 messen:
  `wc -l scripts/brain-ingest.sh`.
- [ ] Liegt das Ergebnis über 640 Zeilen (80 % der wirksamen Schwelle 800), die
  Phase-2b-Sektion (`:290-410`: Gruppen-MOCs, Eltern-MOC-Einbindung,
  `index.md`-Regeneration) als Ganzes nach `scripts/brain-ingest-moc.sh`
  **extrahieren** — Parameter `--brain-repo`, `--state`, `--chunks`; die
  Sektion in `brain-ingest.sh` schrumpft auf den einen Aufruf. Kein
  Zusammenziehen von Zeilen: das drückt nur die Metrik und trippt beim
  nächsten Vorgang erneut.
- [ ] Bei Extraktion `scripts/brain-ingest-moc.sh` (Ist 0, Budget 800) mit
  eigenem Kopfkommentar anlegen; die S4-Erreichbarkeit ist über den Aufruf aus
  `brain-ingest.sh` gegeben.
- [ ] Messwert erneut prüfen und im PR-Text festhalten.

### Aufgabe 13 — Trockenlauf gegen ein Pilot-Set

`scripts/brain-ingest.sh`, `scripts/brain-ingest-coverage.sh`

- [ ] `bash scripts/brain-ingest.sh --brain-repo <brain-klon> --pilot 3
  --dry-run --state "$(mktemp)"` ausführen und im Log belegen: Chunk-Zahl > 3,
  vollständiges Slug-Inventar vor Phase 2, `Parent MOCs: 3`,
  `Coverage gate: PASS` mit ausgewiesenem Prozentwert.
- [ ] Coverage-Skript zusätzlich einzeln gegen die im Lauf entstandenen
  Dateien aufrufen und mit `BRAIN_MIN_COVERAGE_PCT=100` gegenprüfen, dass es
  fail-closed mit Exit 1 und benannter Schwelle abbricht.
- [ ] `bash -n scripts/brain-ingest.sh scripts/brain-ingest-coverage.sh` sowie
  `shellcheck` auf beide Dateien laufen lassen.
- [ ] Eine Wiki-Chunk-Seite öffnen und prüfen, dass ihre `source::`-Zeile den
  Repo-relativen Originalpfad nennt (Aufgabe 3) und
  `bash scripts/brain-ingest-prune.sh --brain-repo <brain-klon> --state <state>`
  sie **nicht** als `PRUNE-CANDIDATE` listet.
