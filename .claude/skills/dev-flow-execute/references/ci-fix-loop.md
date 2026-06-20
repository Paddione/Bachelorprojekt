# dev-flow-execute: CI/CD fix loop

Schritt 5.5 — aus `dev-flow-execute` extrahiert (Chore T001007). Watcht einen PR bis alle required checks grün sind, sammelt Failure-Logs und eskaliert nach `MAX_CI_ATTEMPTS`.

## Verwendung

Wird am Ende von `dev-flow-execute` (nach `gh pr create`) aufgerufen:

```bash
TICKET_ID="T000xxx"
PR_URL=$(gh pr view --json url -q '.url')
MAX_CI_ATTEMPTS="${MAX_CI_ATTEMPTS:-5}"
bash scripts/devflow-ci-watch.sh "$TICKET_ID" "$PR_URL"
```

Optional: Wenn der Loop fehlschlägt, wird `exit 1` zurückgegeben — der Skill kann dann eskalieren.

## Verhalten

- Pro Iteration: `gh pr checks --watch` → State lesen
- Bei Failure: `gh run view --log-failed` (Tail 200) → Diagnose an einen `sonnet`-Subagenten delegieren (nicht in diesem Skript — der Skill spawnt den Subagenten mit den Logs als Prompt-Kontext)
- Nach erfolgreichem Subagent-Fix: Loop wiederholen
- Bei `MAX_CI_ATTEMPTS` erreicht: `exit 1` mit Liste der roten Checks

## Required Checks (Auto-Merge wartet auf)

- Offline Tests (Manifests, Configs, Unit)
- Security Scan
- Brett TypeScript
- Vitest (website + arena-server)
- Conventional Commits

`E2E PR` ist **kein** required check (T000722) — ein gelber/roter E2E-Status blockiert den Merge nicht.

## Telemetrie

Das Skript ruft `./scripts/ticket.sh phase "$TICKET_ID" deploy ... --driver devflow` für `entered`/`done` Phasen auf — best-effort (`|| true`), blockiert den Flow nie.
