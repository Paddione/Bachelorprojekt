# Proposal: portrait-derivate-crop

## Why

Auf `web.mentolder.de` ist im Hero-Portrait der Oberkopf abgeschnitten. Die Trennung von
beobachtetem Symptom und verifizierter Ursache (Bug-Triage-Konvention):

**Symptom (Fakt, reproduzierbar).** Der Portrait-Block auf der Homepage zeigt den Kopf
angeschnitten. Auch der Direktaufruf von `https://web.mentolder.de/gerald.avif` — also ohne jedes
CSS — liefert ein bereits beschnittenes Bild. Der Defekt steckt damit in der ausgelieferten
Datei, nicht erst im Rendering.

**Ursache (verifiziert, nicht angenommen).** Pixelweiser Match der Derivate gegen das Original
`website/public/gerald.jpg` (1365×2048) über alle möglichen quadratischen Ausschnitte ergab:

```
bester Top-Offset fuer 1365-Quadrat: y=340, RMS-Fehler ~11  (identisch bis auf Kompression)
```

`gerald.avif`, `gerald.webp` (je 600×600) und `gerald-400.*` (400×400) sind exakt der Ausschnitt
`y = 340 … 1705` des Originals. Beim Erzeugen des quadratischen Derivats wurden die obersten
340 px — 16,6 % der Bildhöhe — entfernt; darin liegt der Oberkopf. Das Original zeigt den Kopf
vollständig, der Scheitel liegt bei y ≈ 65.

**Warum es entstehen konnte.** Die Derivate sind handgeneriert und committet (`c0b836cda`, AVIF
nachgezogen in PR #3032). Es gibt keine Pipeline, die sie aus dem JPG ableitet, und keinen
dokumentierten Ausschnitt — der Crop war eine einmalige, unreproduzierbare Handlung.

**Warum die Spec es nicht abgefangen hat.** Das bestehende Requirement *Optimized Hero LCP Image*
verlangt `loading="eager"`, `fetchpriority="high"` und explizite `width`/`height`. Alle drei waren
erfüllt. Über den **Bildinhalt** sagt es nichts — die Spec war grün, das Bild falsch.

**Nebenbefund (kein Ursachenanteil, aber Teil des Fixes).** `Portrait.svelte:135` setzt
`object-position: center 18%`. Der Rahmen `.portrait` hat `aspect-ratio: 4/5` (höher als breit),
die Quelle ist 1:1. Bei `object-fit: cover` skaliert der Browser auf die **Höhe**; vertikal passt
es exakt, der Überhang entsteht **horizontal** (je 12,5 % links und rechts weg). Der Y-Anteil von
`object-position` ist damit wirkungslos — er war offenbar als Kopf-Schutz gedacht und konnte
diese Rolle nie erfüllen.

## What

1. **Derivate im Container-Seitenverhältnis 4:5 statt quadratisch.** Ausschnitt `1365×1706` ab
   `y = 0` (oberster möglicher 4:5-Ausschnitt), skaliert auf `600×750` bzw. `400×500`. Damit ist
   der Kopf vollständig mit Luft nach oben im Bild, und der Browser croppt gar nicht mehr —
   weder oben noch seitlich, weil Quelle und Rahmen dasselbe Verhältnis haben.
2. **Generator-Skript** `scripts/build-portrait-derivatives.sh`, das alle vier Derivate
   reproduzierbar aus `gerald.jpg` erzeugt. Der Ausschnitt wird damit von einer unbelegten
   Handlung zu einer versionierten, wiederholbaren Ableitung.
3. **`Portrait.svelte` angleichen**: `width`/`height` am `<img>` auf `600`/`750`, damit die
   reservierte Layout-Fläche dem echten Bild entspricht (sonst Layout-Shift trotz gesetzter
   Attribute). `object-position` auf `center` reduzieren, da der Y-Anteil bei deckungsgleichem
   Seitenverhältnis nachweislich keine Wirkung hat.
4. **Spec-Lücke schließen**: Requirement erweitern, sodass das ausgelieferte Derivat den
   vollständigen Kopf enthalten **muss** und sein Seitenverhältnis dem Rahmen entspricht.

Nicht Teil dieses Changes: andere Bildassets, das Original `gerald.jpg`, der Duotone-/Halo-Look.

_Ticket: T002507_
