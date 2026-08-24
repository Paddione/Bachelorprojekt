# Proposal: ci-watch-fail-closed

## Why

`scripts/devflow-ci-watch.sh` kann einen PR mit **roten** CI-Checks als „alle grün" melden und
damit einen Auto-Merge kaputten Codes nach `main` durchlassen.

Die T003224-Gegenprobe soll aggregierte `failure`-Checks entschärfen, deren Jobs in Wahrheit
`cancelled`/`skipped` sind. Sie sucht den zugehörigen Run über:

```bash
gh run list --branch "$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)"
```

Der Branch stammt also aus dem **cwd des Aufrufers**. `dev-flow-execute` ruft das Skript aber
ausdrücklich aus dem Haupt-Checkout auf — Schritt 3.8 und 5.5 lauten `cd "$MAIN_REPO"` —, wo
`main` ausgecheckt ist und nicht der PR-Branch. `gh run list --branch main` findet dann keinen
failure-Run mit `headSha == PR_HEAD_OID`, und der `else`-Zweig behandelt „nicht gefunden" als
„kein Codefehler": er setzt `FAILED_CHECKS=""` und der Lauf endet mit `exit 0`.

Beobachtet an **PR #5081** (T013916) am 2026-08-23:

```
scripts/devflow-ci-watch.sh …
  → "ℹ check-runs meldet failure, aber kein failure-Run am aktuellen HEAD — kein Codefehler"
  → "✅ 18 CI-Checks, alle grün."   rc=0

gh pr view 5081 --json mergeStateStatus,statusCheckRollup
  → merge=BLOCKED, rot=["Factory spec shard 2", "Factory + OpenSpec + Guards"]
```

Nur die manuelle Gegenprüfung deckte es auf.

## What

- Der Run-Lookup bindet an den **PR-Branch** (`gh pr view --json headRefName`) statt an den
  lokalen Branch.
- Der `else`-Zweig wird **fail-closed**: „kein Run auffindbar" heißt, dass die Gegenprobe nichts
  belegen konnte — nicht, dass kein Fehler vorliegt. Der Fehler bleibt bestehen.
- Ein nicht bestimmbarer PR-Branch entlastet ebenfalls nicht.
- Die einzige zulässige Entwarnung bleibt unverändert: der Run wurde **gefunden** und seine Jobs
  tragen nachweislich keinen `failure`.

## Verworfene Alternative

**Die Gegenprobe ganz entfernen** — dann würde ein aggregierter Check, dessen Jobs alle
`cancelled` sind, wieder als echter Fehler gelten und die Fix-Schleife unnötig auslösen. Der
Zweck der Probe ist richtig; falsch war nur, dass ihr Nicht-Ergebnis als Entwarnung zählte.

## Klasse

Dieselbe wie T014104 (Rollup-Carry-over), T014386 (Lesepfade), T014384 (`skip` zählt als `ok`)
und T014468 (Worktree-Claim): **Abwesenheit eines Negativsignals wird als Erfolg gelesen.** Hier
trifft sie das Merge-Gate — die Stelle mit dem größten Schadenspotenzial.

_Ticket: T014466_
