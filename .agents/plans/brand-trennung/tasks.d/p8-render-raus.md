# p8 — Render-Skript mentolder-frei + Render-Tests grün (Nachtrag 2026-11-01)

## Anlass (Plan-Mutation)
p5 löschte `prod-fleet/mentolder` + `website-mentolder`; `scripts/
flux-render-artifact.sh` rendert beide noch (KNOWN_COMPONENTS +
want-Blöcke) → 16 Render-Tests rot, CI auf diesem PR wäre rot.
Gehoert sachlich zum Epic (kein Drive-by): TURN/SMTP-Werte je Brand
(`.104/pk-hetzner-4` vs `.206/gekko-hetzner-2`) bleiben korczewski-gebunden,
nichts erfinden.

## Rotphase (Baseline zuerst)
Render-Test-Set VOR der Änderung laufen lassen:
`bash scripts/pytest-run.sh tests/py/spec/test_flux_render_and_security.py`
— expected FAIL (mentolder-Out-Dirs fehlen nach p5, Script rendert sie noch).
Danach Streichungen, derselbe Befehl → grün. Beleg in phase-events.log.

## Ziel
1. `scripts/flux-render-artifact.sh` (554): `mentolder`,
   `website-mentolder`, `sealed-secrets-mentolder` aus KNOWN_COMPONENTS +
   want-Blöcken + Kommentaren entfernen (nur Streichungen, keine neue Logik;
   korczewski-Pendants unangetastet).
2. `tests/py/spec/test_flux_render_and_security.py` (143): Assertions auf
   mentolder-Out-Dirs entfernen/auf korczewski-only umstellen (exakt die
   Fundstellen per grep, z. B. `:105-122`).
3. Falls WEITERE Specs mentolder-Render assertieren (grep
   `mentolder.*render|render.*mentolder` über `tests/py/spec/`): STOPP +
   Bericht an Orchestrator (kein stilles Erweitern — D1).

## Gates
- `bash scripts/flux-render-artifact.sh --out /tmp/opencode/render-check`
  läuft ohne mentolder-Fehler (korczewski-Artefakte vorhanden).
- Render-Test-Set grün: betroffene Spec-Dateien per pytest-runner.
- `.sh`-Limit 800 eingehalten (nur Streichungen).
