# Design: fix-babysit-prs-ci-never-ran

_Ticket: T012264_

## Root-Cause

`scripts/factory/babysit-prs.sh` endet mit `no eligible red PR` (exit 0), wenn
kein Rollup-Eintrag eine rote conclusion trägt. Ein offener PR, dessen CI nie
lief (keine Check-Runs auf dem PR-HEAD: Workflow-Defekt, Trigger-Lücke), hat
ein leeres oder pending-Rollup — er erzeugt keinen Kandidaten und keine
Notifikation. Der Zustand ist vom Scanner aus unsichtbar: dieselbe
Fehlerklasse „leeres Signal ist kein Urteil", die T012239 auf der
Rot-Erkennungsseite behob. Sekundärbefund 1 aus T012239.

## D-Entscheidungen

**D1 — CI-never-ran-Scan nach dem Kandidaten-Nullfall.** Wenn
`CANDIDATE_COUNT == 0`, prüft das Skript vor dem `exit 0` die PRs aus demselben
`gh pr list`-Scan (Filterkette identisch: kein Draft, kein Renovate, kein
live-Branch-Lock), deren `statusCheckRollup` KEINEN COMPLETED-Eintrag trägt.
Für jeden solchen PR: `gh pr view <n> --json headRefOid` → check-runs-API
`total_count`. `total_count == 0` → `emit_notify` mit `event=ci-never-ran`
und PR-Nummer (Mechanik vorhanden, kein neuer Notify-Kanal).

**D2 — IN_PROGRESS ist kein „lief nie".** Ein PR mit laufenden Checks hat
`status=IN_PROGRESS`-Einträge und wird übersprungen — der Nichtleere-Guard
verhindert, dass ein frisch gepushter PR vor dem ersten Run als tot gemeldet
wird.

**D3 — Fail-soft und kostengünstig.** Pro betroffenem PR maximal 2 gh-Calls
(headRefOid + check-runs), nur im Kandidaten-Nullfall, nur für PRs ohne
COMPLETED-Checks. Bei gh-Ausfall: wie bisher `exit 0` mit Diagnosezeile auf
stderr — der Scan darf den Wakeup-Tick nicht abbrechen.

**D4 — Non-Goals:** T012265 (pr-babysit-ticket.sh SHA-Bezug), T012266
(opencode-exec), T012267 (GitLab), alle T012263-Themen.

## Edge-Cases

- **Rollup leer vs. pending-only:** beide sind Kandidaten für den
  total_count-Check; erst `total_count == 0` entscheidet.
- **total_count > 0, aber kein COMPLETED:** CI lief, Checks laufen noch —
  kein Notify (D2).
- **CONFLICTING-PRs:** werden bereits im Kandidatenpfad behandelt (Label +
  Notify) und tauchen im Rollup-Nullfall nicht erneut auf — der neue Scan
  läuft nur, wenn der Kandidatenpfad leer ist.

## Tests

`tests/spec/software-factory/babysit-prs-ci-never-ran.bats` — gh-Stub +
`FACTORY_DRY_RUN=true`; Positiv-Anker: IN_PROGRESS-Rollup → keine Notify;
Negativtest (RED): leeres Rollup + `total_count=0` → `QA_NOTIFY_PAYLOAD` mit
PR-Nummer im Output.
