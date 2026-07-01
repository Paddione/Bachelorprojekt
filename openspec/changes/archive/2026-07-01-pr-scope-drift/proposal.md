# Proposal: pr-scope-drift

## Why

Drei Stellen entscheiden unabhängig voneinander über gültige Commit-/PR-Scopes und sind bereits
auseinandergedriftet: `commitlint.config.cjs` (behauptete SSOT), die hartcodierte `scopes:`-Liste
im `commit-lint`-Job von `.github/workflows/ci.yml` (weicht bereits ab: zusätzlich `goals`,
`openspec`, `mentolder-web`, `skills`, `quality`; fehlt `arena`), und `.github/workflows/pr-auto-title.yml`,
das den Scope per Regex aus dem Branch-Namen ableitet, ohne ihn gegen irgendeine Liste zu
validieren. Dadurch entstehen PRs mit nicht existierenden Scopes im Titel, ohne dass markiert
wird, dass ein neuer Scope registriert werden müsste.

## What

`commitlint.config.cjs` wird zur einzigen tatsächlichen Wahrheitsquelle:

- `scripts/validate-commit-msg.sh` bekommt einen `scopes`-Modus, der die erlaubte Liste ausgibt.
- `.github/workflows/ci.yml` (`commit-lint`-Job) lädt die `scopes:` für die
  `amannn/action-semantic-pull-request`-Action dynamisch über diesen neuen Modus statt über eine
  eigene hartcodierte Kopie.
- `.github/workflows/pr-auto-title.yml` bekommt einen Checkout-Schritt und validiert den aus dem
  Branch-Namen abgeleiteten Scope gegen dieselbe Quelle; ein unbekannter Scope wird verworfen
  (Titel fällt auf `type: subject` zurück statt einen erfundenen Scope zu setzen).
- Neues Skript `scripts/register-scope.sh <scope>` registriert einen neuen Scope idempotent in
  `commitlint.config.cjs`.

Volles Design: `docs/superpowers/specs/2026-07-01-pr-scope-drift-design.md`.

_Ticket: T001364_
