# Proposal: gui-audits-plan-a

## Symptom / Lücke
Goal `frontend-domain-ssot`, Kriterium 6 (Staffel A): website hat eine Suite
(Playwright + axe + Lighthouse), aber keinen zusammengeführten Beleglauf;
sdlc-console (fa-66, dev-only) und brett (fa-24, minimal) haben KEINE
axe-Assertions; docs hat gar keine Suite. Mentolder-web folgt reduziert in
Staffel B (D1-sekundär, eigene Entscheidung).

## Angenommen → verworfen
- Alles in einem Plan: verworfen (B1) — mentolder-web braucht eine neue Suite
  (größer, eigener Plan B); A bleibt beleg- + nachrüstbar.
- Website-Fixes im selben Plan: verworfen (B3) — Befund → Folge-PR, nur
  Triviales direkt; sonst Scope-Creep wie in agent-board-Monaten.
- Nightly-CI als einziger Beleg: verworfen (B2) — Nightly deckt sdlc/brett/docs
  nicht ab (dev-only/lokal); Belege sind gezielte Läufe + Evidenz-Doc.

## Lösung
p1/p2 rüsten axe in fa-66/fa-24 nach (bestehende Skip-Pattern wiederverwenden),
p3 baut docs-smoke (Render + Link-Deckel) + 1 Match-Zeile, p4 fährt
Website-Belege (live, öffentlich) und schreibt `gui-audit-evidence-a.md`.
