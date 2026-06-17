---
title: dev-flow Pipeline-Friction Verbesserungen (aus T000924-Erfahrung)
date: 2026-06-16
slug: dev-flow-pipeline-friction-improvements
ticket_id: T000925
domains: [dev-flow, ci, scripts]
status: draft
---

# dev-flow Pipeline-Friction — Verbesserungen aus Erfahrung

Beim Durchziehen von **T000924** (reichere Cockpit-Vorschläge, PR #1793) von
dev-flow-plan bis Auto-Merge sind drei vermeidbare Reibungspunkte aufgetreten,
die je einen CI-/Commit-Zyklus gekostet haben. Dieser Plan macht sie strukturell
unmöglich bzw. selbst-heilend.

## Friction 1 — git-crypt Clean-Filter ließ `git commit` im Worktree fehlschlagen (silent)

**Beobachtung:** Im via `scripts/worktree-create.sh` angelegten Worktree brach
`git commit` mit `fatal: deploy/mcp/claude-code-secrets.yaml: clean filter
'git-crypt' failed` ab — obwohl das Skript git-crypt „behandeln" soll. Der
nachfolgende `git push` lief (nicht mit `&&` verkettet) trotzdem und pushte nur
den Basis-Stand. Erst `git config --local filter.git-crypt.{clean,smudge} cat`
im Worktree machte Commits möglich.

**Warum kritisch:** Der Commit-Fehlschlag war still (das `&& echo committed`
blieb aus, ging aber im Output unter), und der Branch sah „gepusht" aus, enthielt
aber keinen Inhalt. Das ist eine klassische „passed-locally"-Falle.

**Fix (Ansatz):**
1. `scripts/worktree-create.sh` MUSS, wenn git-crypt **gesperrt** ist, die Filter
   im neuen Worktree-gitdir auf Identity neutralisieren
   (`git config --local filter.git-crypt.clean cat` + `smudge cat` +
   `filter.git-crypt.required false`) — nicht nur beim entsperrten Key-Copy-Pfad.
2. dev-flow-plan/-execute Commit-Step: nach `git commit` **verifizieren**, dass der
   Commit landete (`git rev-parse HEAD` ≠ Basis), bevor gepusht wird; sonst hart
   abbrechen mit Hinweis statt „leer" zu pushen.

## Friction 2 — PR-Titel-Scope nicht in der semantic-PR-Allowlist (`cockpit`)

**Beobachtung:** PR-Titel `feat(cockpit): …` failte den Required-Check
„Conventional Commits", weil `cockpit` nicht in der Scope-Allowlist von
`amannn/action-semantic-pull-request` steht (erlaubt sind u. a. website, admin,
brett, infra, db, factory, …). Korrekt war `feat(admin): …`.

**Fix (Ansatz):** dev-flow Pre-Flight vor `gh pr create`: PR-Titel-Scope gegen die
in `ci.yml` gepflegte Allowlist prüfen (Liste aus dem Workflow grep-en, Scope aus
dem Titel extrahieren, bei Mismatch warnen + Vorschlag). Verhindert einen ganzen
CI-Zyklus.

## Friction 3 — `Conventional Commits`-Job triggert nicht auf `edited`

**Beobachtung:** Nach Korrektur des PR-Titels blieb der Check rot, weil der
`pull_request`-Trigger in `ci.yml` nur `[opened, synchronize, reopened]` umfasst
(kein `edited`). Erst ein Leer-Commit (`--allow-empty`, `synchronize`) ließ den
Check den neuen Titel lesen.

**Fix (Ansatz):** Entweder
(a) `edited` zu den `pull_request`-Typen des Titel-validierenden Jobs hinzufügen
    (sauberste Lösung — Titel-Fix re-validiert ohne Leer-Commit), oder
(b) den Titel zuverlässig schon bei `gh pr create` korrekt setzen (siehe Friction 2),
    sodass nie nachträglich editiert werden muss.
Empfehlung: **beide** — (a) als Sicherheitsnetz, (b) als Primärfix.

## Nebenbefund — `gh pr edit --title` scheitert still an Projects-Classic-GraphQL

`gh pr edit --title` brach an einer `repository.pullRequest.projectCards`-GraphQL-
Deprecation ab (Titel unverändert). `gh api -X PATCH repos/.../pulls/<n> -f title=…`
(REST) funktioniert. → dev-flow sollte Titel-Edits über REST machen.

## Akzeptanzkriterien (für die Umsetzung)

- [ ] `worktree-create.sh` neutralisiert git-crypt-Filter auch im gesperrten Zustand; ein Commit im frischen Worktree gelingt ohne manuelles `git config`.
- [ ] dev-flow Commit-Step bricht ab, wenn der Commit nicht landete (Verifikation vor Push).
- [ ] Pre-Flight prüft den PR-Titel-Scope gegen die Allowlist vor `gh pr create`.
- [ ] `ci.yml` validiert den PR-Titel auch auf `edited`.
- [ ] dev-flow nutzt `gh api -X PATCH` für Titel-Edits.

## Nicht-Ziele

- Keine Änderung am Branch-Protection-Required-Set.
- Keine Lockerung der git-crypt-Verschlüsselung (nur Worktree-lokale Filter-Neutralisierung der bereits verschlüsselten Blobs).
