# Proposal: openspec-half-archive-T002428

## Why

`openspec/changes/pr-refresh-T002413/` lag auf `main` gleichzeitig offen **und** archiviert, während `openspec/specs/ci-cd.md` das Delta nicht enthielt. Ursache: `openspec.sh archive` lief in einem fremden Worktree (#3447/T002382) und nur ein Teil des Ergebnisses wurde committet — der Archivordner ja, der Delta-Merge und das Entfernen der Quelle nicht.

**Befund bei der Umsetzung:** Ein struktureller Check über den ganzen Baum fand nicht einen, sondern **sieben** solcher Fälle, den ältesten vom 2026-07-03. Zusammen **16 Requirements**, die ausgeliefert sind, aber in keiner SSOT-Spec stehen. Der Zustand war bis dahin nirgends prüfbar — genau deshalb konnte er über Wochen wachsen.

## What

**Heilung des Bestands**

Alle sieben Deltas mit `scripts/openspec-merge.mjs` (operationsbewusst) in ihre SSOT-Specs gemergt, die offenen Quellen entfernt:

| Slug | Ziel-Spec | Requirements |
|---|---|---|
| coaching-ki-model-select | llm-local-dev | 3 |
| coaching-sessions-admin-ux | admin-nav-accordion (neu), coaching-sessions-polish-guide | 1 + 3 |
| db-brand-check-constraints | database | 2 |
| fleet-secrets-parity-test | secrets-deploy-automation | 2 |
| oauth2-proxy-hardening | auth-sso | 4 |
| pr-refresh-T002413 | ci-cd | 1 |
| prod-write-guard | agent-behavior (neu) | 3 |

Zwei Deltas (`agent-behavior`, `database`) enthielten Requirements **ohne** `#### Scenario:` und wurden vom fail-closed Validator zurückgewiesen. Die Szenarien sind an der tatsächlichen Implementierung geschrieben — `scripts/prod-write-guard.sh` (Denylist, `GUARD: prod-write-blocked`-Format, `--confirm-prod-write`) bzw. `migrations/20260719-brand-check-constraints.sql` (`chk_brand_<table>`, Ein- vs. Zwei-Marken-Tabellen, `duplicate_object`-Idempotenz).

**Damit es nicht wiederkehrt**

1. `openspec.sh archive` lehnt ab, wenn das Archivziel schon existiert — **vor** dem Delta-Merge. `mv` würde die Quelle sonst still in ein bestehendes Ziel hinein verschachteln; eine Prüfung danach hätte das Delta bereits in der SSOT und den Lauf unwiederholbar gemacht.
2. `scripts/openspec-half-archive-check.sh` findet jeden Slug, der offen und archiviert zugleich ist, und hängt fail-closed in `task test:openspec` — dem Gate, das CI ohnehin fährt.

## Impact

- 16 Requirements sind jetzt in den SSOT-Specs; zwei Spec-Dateien sind neu (`admin-nav-accordion`, `agent-behavior`)
- `openspec/changes/` schrumpft um sieben verwaiste Ordner
- `task test:openspec` schlägt künftig fehl, sobald ein Change halb archiviert liegt

_Ticket: T002428_
