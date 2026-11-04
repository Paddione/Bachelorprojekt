# p5 — Whiteboard T-axe ausnehmen (Upstream, D5)

## Ziel
In `tests/e2e/specs/fa-24-whiteboard.spec.ts` (ist 73, nicht-baselined) T-axe (`:55-72`) als Upstream-UI
kennzeichnen und vom Nightly-Gate ausnehmen: `test.skip` mit Kommentar (Upstream: Nextcloud-Whiteboard
Collaboration-Server, im Repo nur `apps/whiteboard/app.yaml`; axe-Criticals dort sind nicht patchbar).
Alternative im Partial vermerkt (falls Ops widerspricht): Board-Image in `apps/whiteboard/app.yaml` pinnen/upgraden
statt Skip — Default ist Skip, kein Image-Change ohne Ops-Entscheidung.

## Methode
1. RED-Beleg: Nightly-Eintrag T-axe rot (Run 41815883961 — kein lokaler Lauf nötig).
2. `test.skip` + Begründung am T-axe (exakt ein Test, Rest des Files unangetastet).
3. `npx playwright test fa-24-whiteboard` → T-axe skipped, Rest grün.

## Gates
- Nur T-axe geändert; kein anderer Test im File angefasst.
- Skip-Kommentar nennt Upstream-Grund + Alternative (Image-Pin).
- <!-- vitest: kein neuer Test nötig, weil Test-Dispositon ohne Produkt-Code-Change -->
