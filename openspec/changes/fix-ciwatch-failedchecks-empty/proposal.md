# Proposal: fix-ciwatch-failedchecks-empty

## Why

Seit dem T012239-Fix (PR #4737) wertet `scripts/devflow-ci-watch.sh` rote Checks
über die check-runs-API des PR-HEAD aus und liefert `FAILED_CHECKS` als
JSON-Array. Bei null Fehlern ist das Ergebnis `[]` — und `[[ -n "[]" ]]` ist
wahr. Der Post-Merge-Review fand zwei Folgen:

1. Jeder grüne Lauf durchläuft die T003224-Gegenprobe unnötig.
2. **Falsch-Rot:** Ein überholter failure-Run am selben HEAD (der klassische
   Re-Run-Kandidat, den T003224 als „kein Codefehler" behandeln soll) lässt die
   Gegenprobe `FAILED_CHECKS="[]"` bestehen → das Skript eskaliert nach
   `MAX_CI_ATTEMPTS` mit exit 1 auf einem grünen PR. Der T003224-Guard wirkt
   invertiert.

Empirisch reproduziert (RED-Test, Verhaltens-Simulation gegen gh-Stubs). Der
Test-Stub bildete das reale post-jq-Shape (`[]`) nicht ab — die Suite sah die
Kante nie (Review-I2).

## What

1. **Normalisierung in `devflow-ci-watch.sh`:** direkt nach dem
   `FAILED_CHECKS`-Fetch wird die leere Array-Form geleert
   (`[[ "$FAILED_CHECKS" == "[]" ]] && FAILED_CHECKS=""`). Die Wrapper-Form
   bleibt unverändert; die Wahrheits-Semantik wird an der einen falschen Stelle
   repariert.
2. **Eskalationsmeldung:** JSON-Array-Form wird vor der Ausgabe zeilenweise
   aufgelöst (`jq -r '.[]'` mit Fallback) — eine Zeile pro Check statt
   `["name: url", ...]` (Review-M4).
3. **Kommentar-Hygiene (Review-M1):** die veralteten Rollup-/headSha-Kommentare
   im Skript werden auf die check-runs-API als Quelle umgestellt.
4. **Totes Fixture (Review-M2):** die vom angepassten Stub in
   `tests/spec/batch-repo-hygiene-ops-fixes.bats` nicht mehr gelesene
   `rollup.json`-Referenz wird entfernt (nach Verifikation im Implement-Step).

Non-Goals: M3 (zwei `PR_HEAD_OID`-Fetches pro Runde), alle übrigen
T012239-Non-Goals.

_Ticket: T012242_
