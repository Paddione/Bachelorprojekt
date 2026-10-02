# p2-tests: Rot-Gruen-Nachweis G-SVC01 (T900916)

Scope: verify-only auf `tests/spec/health-goals/service-health-goals.bats`
(kein Edit; das Guard-File wird nur gelesen und ausgefuehrt). Laeuft nach
p1 (`depends_on: p1`). Alle Befehle im Worktree-Root.

## Steps

1. Rot-Seite des Nachweises: p1-Aenderung kurz zur Seite stellen, Guard
   muss fehlschlagen mit expected: FAIL —
   `git stash push k3d/monitoring/blackbox-exporter.yaml &&
   tests/unit/lib/bats-core/bin/bats
   tests/spec/health-goals/service-health-goals.bats -f "svc-probe" ;
   rc=$? ; git stash pop ; echo "red rc=$rc"` —
   erwartet: `not ok 1` mit `FAIL: svc-probe meldet '1' ungedeckte
   Produktions-Ingresses.` Schlaegt `git stash pop` fehl, sofort stoppen
   und melden (Arbeitsbaum nicht per Hand rekonstruieren).
2. Gruen-Seite: `tests/unit/lib/bats-core/bin/bats
   tests/spec/health-goals/service-health-goals.bats -f "svc-probe"` muss
   `ok 1` melden. Zusaetzlich die Rohmessung:
   `python3 scripts/lib/runtime-health-measure.py svc-probe` → `0`.
3. Manifest-Guards (die Aenderung ist ein Manifest-Edit):
   `task workspace:validate` muss gruen sein.
4. Volle Guard-Datei laufen lassen, um Nachbar-Tests zu bestaetigen:
   `tests/unit/lib/bats-core/bin/bats
   tests/spec/health-goals/service-health-goals.bats` — alle Tests gruen.
5. Ergebnis als Kommentar im Ticket festhalten (Rot-/Gruen-Output);
   kein Commit noetig, da keine Datei geaendert wurde. Falls Schritt 1–4
   eine Guard-Anpassung zu erfordern scheinen: stoppen und melden,
   Guard nicht stillschweigend anpassen.

## Acceptance

- Rot-Gruen-Paar belegt: `not ok 1` ohne Fix, `ok 1` mit Fix, beide mit
  demselben Runner-Aufruf aus Schritt 1 und 2.
- `task workspace:validate` gruen, volle Guard-Datei gruen.
