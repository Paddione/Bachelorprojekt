# Partial p2-guard-tests: BATS-Guard gegen leere Sessions-Wildcards

## Focus
Failing-Test (Rot) plus Verdrahtungs-Nachweis unter
`tests/spec/sessions-server/wildcard-render-guard.bats` (eigene Datei pro
T002416, kein ticket-nummerierter Name). Der Test misst Verhalten
(Exit-Code des Guards auf echten Render-Artefakten), nicht Source-Text.

## Touched Files
- tests/spec/sessions-server/wildcard-render-guard.bats

## Steps
1. Failing-Test-Step (RED): neuen BATS-Test schreiben, der den Guard mit
   `SESSIONS_DOMAIN=""`-Substitution der echten Overlay-Quelle
   (`prod-fleet/mentolder/sessions-server.yaml` via `envsubst`) triggert.
   Jeder Negativtest traegt seinen Positiv-Anker (gesunder Render passiert)
   im selben Test (T002356-M1); der leere Render wird per grep auf `"*."`
   als Defekt bestaetigt (T003548), bevor der Guard laeuft.
2. Rot nachweisen — der Test muss auf dem unfixten Stand fehlschlagen:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/sessions-server/wildcard-render-guard.bats
# expected: FAIL (red — scripts/render-guard.sh fehlt, keine Verdrahtung)
```

3. Fix-Step (GREEN, nach p1): derselbe Aufruf muss vollstaendig gruen sein —
   Verhaltens-Tests (dnsNames, HostRegexp, Platzhalter, korczewski-Scope ohne
   False Positive) plus Verdrahtungs-Checks (Flux-Skript + Taskfile rufen
   `render-guard.sh` auf).
4. Regression: `tests/spec/sessions-server/` und
   `tests/spec/fleet-operations/security-cert-hygiene.bats` bleiben gruen.
