# Proposal: commit-scope-vokabular-T002814

## Why

`fix(mcp-gateway): …` bestand den CI-PR-Titel-Check (grün auf PR #3918), wurde aber vom
lokalen `.githooks/commit-msg` mit „unknown scope 'mcp-gateway' — did you mean 'mcp'?"
abgelehnt. Recherche vor diesem Proposal (siehe Design-Spec,
`docs/superpowers/specs/2026-08-09-commit-scope-vokabular-design.md`) widerlegt die
ursprüngliche Diagnose „zwei divergierende Scope-Vokabulare" — es gibt nur ein SSOT
(`commitlint.config.cjs` über `scripts/validate-commit-msg.sh`), verwendet von Hook, CI und
`preflight-pr-scope.sh`. Der PR-Titel-Check validiert Scope laut eigenem Kommentar bewusst
nicht; ein grüner Check ist also keine Aussage über Scope-Gültigkeit. Zwei echte Lücken
bleiben: `mcp-gateway` ist ein aktiver, mehrfach genutzter Scope, der bei der
T002328-Konsolidierung (95→14 Scopes) übersehen wurde (kein bewusster Retire-Fall wie
`tracking`/`livekit`); und die Ablehnungsmeldung erklärt nicht, warum ein grüner PR-Titel
keine Garantie ist. `tickets` ist dagegen bereits korrekt als Alias auf `factory` gemappt —
kein Bug, wird nicht angefasst.

## What

- `commitlint.config.cjs`: `mcp-gateway` als Alias in `SCOPE_ALIAS_GROUPS.mcp` ergänzen
  (analog zum bestehenden `mcp-task-runner`-Alias).
- `scripts/validate-commit-msg.sh`: bei jeder Scope-Ablehnung eine zusätzliche Hinweiszeile
  ausgeben, dass der CI-PR-Titel-Check keinen Scope prüft — wirkt automatisch an allen drei
  Aufrufstellen (Hook, CI, `preflight-pr-scope.sh`), da es nur eine Implementierung gibt.
- BATS-Regressionstest in `tests/spec/commit-scope-vokabular/`, der `mcp-gateway` (neu
  akzeptiert mit Alias-Hinweis), `tickets` (weiterhin abgelehnt mit `factory`-Hinweis) und
  einen gültigen Scope (Positiv-Anker) gegen das echte Skript prüft.

_Ticket: T002814_
