# p3 — devflow-ci-watch.sh: cancelled≠fail + headSha-Filter (T003224, T003225)

<!-- S1-Budget: scripts/devflow-ci-watch.sh — Ist 182 - Baseline 0 -> Budget 618 frei (Limit 800) -->

## Ziel

Die gh-Warteschleife in `scripts/devflow-ci-watch.sh` wertet Checks falsch aus:
- T003224: conclusion=cancelled wird auf "fail" gefaltet (PR grün, Meldung rot)
- T003225: statusCheckRollup mischt head-SHAs + leere conclusion ist in jq truthy

## Ist-Stand (nach Teil-Implementierung c8e68ba97)

Beide Fixes sind in `scripts/devflow-ci-watch.sh` committet: headSha-Filter
(`.headSha == $p.headRefOid`) + conclusion-Filter (nur FAILURE/TIMED_OUT) +
Job-Ebene-Gegenprobe (`gh api runs/.../jobs` → failure-Job-Zählung). Die p5-Tests 6-8
sind grün. Dieser Partial ist damit im Kern GRÜN — offen ist nur die Verifikation
gegen die main-Änderung T003109 (`ci_checks_verdict` in `scripts/lib/ci-checks.sh`,
nicht-invasive Nichtleere-Guard-Alternative) und die End-to-End-Fälle.

## Steps

1. **RED.** Tests in `tests/spec/batch-repo-hygiene-ops-fixes.bats` (in p5 geschrieben):
   cancelled-Jobs ≠ failure; fremde head-SHAs zählen nicht. `expected: FAIL`.

2. **GREEN — cancelled≠fail (T003224).** In `scripts/devflow-ci-watch.sh`: bei rot
   gemeldetem Check `gh run view <run> --json jobs -q '.jobs[]|select(.conclusion=="failure")'`
   gegenprüfen; keine Treffer → cancelled/skipped, kein Fehler.

3. **GREEN — headSha (T003225).** Auswertung filtert auf `.headSha == <headRefOid>` und
   trennt laufend/leer explizit:
   `select(.conclusion != "" and .conclusion != null and .conclusion != "SUCCESS")`.
   Kanonisch: `gh run list --branch <b> --json databaseId,name,headSha,status,conclusion`
   plus Filter auf den head.

4. **Verifikation.** Fälle aus T003224 (PR #4091) und T003225 (PR #4092): Warteschleife
   meldet grün korrekt grün, laufender Run nicht als ROT.

## Acceptance

- cancelled/skipped ≠ failure.
- Nur Checks des aktuellen head-SHAs zählen.
- Watch-Schleife bricht nicht mehr fälschlich mit ROT ab.
