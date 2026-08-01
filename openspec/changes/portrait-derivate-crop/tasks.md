---
title: "portrait-derivate-crop — Implementation Plan"
ticket_id: T002507
domains: [website]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# portrait-derivate-crop — Implementation Plan

_Ticket: T002507_

Die ausgelieferten Portrait-Derivate sind der Ausschnitt `y = 340 … 1705` des Originals
`gerald.jpg` (1365×2048) — die obersten 340 px mit dem Oberkopf fehlen. Nachgewiesen durch
pixelweisen Match über alle Kandidaten-Offsets (bester Offset y=340, RMS ≈ 11). Herleitung,
Nebenbefund zum wirkungslosen `object-position` und die Spec-Lücke stehen in `proposal.md`;
die Entscheidungen des Brainstormings in `design.md`.

## File Structure

```
scripts/build-portrait-derivatives.sh                         (neu — reproduzierbarer Generator)
website/public/gerald.avif                                    (ersetzt — 600x750)
website/public/gerald.webp                                    (ersetzt — 600x750)
website/public/gerald-400.avif                                (ersetzt — 400x500)
website/public/gerald-400.webp                                (ersetzt — 400x500)
website/src/components/Portrait.svelte                        (geändert — width/height, object-position)
website/src/components/Portrait.test.ts                       (geändert — Dimensions-Assertion)
Taskfile.yml                                                  (geändert — S4: Generator erreichbar)
tests/spec/website-core/portrait-derivate-crop.bats           (bereits im Stage-Commit — 6 Tests)
tests/spec/website-core/imgsize.py                            (bereits im Stage-Commit — Reader)
openspec/changes/portrait-derivate-crop/specs/website-core.md (neu — Delta-Spec)
```

**S1-Budgets** (wirksame Schwelle = statisches Limit, keine dieser Dateien ist gebaselined):

| Datei | Ist | Wirksame Schwelle | Budget |
|---|---|---|---|
| `website/src/components/Portrait.svelte` | 277 | 500 (`.svelte`) | 223 — Änderung ist rund 3 Zeilen |
| `website/src/components/Portrait.test.ts` | 47 | 600 (`.ts`) | 553 |
| `scripts/build-portrait-derivatives.sh` | neu | 500 (`.sh`) | mit Reserve unter 150 Zeilen schneiden |
| `tests/spec/website-core/imgsize.py` | 98 | 600 (`.py`) | 502 |

**CQ02:** Dieser Change fügt keine `any`-Typen hinzu — `Portrait.test.ts` prüft gerendertes
Markup, keine untypisierten Interop-Grenzen.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Die sechs Tests liegen im Stage-Commit dieses Branches
      (`tests/spec/website-core/portrait-derivate-crop.bats`). Drei sind rot und beschreiben
      den Bug; drei sind bereits grün und sind die Positiv-Anker, ohne die die roten Aussagen
      vakuos wären: das Original muss lesbar und hochkant sein, der Rahmen muss 4:5
      deklarieren, und die `width`/`height`-Attribute müssen zur ausgelieferten Datei passen.
      Letzteres ist heute mit 600x600 erfüllt und muss nach dem Fix mit 600x750 erneut
      erfüllt sein — ein Fix, der nur die Bilder tauscht und die Attribute vergisst, macht
      diesen Anker rot.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/website-core/portrait-derivate-crop.bats
# expected: FAIL (rot — Tests 2, 5, 6: Seitenverhaeltnis 1:1 statt 4:5,
#                 Crop-Offset y=340 statt 0, Generator existiert nicht)
```

- [ ] **Fix-Step A (GREEN) — Generator anlegen.** `scripts/build-portrait-derivatives.sh`,
      Aufruf `bash scripts/build-portrait-derivatives.sh [--source <jpg>] [--out <dir>]`.
      Defaults: `--source website/public/gerald.jpg`, `--out website/public`.

      Ablauf:
      1. Encoder-Preflight: `python3 -c 'from PIL import features; assert features.check("avif")'`.
         Schlägt das fehl, mit Fehlermeldung und rc ungleich 0 abbrechen — nicht still auf
         WebP-only zurückfallen. Ein Generator, der die Hälfte der Ausgabe unterschlägt und
         trotzdem Erfolg meldet, erzeugt genau die unbemerkte Drift, die dieses Ticket behebt.
      2. Zielausschnitt aus der Originalbreite ableiten statt hartkodieren:
         `crop_h = round(orig_w * 5 / 4)`, Ausschnitt `(0, 0, orig_w, crop_h)`. Der Anker
         `y = 0` ist der Kern des Fixes und gehört als Kommentar mit Ticket-Verweis in den Code.
      3. Vier Ausgaben schreiben: `gerald.avif` und `gerald.webp` auf 600x750,
         `gerald-400.avif` und `gerald-400.webp` auf 400x500, Resampling `LANCZOS`.
      4. Reicht `crop_h` über die Originalhöhe hinaus, abbrechen — dann ist das Original nicht
         hoch genug für 4:5, und ein stiller Fallback wäre wieder ein unbelegter Ausschnitt.
      5. Erzeugte Dateien mit Dimension auf stdout listen.

- [ ] **Fix-Step B (GREEN) — Derivate neu erzeugen.** Generator ausführen und die vier
      Dateien unter `website/public/` ersetzen. Danach die Dimensionen gegenprüfen:

```bash
bash scripts/build-portrait-derivatives.sh
for f in gerald.avif gerald.webp gerald-400.avif gerald-400.webp; do
  echo -n "$f: "; python3 tests/spec/website-core/imgsize.py "website/public/$f"
done
# erwartet: 600 750 / 600 750 / 400 500 / 400 500
```

- [ ] **Fix-Step C (GREEN) — `Portrait.svelte` angleichen.** Am `<img>` in
      `website/src/components/Portrait.svelte` `width="600" height="600"` auf
      `width="600" height="750"` ändern. In `.portrait img` `object-position: center 18%`
      auf `object-position: center` reduzieren.

      Der Y-Anteil war nachweislich wirkungslos: bei 4:5-Rahmen und quadratischer Quelle
      skaliert `cover` auf die Höhe, der Überhang entsteht horizontal. Nach dem Fix stimmen
      Quell- und Rahmenverhältnis überein, es gibt in keiner Achse Überhang zu verteilen. Den
      Wert stehenzulassen würde einen Kopf-Schutz suggerieren, den die Deklaration nicht
      leisten kann — genau die Fehlannahme, die den Bug so lange unentdeckt ließ.

      `srcset` und `sizes` bleiben unverändert: die Deskriptoren `600w`/`400w` beschreiben die
      Breite, und die ändert sich nicht.

- [ ] **Fix-Step D (GREEN) — `Portrait.test.ts` erweitern.** Der bestehende Vitest prüft nur
      das `src`-Attribut. Eine Assertion auf `width`/`height` des gerenderten `<img>`
      ergänzen, damit die Dimensions-Kongruenz auch auf Komponenten-Ebene abgesichert ist und
      nicht nur im BATS-Test gegen die Dateien.

- [ ] **Fix-Step E (GREEN) — S4: Generator erreichbar machen.** Ein neues `scripts/*.sh` muss
      von Taskfile, CI, Doku oder einem anderen Skript aus erreichbar sein, sonst
      Orphan-Violation. Task `website:portrait-derivatives` in `Taskfile.yml` ergänzen, der
      den Generator aufruft, mit einer `desc`, die den `y=0`-Anker benennt.

- [ ] **Verifikation (Abschluss).** Alle Gates grün:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/website-core/portrait-derivate-crop.bats
# erwartet: 6/6 PASS

cd website && npx vitest run src/components/Portrait.test.ts; cd ..

task test:changed
task freshness:regenerate
task freshness:check
```

      Zusätzlich prüfen, dass das Performance-Budget-Requirement nicht reißt: das 4:5-Derivat
      hat 25 Prozent mehr Fläche als das quadratische. Dateigrößen der neuen Derivate gegen
      die alten notieren (`ls -l website/public/gerald*`) und im PR-Text festhalten, damit ein
      späterer LCP-Regress zuordenbar bleibt.

      `task test:inventory` regenerieren und das Ergebnis mitcommitten — CI vergleicht
      `website/src/data/test-inventory.json` gegen die committete Fassung und failt bei Drift.
