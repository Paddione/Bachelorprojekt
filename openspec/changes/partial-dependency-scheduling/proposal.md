# Proposal: partial-dependency-scheduling

## Why

T002074 hat Partialpläne mit Gang-Scheduling eingeführt: Ein Ticket mit `slot_count=N` wird nur
gestartet, wenn N freie Slots existieren (`slots.sh claim-gang` ist all-or-nothing, `schedule.sh`
bricht per Head-of-line-Blocking ab). Dabei arbeitet `pipeline.js` die Partials ohnehin
**sequenziell** ab — der Voll-Gang-Claim reserviert Kapazität, die kein Parallelnutzen deckt, und
ein 3-Partial-Ticket bleibt liegen, obwohl ein einzelner freier Agent sofort mit einem
abhängigkeitsfreien Partial beginnen könnte. Zusätzlich cappt `stage-plan.sh --partials` hart auf
1..3 — größere Pläne, die sauber in mehr disjunkte Partials zerfallen, sind nicht abbildbar.

## What

- **Kein Voll-Gang-Zwang:** `schedule.sh`/`slots.sh` claimen `min(bereite Partials, freie Slots)
  ≥ 1` statt all-or-nothing N; Head-of-line-`break` nur noch bei 0 freien Slots. Ein Ticket mit
  N Partials startet, sobald 1 Slot frei ist und mindestens ein Partial ohne offene
  Abhängigkeiten existiert — auch wenn nur ein Agent da ist.
- **`depends_on` im Partial-Manifest:** optionale 5. Spalte der `## Partials`-Tabelle
  (komma-separierte Partial-IDs). `plan-lint.sh` validiert: referenzierte IDs existieren, Graph
  ist azyklisch; 4-Spalten-Manifeste bleiben gültig (keine Abhängigkeiten). `pipeline.js` ordnet
  topologisch, startet nur bereite Partials und überspringt bei Resume bereits erledigte
  (`partial-done`-Phase-Events als Fortschritts-SSOT).
- **Partial-Cap aufheben:** `stage-plan.sh --partials` akzeptiert 1..9 statt 1..3;
  `dev-flow-plan`-Decompose-Guidance wird von „1–3" auf eine Faustregel umgestellt (1 Partial je
  disjunktem Subsystem, Tests separat; >3 nur bei echt disjunkten Dateimengen).

_Ticket: T002082 (Follow-up zu T002074)_
