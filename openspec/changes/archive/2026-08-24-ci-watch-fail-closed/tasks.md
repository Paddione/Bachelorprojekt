---
title: "ci-watch-fail-closed — Implementation Plan"
ticket_id: T014466
domains: [ci]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# ci-watch-fail-closed — Implementation Plan

## File Structure

```
tests/spec/ci-cd/devflow-ci-watch-run-lookup.bats  (neu) 6 Faelle mit gh-Stub, kein Netz
scripts/devflow-ci-watch.sh                        Run-Lookup + fail-closed (main 268, Limit 800)
```

## Partial-Manifest

Ein Partial. Test und Fix haengen an derselben Verzweigung; ein Schnitt dazwischen liesse einen
Stand zurueck, in dem das Merge-Gate weiter falsch gruen meldet.

## Tasks

- [x] **1. Failing test (RED).** Der Test liegt im Branch. Vor der ersten Aenderung laufen
      lassen und den roten Stand bestaetigen:

      ```bash
      ./tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/devflow-ci-watch-run-lookup.bats
      ```

      expected: FAIL — der Fall "unbestimmbarer Run-Lookup meldet NICHT 'alle gruen'" ist rot,
      die Positiv-Anker (gruener HEAD bleibt gruen, echter failure-Job bleibt rot) sind gruen.
      Die Anker sind hier nicht optional: ein Skript, das an allem scheitert, wuerde die
      Negativ-Aussage zufaellig erfuellen.

- [x] **2. Run-Lookup an den PR-Branch binden.** In `scripts/devflow-ci-watch.sh` den Aufruf
      `gh run list --branch "$(git rev-parse --abbrev-ref HEAD …)"` durch den Branch aus dem PR
      ersetzen (`gh pr view "$PR_URL" --json headRefName`). Der bisherige Ausdruck las den
      Branch aus dem cwd des Aufrufers — und der dokumentierte Aufrufweg fuehrt ueber das
      Haupt-Checkout (`dev-flow-execute` Schritt 3.8 und 5.5: `cd "$MAIN_REPO"`), wo `main`
      ausgecheckt ist.

- [x] **3. else-Zweig fail-closed machen.** Wird kein Run gefunden, darf `FAILED_CHECKS` NICHT
      geleert werden. Die Meldung soll benennen, dass die Gegenprobe nichts belegen konnte, und
      den verwendeten Branch nennen — sonst ist der Fall spaeter nicht diagnostizierbar. Ebenso
      bei nicht bestimmbarem PR-Branch.

- [x] **4. Die zulaessige Entwarnung unveraendert lassen.** Ein gefundener Run ohne
      failure-Jobs bleibt eine gueltige Entlastung (cancelled/skipped-Aggregate). Der
      entsprechende Testfall darf nicht rot werden:

      ```bash
      ./tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/devflow-ci-watch-run-lookup.bats -f "harmloses Aggregat"
      ```

- [x] **5. Bestehende ci-watch-Guards gegenpruefen.** Drei Suiten pinnen das Verhalten dieses
      Skripts; keine darf brechen:

      ```bash
      ./tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/
      ```

      Erwartet: keine `not ok`-Zeile. Insbesondere `devflow-ci-watch-rollup-headsha.bats`
      (T012239) und `devflow-ci-watch-merged-exit.bats` (T002671) muessen gruen bleiben.

- [x] **6. Final Verification.** Der neue Test vollstaendig gruen und die Repo-Gates intakt:

      ```bash
      ./tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/devflow-ci-watch-run-lookup.bats
      task test:changed
      task freshness:regenerate
      task freshness:check
      ```

      Erwartet: 6/6 gruen, `test:changed` ohne neue Fehlschlaege gegenueber `origin/main`,
      `freshness:check` gruen. Zusaetzlich der Beleg, dass der lokale Branch keine Rolle mehr
      spielt — das ist die eigentliche Zusicherung dieses Fixes:

      ```bash
      grep -n 'run list' scripts/devflow-ci-watch.sh
      # darf 'rev-parse --abbrev-ref HEAD' nicht mehr enthalten
      ```
