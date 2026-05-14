# dev-flow skill — design

**Date:** 2026-05-13
**Status:** approved, ready to plan
**Audience:** Patrick + gekko (and any future contributor working with Claude in this repo)

## Goal

Codify Patrick & gekko's shared software development process into a project-level skill (`dev-flow`) that Claude auto-invokes for every work request in the Bachelorprojekt repo. The skill keeps both contributors on the same page: same branching, same testing floor, same PR conventions, same post-merge deploy.

## Design decisions

| Decision | Choice | Rationale |
|---|---|---|
| **Review gate** | Auto-merge on CI green | Matches Patrick's existing workflow; PRs are history, not gates |
| **Skill shape** | Thin orchestrator over `superpowers:*` skills | Single source of truth; survives superpowers updates with minimal drift |
| **Activation** | Auto-invoke on any work request in this repo | Description-trigger on "add", "fix", "change", "build" etc.; both contributors get the same flow |
| **Worktree** | Always — every task gets its own worktree | Patrick runs 8–10 parallel sessions; isolation is mandatory |
| **Path rigor** | Scale by type: feature > fix > chore | Three named paths with different testing/planning floors |
| **Tests** | Feature: TDD. Fix: regression test required. Chore: skip TDD but `task test:all` must pass | Catches regressions; keeps trivia from being heavy |
| **PR format** | Conventional commits + Summary/Test plan body | Matches existing `git log` style |
| **Bug tickets** | Required for fix path: PR closes a `BR-YYYYMMDD-xxxx` ticket | Paper trail; ticket DB at `web.mentolder.de/admin/bugs` |
| **Safeguards** | None — trust CI + auto-merge | Patrick trusts gekko + the CI gate |
| **Path decision** | Claude proposes, user confirms | Catches mis-classification early without forcing every interaction |
| **Branch slugs** | Short, no BR-* in branch name | BR-* lives in PR body where GitHub auto-links it |
| **Skill content language** | German | gekko speaks only German; spec doc + brainstorming stay English |

## File layout

```
.claude/skills/dev-flow/SKILL.md
```

Project-level (lives in the repo). One file. ~200–300 lines. Content in German (with English git artifacts: branch names, commit prefixes, task names — these stay verbatim).

## SKILL.md structure

### Frontmatter

```yaml
---
name: dev-flow
description: Verwende immer wenn jemand in diesem Repo eine neue Funktion hinzufügen, einen Bug beheben oder eine Änderung machen will. Definiert unseren gemeinsamen Entwicklungsablauf — Pfade für Feature/Fix/Chore, Worktree-Isolation, Conventional-Commit-PRs, Post-Merge-Deploy auf beide Prod-Cluster.
---
```

(German description so it triggers on German task requests too; Claude understands both.)

### Top-of-file: always-first steps

1. **Pfad bestimmen.** Claude liest die Anfrage und schlägt einen Pfad vor: `feature`, `fix`, oder `chore`. Bestätigung beim User einholen, bevor es weitergeht.
   - **feature** = neues Verhalten, neuer Endpunkt, neue UI-Sektion, neuer Task — alles was Nutzer bemerken
   - **fix** = etwas ist kaputt; Output/Verhalten passt nicht zur Erwartung. Erfordert ein BR-* Ticket.
   - **chore** = keine Verhaltensänderung für Nutzer — Dependency-Bumps, Refactors, Doku/Kommentar-Updates, Config/CI-Tweaks

2. **Worktree anlegen.** `superpowers:using-git-worktrees` aufrufen. Branch-Name: `<pfad>/<kurzer-slug>` (z.B. `feature/solo-replay`, `fix/sse-connection-header`, `chore/bump-astro`).

### Section: Feature path

1. **Brainstorming.** `superpowers:brainstorming` aufrufen → Spec in `docs/superpowers/specs/`.
2. **Plan.** `superpowers:writing-plans` aufrufen → Plan in `docs/superpowers/plans/`.
3. **Frontmatter-Hook.** `bash scripts/plan-frontmatter-hook.sh <plan-datei>` (siehe CLAUDE.md — Pflicht für Plan-Context-Routing).
4. **Implementation.** `superpowers:subagent-driven-development` (bevorzugt — parallele Agents) oder `superpowers:executing-plans` (sequentieller Fallback). TDD via `superpowers:test-driven-development` für Backend/Skripte/k8s-Logik. UI-Arbeit nutzt `frontend-design` + Playwright Smoke Tests.
5. **Lokale Verifikation.** `task workspace:validate`, relevante `./tests/runner.sh local <FA/SA/NFA-ID>`, dann `task test:all`.
6. **PR erstellen.** `commit-commands:commit-push-pr` aufrufen. Titel: `feat(<scope>): <zusammenfassung>`. Body: `## Summary` + `## Test plan`.
7. **Auto-Merge** sobald CI grün ist.
8. **Post-Merge:** Sektion 3 regelt Deploy + Verifikation.

### Section: Fix path

1. **BR-* Ticket finden/anlegen.** Skill fragt nach der ID, oder verweist auf `web.mentolder.de/admin/bugs` zum Anlegen. Kein Ticket → kein Fix-Pfad.
2. **Bug reproduzieren mit failing Test** (red — beweist dass der Bug existiert). Pflicht laut `superpowers:test-driven-development`.
3. **Plan.** Kurzer Plan via `superpowers:writing-plans` für nicht-triviale Fixes; inline Reasoning OK für Einzeiler.
4. **Fix** bis der neue Test grün ist und `task test:all` grün bleibt.
5. **PR erstellen.** Titel: `fix(<scope>): <zusammenfassung>`. Body enthält `Closes BR-YYYYMMDD-xxxx`. Skill verifiziert dass die Ticket-Referenz vorhanden ist bevor gepusht wird.
6. **Auto-Merge** sobald CI grün ist.
7. **Post-Merge:** Deploy + Verifikation (Sektion 3).

### Section: Chore path

1. **Chore in einem Satz beschreiben** (Dep-Bump, Rename, Kommentar-Cleanup, Config-Tweak).
2. **Änderung machen** — kein Plan/Spec nötig.
3. **Verifikation.** `task test:all` MUSS grün sein. Wenn Manifests betroffen: zusätzlich `task workspace:validate`. Wenn `website/src/` betroffen: zusätzlich `task website:dev` Smoke.
4. **PR erstellen.** Titel: `chore(<scope>): <zusammenfassung>`. Body: `## Summary` (1-2 Bullets), `## Test plan` (was gelaufen ist).
5. **Auto-Merge** sobald CI grün ist.
6. **Post-Merge:** Deploy + Verifikation (Sektion 3) — nur wenn Diff Dateien in deploy-relevanten Pfaden berührt hat.

### Section: Post-Merge — Deploy + Verifikation

Skill diff-t die Dateipfade des gemergten PR gegen folgende Tabelle und führt den passenden Task aus:

| Geänderte Dateien | Task | Verify URL / Task |
|---|---|---|
| `website/src/**`, `website/public/**`, `website/package*.json` | `task feature:website` | `https://web.mentolder.de` + `https://web.korczewski.de` |
| `brett/**` | `task feature:brett` | `https://brett.mentolder.de` + `https://brett.korczewski.de` |
| `docs-site/**`, `docs-content` ConfigMap | `task docs:deploy` | `https://docs.mentolder.de` |
| `k3d/livekit*.yaml`, `k3d/livekit-*` | `task feature:livekit` | `task livekit:status ENV=<env>` auf beiden |
| `k3d/**`, `prod/**`, `prod-mentolder/**`, `prod-korczewski/**`, `environments/sealed-secrets/**` | `task feature:deploy` | `task workspace:verify:all-prods` |
| Nur `docs/`, `*.md`, `CLAUDE.md`, `tests/`, `.github/`, `Taskfile*.yml`, `scripts/`, `.claude/` | kein Deploy | keine Verify |

Bei mehreren Treffern in dieser Reihenfolge: workspace → website → brett → livekit → docs.

**Verify-Regeln:**
- Website/brett/docs: Live-URL öffnen und geänderten Bereich prüfen. Bei Copy/Visual-Änderungen Screenshot via Playwright. Bei funktionalen Änderungen relevante `./tests/runner.sh local <FA-ID>` gegen Live-URL laufen lassen.
- Workspace: `task workspace:verify:all-prods` + `task health`.
- Verify scheitert → KEINEN Fix auf `main` versuchen. Skill öffnet sofort einen neuen Fix-Pfad-Branch und benachrichtigt Patrick.

### Section: PR-Konventionen

**Titel:** `<type>(<scope>): <imperative summary>`
- `<type>` ∈ {`feat`, `fix`, `chore`} (passt zum gewählten Pfad)
- `<scope>` kurz (z.B. `website`, `arena`, `infra`, `deps`, `db`, `ci`, `docs`)
- `<summary>` Imperativ Präsens, kein Punkt am Ende, erstes Wort klein

**Body-Template:**
```markdown
## Summary
- <warum diese Änderung existiert, 1-3 Bullets>

## Test plan
- [x] task test:all
- [x] task workspace:validate          # wenn Manifests geändert
- [x] ./tests/runner.sh local FA-XX    # falls relevant
- [x] manueller Check auf web.mentolder.de  # falls user-sichtbar

Closes BR-YYYYMMDD-xxxx   <!-- nur Fix-Pfad; Skill blockiert Push wenn fehlt -->

Co-Authored-By: <model>
```

### Section: Failure-Handling

- **CI rot** → nicht mergen. Diagnose, Fix auf demselben Branch, neu pushen. Keinen zweiten PR aufmachen.
- **Deploy scheitert post-merge** → Loggen, Patrick benachrichtigen, Cluster wie ist lassen (kein Auto-Rollback). User entscheidet.
- **Verify scheitert post-merge** → Neuen `fix/<slug>` Branch via Fix-Pfad. Regression als Bug behandeln.

### Section: Agent-Routing

Jeder Pfad delegiert an die CLAUDE.md Agent-Routing-Tabelle:
- DB-Arbeit → `bachelorprojekt-db`
- Manifests/Infra → `bachelorprojekt-infra`
- Live-Cluster-Operations → `bachelorprojekt-ops`
- Tests → `bachelorprojekt-test`
- Website-UI → `bachelorprojekt-website`
- Secrets/Keycloak/OIDC → `bachelorprojekt-security`

**Wichtig:** Vor jedem Agent-Dispatch muss `bash scripts/plan-context.sh <role>` laufen und die Ausgabe in `<active-plans>` Tags an den Prompt vorangestellt werden (siehe CLAUDE.md).

## Out of scope

- **Sub-agents pro Pfad anpassen.** Skill verlässt sich auf bestehende `bachelorprojekt-*` Agent-Routing in CLAUDE.md.
- **Hooks für automatische Skill-Invokation.** Auto-Invoke geschieht durch das `description` Frontmatter — keine zusätzliche Hook-Konfiguration.
- **Eigene Tests/CI für die Skill-Datei.** Skill ist Markdown; CI prüft sie nicht. Drift wird durch Nutzung erkannt.
- **Migration bestehender PRs.** Skill gilt für neue Arbeit ab Merge. Offene PRs/Branches dürfen nach altem Stil weiterlaufen.
- **Übersetzung der `superpowers:*` Skills selbst.** Die delegierten Skills bleiben Englisch; nur dev-flow ist Deutsch. gekko liest die referenzierten Skills via Claude (der übersetzt im Kontext).

## Risks

- **gekko ignoriert die Pfad-Bestätigung.** Mitigation: Pfad-Vorschlag zeigt klar warum (z.B. "neue UI-Sektion → feature"). Falls falsch klassifiziert: jederzeit Pfad-Wechsel via neuer Skill-Invokation möglich.
- **CI-grüner Auto-Merge maskiert Probleme die Tests nicht abdecken.** Mitigation: Live-Verify-Schritt nach Deploy fängt das auf produktion-relevanten Wegen.
- **Drift zwischen dev-flow und superpowers Updates.** Mitigation: Thin orchestrator delegiert maximal — wenn `superpowers:writing-plans` sich ändert, ändert sich auch der Feature-Pfad ohne dev-flow-Änderung.
- **Worktree-Pfade verstopfen Disk.** Mitigation: `commit-commands:clean_gone` läuft nach jedem Merge (Teil des bestehenden Workflows).

## Implementation plan handoff

Implementation plan wird in `docs/superpowers/plans/2026-05-13-dev-flow-skill.md` geschrieben (via `superpowers:writing-plans`). Plan deckt:
1. SKILL.md-Datei schreiben (`.claude/skills/dev-flow/SKILL.md`)
2. Plan-Frontmatter-Hook drauf laufen lassen
3. CLAUDE.md updaten — kurzer Hinweis dass dev-flow den Standard-Workflow definiert
4. Test: Skill in einer Sandbox-Session invokieren, prüfen dass Pfad-Vorschlag korrekt funktioniert
5. PR via Chore-Pfad mergen
