# p2 — Anbindung an den Sweep

Ziel: der Sweep ruft den Client an genau einer Stelle auf und schreibt die Urteile in eine
eigene Datei. Betroffen: `tests/e2e/specs/visual-sweep.spec.ts`,
`tests/e2e/lib/visual-sweep-helpers.ts`.

## Aufgaben

- [ ] **Typ und Pfad in den Helfern ergänzen** (`visual-sweep-helpers.ts`): ein Typ
      `VisionRow` mit Route, Brand, Viewport, Zustand (`judged` / `skipped` / `unusable`),
      Urteil und Befunden — plus eine Funktion, die den Ablagepfad
      `tests/results/visual-sweep/<brand>/vision-<viewport>.json` bildet, spiegelbildlich zur
      bestehenden Bildung von `results-<viewport>.json`.

- [ ] **Aufrufpunkt setzen** (`visual-sweep.spec.ts`): unmittelbar nachdem der Screenshot
      geschrieben wurde, das Urteil einholen und an eine lokale Liste hängen. Der Aufruf steht
      hinter dem Ein-/Aus-Schalter; ist die Stufe aus, wird nichts gesendet und nichts
      geschrieben.

- [ ] **Screenshot als JPEG aufnehmen, wenn die Stufe an ist.** `type: 'jpeg', quality: 80`
      statt PNG. Das gilt nur für die Kopie, die an das Modell geht — die abgelegte
      Bilddatei des Sweeps bleibt unverändert, sonst ändert sich das, was der Kontaktbogen zeigt.

- [ ] **`VISION_MAX_ROUTES` beachten.** Ist die Variable gesetzt, werden nur die ersten N Routen
      je Project beurteilt. Der Sweep selbst fährt weiterhin alle Routen ab. Das trennt den
      Messlauf vom Vollbetrieb, ohne zwei Codepfade zu bauen.

- [ ] **Ergebnisdatei schreiben**, wenn der Sweep durchgelaufen ist — getrennt von
      `results-<viewport>.json`. Die bestehende Datei bleibt Feld für Feld unverändert; sie wird
      von `build-gallery.mjs` und von vorhandenen Auswertungen gelesen.

- [ ] **Den Read-only-Guard gegenprüfen.** `installReadOnlyGuard` bricht Nicht-GET/HEAD-Anfragen
      des **Browser-Kontexts** ab. Der Vision-Aufruf läuft über Node-`fetch` im Testprozess und
      sollte davon unberührt sein. Das ist zu belegen, nicht anzunehmen: einen Probelauf über
      wenige Routen fahren und prüfen, dass Urteile ankommen. Wird der Aufruf doch abgebrochen,
      ist die Ursache der Guard und nicht der Server — die beiden Fehlerbilder sehen gleich aus.

- [ ] **Kein Einfluss auf das Ergebnis des Laufs.** Der Sweep darf durch ein negatives oder
      fehlendes Urteil weder fehlschlagen noch früher enden (REQ-vs-02).

## Zeilenlage

`visual-sweep.spec.ts` steht bei 342 von 900 zulässigen Zeilen, `visual-sweep-helpers.ts` bei
170. Der Zuwachs bleibt zweistellig; ein Split ist nicht nötig.
