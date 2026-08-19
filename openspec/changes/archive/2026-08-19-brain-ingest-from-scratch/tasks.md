---
title: "brain-ingest-from-scratch — Implementation Plan"
ticket_id: T012902
domains: [brain, scripts]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# brain-ingest-from-scratch — Implementation Plan

_Ticket: T012902 (Rebuild-Modus), T012903 (State-Typ-Reparatur, blockiert dieses Change)_

## File Structure

```
scripts/brain-ingest.sh                                  (geaendert)
scripts/brain-ingest-reset.sh                            (neu; testbare Reset-Helfer)
tests/spec/brain-foundation/from-scratch-rebuild.bats    (neu)
tests/spec/brain-foundation/state-file-type-repair.bats  (neu)
openspec/specs/brain-foundation.md                       (geaendert, Delta-Merge beim Archivieren)
```

**S1-Budget.** `scripts/brain-ingest.sh` hat 545 Zeilen, das `.sh`-Limit aus
`docs/code-quality/gates.yaml` liegt bei 800, kein Baseline-Eintrag. Wirksames Budget:
255 Zeilen. Die neue Phase 1b und der Argument-Guard bleiben deutlich darunter, ein
Split ist nicht erforderlich.

## Tasks

- [x] **1. Failing-Test-Step (RED) — State-Typ-Reparatur [T012903].**
      Neue Datei `tests/spec/brain-foundation/state-file-type-repair.bats`. Der Test
      legt eine State-Datei mit dem Inhalt `[]` an, ruft die State-Initialisierung des
      Ingest-Skripts auf und erwartet danach ein leeres JSON-Objekt. Ein zweiter Fall
      belegt die Gegenrichtung: eine befuellte Objekt-State-Datei bleibt unveraendert.
      Geprueft wird das Kommando-Ergebnis (Dateiinhalt nach dem Lauf), nicht der
      Quelltext des Skripts.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/brain-foundation/state-file-type-repair.bats
# expected: FAIL (rot — die Initialisierung prueft bisher nur die Existenz der Datei)
```

- [x] **2. Fix (GREEN) — State-Typ-Reparatur [T012903].**
      In `scripts/brain-ingest.sh` die Initialisierung bei Zeile 155-157 so erweitern,
      dass sie nicht nur auf ein fehlendes File reagiert, sondern auch dann `{}`
      schreibt, wenn der vorhandene Inhalt kein JSON-Objekt ist. Der Test aus Schritt 1
      muss danach gruen sein.

- [x] **3. Failing-Test-Step (RED) — Rebuild-Modus.**
      Neue Datei `tests/spec/brain-foundation/from-scratch-rebuild.bats` mit vier
      Faellen, einer je Szenario aus REQ-BRAIN-FOUNDATION-016: Bachelorprojekt-Seiten
      werden geloescht und der State zurueckgesetzt; `source:: self` und Seiten ohne
      `source::`-Zeile ueberleben; `--from-scratch --pilot 5` endet mit Exit 2 und
      laesst alles unberuehrt; `--from-scratch --dry-run` meldet nur.
      Die Faelle arbeiten gegen ein temporaeres brain-Repo-Verzeichnis, nicht gegen
      `~/brain`. Negativtests bekommen je einen Positiv-Anker, damit ein stumm
      fehlschlagendes Skript den Test nicht gruen erscheinen laesst.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/brain-foundation/from-scratch-rebuild.bats
# expected: FAIL (rot — --from-scratch existiert noch nicht, das Argument-Parsing lehnt es ab)
```

- [x] **4. Argument-Parsing und Guard.**
      In `scripts/brain-ingest.sh` das Flag `--from-scratch` in die `case`-Liste des
      Argument-Parsings aufnehmen (`FROM_SCRATCH=1`). Direkt nach dem Parsing pruefen:
      sind `--from-scratch` und `--pilot` beide gesetzt, mit Exit 2 und einer
      Fehlermeldung abbrechen, die den Grund nennt — die Kombination loescht alles und
      baut nur den Pilot-Ausschnitt neu.

- [x] **5. Phase 1b: Wiki- und State-Reset.**
      Neue Phase zwischen dem Branch-Checkout im brain-Repo (bei Zeile 159-171) und
      Phase 2, im Stil der uebrigen Phasen mit `echo "=== Phase 1b: ..."` und einer
      Zaehler-Zusammenfassung. Nur aktiv bei gesetztem `FROM_SCRATCH`.
      Ablauf: ueber die Dateien in `$BRAIN_REPO/wiki/` iterieren, die `source::`-Zeile
      lesen, und nur bei Bachelorprojekt-Bezug loeschen. Danach die State-Datei auf `{}`
      setzen. Bei `DRY_RUN` beide Schritte nur melden.
      Die Erkennung der `source::`-Zeile folgt derselben Logik wie
      `scripts/brain-ingest-prune.sh`, damit Reset und Prune nicht darueber
      auseinanderlaufen, was als Bachelorprojekt-Seite gilt.

- [x] **6. Dokumentation der Betriebsvariante.**
      In `.claude/skills/brain-ingest/SKILL.md` den Rebuild-Modus als eigenen Schritt
      neben Trockenlauf, Pilot und vollem Lauf aufnehmen, samt des Hinweises, dass
      `--from-scratch` nicht mit `--pilot` kombinierbar ist.

- [x] **7. Final Verification.** Die drei Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
