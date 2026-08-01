---
ticket_id: null
plan_ref: null
status: active
date: 2026-08-01
---

# Design: portrait-derivate-crop

## Root-Cause (belegt)

| Ebene | Befund | Beleg |
|---|---|---|
| Ausgelieferte Datei | `gerald.avif`/`gerald.webp` = Ausschnitt `y=340…1705` des Originals | Pixel-Match über alle Offsets, RMS ≈ 11 bei y=340 |
| Original | Kopf vollständig, Scheitel bei y ≈ 65 | `gerald.jpg` 1365×2048 |
| Rendering (CSS) | croppt **horizontal**, nicht vertikal | `.portrait` 4:5 + quadratische Quelle + `object-fit: cover` |
| Prozess | keine Pipeline, handgemachter Crop | `git log` auf `website/public/gerald.*` |
| Spec | Requirement prüft Attribute, nicht Bildinhalt | `website-core.md:503` |

Die Ursache liegt **allein** in der Datei. Das CSS verschlimmert nichts am Kopf — es schneidet
seitlich. Beides wird gemeinsam behoben, weil dieselbe Maßnahme (deckungsgleiches
Seitenverhältnis) beide Schnitte eliminiert.

## Fix-Ansatz

Ausschnitt `1365×1706` ab `y=0` aus dem Original → `600×750` und `400×500`.

```
Original 1365×2048          Derivat 4:5 (600×750)
┌──────────────┐ y=0        ┌──────────┐
│  ░ Luft ░    │            │ ░ Luft ░ │  ← Kopf vollständig
│   ( Kopf )   │    ──►     │ ( Kopf ) │
│   [ Brille ] │            │ [Brille] │
│  ▓ Schulter ▓│            │▓Schulter▓│
├──────────────┤ y=1706     └──────────┘
│  (verworfen) │            Rahmen 4:5 → cover croppt in KEINER Achse
└──────────────┘ y=2048
```

Warum `y=0` und nicht mittig: `y=0` ist der einzige Anker, bei dem der Verlust von Kopfraum
konstruktiv unmöglich ist. Jeder Offset > 0 ist wieder eine Ermessensentscheidung ohne
Prüfkriterium — genau das war der Bug.

## Entscheidungen (Brainstorming)

| Frage | Entscheidung | Begründung |
|---|---|---|
| Ausschnitt | Variante A, `y=0` | Luft über dem Kopf; Variante B (`y=171`) setzt den Scheitel an den Rand — funktional korrekt, kompositorisch schlechter |
| Derivate quadratisch lassen? | Nein, 4:5 | Quadratisch würde den seitlichen 12,5%-Beschnitt beibehalten |
| Erzeugung | Generator-Skript committen | Die Ursache war „handgemacht, undokumentiert". Ohne Skript ist der nächste Crop wieder unbelegt |
| `object-position: center 18%` | auf `center` reduzieren | Der Y-Anteil ist bei deckungsgleichem Verhältnis nachweislich wirkungslos; stehenlassen suggeriert einen Schutz, den es nicht gibt |
| Original anfassen? | Nein | `gerald.jpg` ist die Quelle und korrekt |

## Betroffene Subsysteme

- `website/public/gerald.{avif,webp}`, `gerald-400.{avif,webp}` — Derivate
- `website/src/components/Portrait.svelte` — `width`/`height`, `object-position`
- `website/src/components/Portrait.test.ts` — Vitest auf das gerenderte `<img>`
- `scripts/build-portrait-derivatives.sh` — neu
- `tests/spec/website-core/portrait-derivate-crop.bats` — neu, RED-Test

## Edge-Cases

- **`avatarType: 'initials'`** — der Zweig ohne Bild bleibt unberührt; der Rahmen behält 4:5.
- **`srcset`-Kandidaten** — `600w`/`400w` beschreiben die Breite, nicht die Höhe; die
  `sizes`-Angabe bleibt gültig, weil sich nur die Höhe der Kandidaten ändert.
- **LCP/Lighthouse** — das 4:5-Derivat ist flächenmäßig 25 % größer als das quadratische.
  Der Verify-Schritt prüft, dass das Performance-Budget-Requirement nicht reißt.
- **Fallback `<img src>`** zeigt auf `.webp` (nicht `.avif`) — beide müssen dieselben
  Dimensionen bekommen, sonst greift der Dimensions-Check ins Leere.
- **Werkzeug-Verfügbarkeit** — der Generator braucht einen AVIF-fähigen Encoder. Ist keiner
  vorhanden, muss er mit klarer Meldung abbrechen, statt still WebP-only zu erzeugen.

## Nicht in diesem Change

Andere Bildassets, das Original, der Duotone-/Halo-Look, Bildoptimierung anderer Seiten.
