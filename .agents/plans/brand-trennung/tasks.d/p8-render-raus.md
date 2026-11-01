# p8 — Render-Skript korczewski-only + Render-Tests grün (Nachtrag, v2)

## Anlass (Plan-Mutation v2)
Rotphase belegt: Render stirbt schon im platform-Block (`source
scripts/env-resolve.sh fleet-mentolder`, Datei von p5 gelöscht) — reine
Streichungen reichen NICHT. Zusätzlich assertieren drei weitere Specs
mentolder-Render. v2 erweitert p8 (kein neues Partial — D1).

## Ziel
1. `scripts/flux-render-artifact.sh` (554):
   - `mentolder`, `website-mentolder`, `sealed-secrets-mentolder` aus
     KNOWN_COMPONENTS + want-Blöcken + Kommentaren streichen;
   - platform/coturn/office/rustdesk-Blöcke (`:248,373,388,408`) von
     `fleet-mentolder` auf `fleet-korczewski` umverdrahten (TURN/SMTP-Werte
     aus `fleet-korczewski.yaml`; Mapping im Code-Kommentar + PR-Body
     dokumentieren; fehlt ein Wert dort → STOPP, nichts erfinden).
2. Specs (Mit-Reparatur, exakt diese vier):
   - `tests/py/spec/test_flux_render_and_security.py` (143): mentolder-
     Out-Dir-Assertions entfernen/auf korczewski-only;
   - `tests/py/spec/test_fleet_operations.py` (`test_vaultwarden_smtp_from`,
     `:500-507`): `kubectl kustomize prod-fleet/mentolder` → korczewski-
     Pendant (Overlay-Name aus p1-Inventar; keins vorhanden → Test auf
     korczewski-Pfad umschreiben, kein Skip-Schlupf);
   - `tests/py/spec/fleet/test_ai_services_scale_zero.py` (`:46`): Fixture
     rendert `prod-fleet/mentolder` → `prod-fleet/korczewski`;
   - `tests/py/spec/remaining_domain_specs/flux-artifact-versioning/test_flux_artifact_versioning.py` (`:21`): `mentolder/mentolder.yaml`-Assert → korczewski-Artefakt.
3. Grep-Kontrolle danach: `mentolder.*render|render.*mentolder` über
   `tests/py/spec/` + `flux-render` über `scripts/` — Resttreffer einzeln
   begründen (Kommentar/Doku ok, Code-Pfad nicht).

## Rotphase (Baseline zuerst)
`bash scripts/pytest-run.sh tests/py/spec/test_flux_render_and_security.py`
— expected FAIL (belegt: 2 failed). Nach Umsetzung derselbe Befehl +
die drei Mit-Reparatur-Specs grün. Beleg in phase-events.log.

## Gates
- Render-Lauf `--out` ohne mentolder-Fehler, korczewski-Artefakte vorhanden.
- Alle vier Spec-Dateien grün; `.sh`-Limit 800 eingehalten.
