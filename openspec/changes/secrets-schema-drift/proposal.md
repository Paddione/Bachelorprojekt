# Proposal: secrets-schema-drift

## Why

`tests/unit/secrets-sync.bats` ist rot: 2 von 4 Assertions schlagen fehl. Gemessen gegen
`f6f7e7f1996ab6beb33501d78c0de48f417d6a9c` fehlen 19 im Schema deklarierte Secret-Namen in
`k3d/secrets.yaml` (`workspace-secrets`), und 11 Namen stehen dort ohne Schema-Deklaration. Der
Drift ist echt, aber nicht einheitlich: ein Teil der Abweichungen ist gewollt (externe
Provider-Credentials, `flux-system`-only Keys, host-generiertes Schlüsselmaterial), ein Teil ist
eine echte Lücke (`POCKET_ID_CLAUDE_CODE_SECRET` wird vom Seed-Job konsumiert, fehlt aber im
autoritativen Schema), und ein Teil ist Altlast aus der Keycloak-Ära, die das Schema am
2026-06-22 bereits zurückgezogen hat. Beide Listen pauschal glattzuziehen wäre falsch.

Solange der Test rot ist, meldet er keinen *neuen* Drift mehr — er ist als Frühwarnung
wirkungslos.

## What

- `environments/schema.yaml` bleibt die autoritative Liste und gewinnt bei Konflikt.
- Neue, maschinenlesbare Annotation `dev_absent: true` + `dev_absent_reason: "<Text>"` für
  Schlüssel, die absichtlich kein Dev-Gegenstück haben — statt einer Allowlist im Test.
  `required: true` schließt `dev_absent` aus.
- `POCKET_ID_CLAUDE_CODE_SECRET` wird ins Schema aufgenommen (echte Lücke, kein Orphan).
- Die zehn Keycloak-Alt-Namen `*_OIDC_SECRET` verschwinden aus `k3d/secrets.yaml`; ein Guard
  verhindert ihre Rückkehr.
- Acht Schlüssel bekommen Dev-Platzhalter in `k3d/secrets.yaml`.
- Neue Guards in `tests/spec/secrets-deploy-automation/schema-dev-secrets-sync.bats` melden
  fehlende Begründungen, veraltete Annotationen und die Rückkehr der Alt-Namen einzeln.

Sicherheitsrahmen: Es werden ausschließlich Schlüssel-**Namen** verarbeitet. `k3d/secrets.yaml`
erhält nur offensichtliche Dev-Platzhalter; kein Wert aus `environments/.secrets/*` oder
`environments/sealed-secrets/*` wird übernommen.

_Ticket: T003141_
