# Proposal: brand-trennung

## Symptom / Lücke
Eigner-Entscheidung 2026-11-01: Markentrennung — unser Repo wird
korczewski-only (derzeit frozen/suspend seit T002479), mentolder bekommt
eigenes Repo + behält DNS. Anlass-Fund: `react.mentolder.de` live-200 ohne
Manifest (#7051, superseded — fällt unter p5/p6).

## Angenommen → verworfen
- Redirect mentolder→korczewski statt Abriss: verworfen — Eigner will
  Alles-raus („nutzt nichts mehr von uns"), kein Redirect-Betrieb.
- Suspend wie korczewski war: verworfen — Dateien blieben liegen.
- Grenze-zuerst (sofort entkoppeln): verworfen — Downtime-Risiko;
  Aufbau-zuerst per depends_on-Kette (p4 vor p5/p6) erzwungen.

## Lösung
p1 Inventar (Beleg-Basis für alle Löschungen) → p2 Flux-Unfreeze (dry-run) →
p3 Envs/Secrets + DNS (Eigner-STOPP vor cutover) → p4 Website-live + CI-Refs →
p5/p6 Abriss Infra/Code (Prune-STOPP, Daten-Grenze) → p7 Registry-Umschreibung
+ Guards grün. K6-Rest für mentolder entfällt (Wegwerfarbeit, Goal vermerkt).
