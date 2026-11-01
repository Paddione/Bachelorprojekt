# p1 — axe für SDLC-Sweep (`fa-66-sdlc-frontend-sweep.spec.ts`)

## Ziel
Jede Route in `ROUTES` bekommt nach den bestehenden Render-Checks eine
axe-Prüfung (Vorbild `a11y-axe.spec.ts:55-60`): `new AxeBuilder({ page })
.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()`, Filter auf
`critical`/`serious`, `expect(blocking.length).toBe(0)` mit Befund-Ausgabe
(Route + IDs + Targets, wie `describeViolations` dort).

## Randbedingungen (aus der Datei, nicht ändern)
- Nur gegen Dev-Server (`SDLC_E2E_URL` + `SDLC_E2E_SESSION`), Skip ohne —
  kein CI-/Live-Pfad.
- Desktop-Viewport genügt (Mobil-Sweep existiert für Render; axe einmalig
  Desktop — Aufwand begrenzen).
- Backend-500/503-Annotations-Logik unangetastet lassen.
- `reducedMotion: emulate` wie im Vorbild (verhindert Contrast-Flakes).
- Befunde über Triviales hinaus → B3: kein Fix hier, sondern Route + IDs +
  Screenshot-Pfad in `phase-events.log` für den PR-Body.

## Gates
- Mit Env (`SDLC_E2E_URL` + Session, Dev-Server läuft): Spec grün oder
  Befund sauber dokumentiert.
- Ohne Env: Skip wie bisher (kein harter Fail).
