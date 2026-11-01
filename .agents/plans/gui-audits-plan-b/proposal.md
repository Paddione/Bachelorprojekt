# Proposal: gui-audits-plan-b

## Symptom / Lücke
K6 Staffel B: `react.mentolder.de` (mentolder-web, React-SPA, 12 Routen) ohne
GUI-Beleg. Volle Suite per Eigner-Entscheidung verworfen (D1-sekundär).

## Struktur-Fund (ändert die Prämisse, nicht den Scope)
Live-Messung 2026-11-01: Host antwortet 200 + Voll-SPA statt Redirect, kein
Manifest, kein Registry-Eintrag → Issue #7051 (Infra-Folge-Entscheidung).
Plan B auditiert den Ist-Zustand reduziert (D4) und blockiert nicht auf #7051.

## Lösung
p1: eine Spec (5 Kernrouten × Smoke + axe, live, öffentlich) + ggf. 1
Nightly-Match-Zeile. p2: D4 + Beleg-Tabellen in evidence-b (+ 1 Absatz
Rückverweis in evidence-a) + Golden/Inventory-Hygiene. Befunde → Folge-PR/B3.
