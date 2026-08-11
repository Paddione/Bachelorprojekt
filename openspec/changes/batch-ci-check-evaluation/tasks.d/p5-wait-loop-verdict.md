# P5 — Warteschleifen nutzen das gemeinsame Verdict (T003109)

Rolle: **impl**. Rest-Arbeit zu T003109: Der Kern-Fix ist shipped (`ci_checks_verdict` in
`scripts/lib/ci-checks.sh`, Guard-Test, SSOT-Requirement, `pr-babysit-ticket.sh` verdrahtet).
Lücke: `scripts/devflow-ci-watch.sh` bewertet die Check-Liste weiterhin ad-hoc
(`statusCheckRollup` + `TOTAL_CHECKS==0 → exit 5`), obwohl das SSOT-Requirement die
gemeinsame Funktion für JEDE Warteschleife verlangt.

## File `scripts/devflow-ci-watch.sh` (geändert)

### Task P5.1 — Bewertung auf ci_checks_verdict umstellen

- [ ] `scripts/lib/ci-checks.sh` sourcen (Pfad relativ zu `$0`-Verzeichnis auflösen wie in
      anderen Konsumenten; `source` mit Guard `[[ -f ]]`).
- [ ] Die Bewertung im Poll-Loop (Zeilen ~82–110: `FAILED_CHECKS` via
      `statusCheckRollup`-jq + `TOTAL_CHECKS` via check-runs-API) auf
      `ci_checks_verdict` umstellen: `gh pr checks <n> --json name,state` pipen, Verdict
      auswerten:
      - `empty` → Exit 5 (bestehende Semantik „CI wurde nie gestartet", Meldungstext
        beibehalten);
      - `red` → bestehender Fehler-Pfad (FAILED_CHECKS-Diagnose aus dem
        `statusCheckRollup`-Block kann für die Diagnose-Ausgabe ERHALTEN bleiben — die
        VERDICT-Bildung nutzt die gemeinsame Funktion, die Diagnose bleibt reichhaltig);
      - `pending` → Retry-Loop wie bisher;
      - `green` → Erfolgspfad (`assert-phase-chain`, Exit 0).
- [ ] `gh pr checks --watch`-Block (Zeile 74) unverändert lassen — der watch ist der
      BLOCKING-Wartemechanismus; das Verdict ersetzt nur die nachgelagerte Bewertung.
- [ ] Kein Verhalten-Verlust: `MAX_CI_ATTEMPTS`-Begrenzung, `--detail`-Phase-Events und
      MERGED/DIRTY/CONFLICTING-Preflights bleiben unangetastet.
- [ ] Kopf-Kommentar: Verweis auf SSOT-Requirement „Jedes Prädikat über einer Check-Liste
      braucht einen Nichtleere-Guard" und auf den Regressionstest
      `tests/spec/ci-cd/devflow-ci-watch-empty-guard.bats`.

### Task P5.2 — Verifikation (konkrete Test-Schritte)

S1-Budget: `scripts/devflow-ci-watch.sh` — S1-Restbudget 657 (die Umstellung ersetzt eine
ad-hoc-jq-Auswertung durch einen Funktionsaufruf, Netto-Zeilenänderung minimal).

- [ ] Test-Schritt A: `bash -n scripts/devflow-ci-watch.sh` — keine Syntaxfehler.
- [ ] Test-Schritt B: Fake-`gh`-Fixture (Muster `devflow-ci-watch-merged-exit.bats`): leere
      Check-Liste → rc 5 mit „Keine CI-Checks"-Meldung; nichtleere grüne Liste → rc 0
      ohne Parse-Fehler (Fake liefert `--json name,state`).
- [ ] Test-Schritt C: bestehende Tests `tests/spec/ci-cd/devflow-ci-watch-merged-exit.bats`
      bleiben grün (kein Verhaltensbruch am MERGED-Preflight).
