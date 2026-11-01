# p3 — Envs/Secrets + DNS-Cutover (Eigner-STOPP eingebaut)

## Ziel
1. `environments/fleet-korczewski.yaml` + `environments/korczewski-prod.yaml`
   prüfen/vervollständigen (Domain, Kontexte, Hosts; Werte nur aus
   `credentials-finden.md`-Prozedur — nicht gefunden → STOPP, nichts erfinden).
2. Sealed-Secrets-Lage: `environments/sealed-secrets/` + Controller-Zertifikat
   prüfen (`task sealed-secrets:status ENV=fleet-korczewski` o. Ä. nach
   Oracle); Re-Seal nur via `task env:seal ENV=fleet-korczewski`.
3. DNS: `task fleet:dns:cutover ENV=fleet-korczewski` (plan-Modus) lesen,
   Rollback-State-Verfahren notieren.

## Eigner-STOPP (PFLICHT, keine Ausnahme)
`ACTION=cutover` und jeder `kubectl apply`/Deploy in p3 NUR nach
ausdrücklicher Eigner-Freigabe im Chat (Prod-Mutation, Trigger 1).
Ohne Freigabe endet p3 nach Schritt 2 + cutover-plan-Beleg.
Freigabe + Rollback-State-Pfad in `phase-events.log` dokumentieren.

## Gates
- `task env:validate ENV=fleet-korczewski` grün.
- cutover-plan-Output im PR-Body (oder phase-events bei STOPP).
