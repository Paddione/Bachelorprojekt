---
title: Implementierungsplan — dev-flow Pipeline-Friction beheben [T000925]
ticket_id: T000925
domains: [website, infra, test, security]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Implementierungsplan — dev-flow Pipeline-Friction beheben [T000925] — Implementation Plan

> Spec: `docs/superpowers/specs/2026-06-16-dev-flow-pipeline-friction-improvements.md`
> Ticket: T000925 · Branch: `feature/t000925`

## Ziel

Drei aus T000924/PR#1793 beobachtete Reibungspunkte in der dev-flow-Pipeline
strukturell unmöglich bzw. selbst-heilend machen, ohne das Branch-Protection-
Required-Set oder die git-crypt-Verschlüsselung zu lockern:

1. **git-crypt commit-silent-fail** — `git commit` im frischen Worktree schlägt am
   `clean`-Filter still fehl; der nicht mit `&&` verkettete `git push` pusht dann
   einen leeren Branch.
2. **PR-Titel-Scope-Preflight** — Scope `cockpit` fehlte in der semantic-PR-Allowlist;
   ein ganzer CI-Zyklus ging verloren, bis der Titel auf einen erlaubten Scope
   korrigiert war.
3. **`ci.yml` `edited`-Trigger** — der Conventional-Commits-Job re-validiert einen
   korrigierten PR-Titel nicht (kein `edited` im `pull_request`-Trigger), erst ein
   Leer-Commit half. Plus: `gh pr edit --title` scheitert still an Projects-Classic-
   GraphQL → REST-`PATCH`-Fallback.

## File Structure

(Architektur & betroffene Dateien)

| Datei | Art | S1-Budget |
|---|---|---|
| `scripts/worktree-create.sh` | ändern (Friction 1) | `.sh` Limit 500 · Ist 106 · nicht-baselined → Budget ~394, unkritisch |
| `scripts/preflight-pr-scope.sh` | **neu** (Friction 2) | `.sh` Limit 500 · Ziel <120 Zeilen → Wachstumsreserve groß |
| `.github/workflows/ci.yml` | ändern (Friction 3) | `.yml` — nicht S1-gegatet (kein Code-Extension) · Ist 253 |
| `.claude/skills/dev-flow-execute/SKILL.md` | ändern (alle drei) | `.md` — nicht S1-gegatet |
| `.claude/skills/dev-flow-chore/SKILL.md` | ändern (Commit-Verify + REST-Edit) | `.md` — nicht S1-gegatet |
| `tests/unit/worktree-create.bats` | erweitern (Friction 1) | nicht S1-gegatet |
| `tests/unit/preflight-pr-scope.bats` | **neu** (Friction 2) | nicht S1-gegatet |
| `Taskfile.yml` | ändern (neuen Test verdrahten) | nicht S1-gegatet |

**Quality-Gates-Notiz (S1–S4):**
- **S1:** Einzige neue Code-Datei ist `scripts/preflight-pr-scope.sh` (`.sh`, Limit 500);
  Zielgröße deutlich unter 80 % → kein Modul-Split nötig. Geänderte `worktree-create.sh`
  bleibt mit +~6 Zeilen weit unter 500. Kein Code-Wachstum über Baseline (beide
  nicht-baselined).
- **S2:** `preflight-pr-scope.sh` ist ein **pures Bash-Helper** ohne Import in
  TS-/DB-/API-Graphen — keine Zyklen.
- **S3:** Keine Brand-Domain-Literale; das Skript liest die Scope-Allowlist
  **dynamisch aus `ci.yml`** (kein Hardcoding der Liste). Keine `*.mentolder.de`/
  `*.korczewski.de`-Strings.
- **S4:** `scripts/preflight-pr-scope.sh` wird von `dev-flow-execute`/`-chore`-SKILL
  referenziert **und** über einen neuen BATS-Test in `Taskfile.yml`
  (`test:unit:preflight-pr-scope`, eingehängt in `test:all`) erreichbar → kein Orphan.

## Tech-Stack

Bash (POSIX-nah, `set -euo pipefail` wie die übrigen `scripts/*.sh`), GitHub-Actions-
YAML, BATS-Unit-Tests, `gh`/`git` CLI. Keine neuen Laufzeit-Abhängigkeiten.

---

## Tasks

### Task 1 — Friction 1: git-crypt clean-Filter im Worktree wirklich neutralisieren (TDD)

Root-Cause: Im **unlocked** Pfad (`scripts/worktree-create.sh` Z. 69–73) kopiert das
Skript zwar den git-crypt-Key, lässt aber `filter.git-crypt.required`/`clean` aktiv.
Bei einer git-crypt-verwalteten Datei (z. B. `deploy/mcp/claude-code-secrets.yaml`)
kann der `clean`-Filter beim `git commit` im Worktree-gitdir fehlschlagen
(`fatal: … clean filter 'git-crypt' failed`) — still, weil dev-flow danach
unverkettet pusht. Der **locked** Pfad (Z. 75–83) neutralisiert bereits korrekt.

- [ ] **Test zuerst:** In `tests/unit/worktree-create.bats` einen Fall ergänzen, der
  nach `worktree-create.sh` im erzeugten Worktree prüft, dass ein `git commit` einer
  git-crypt-verwalteten Pfad-Änderung gelingt (bzw. dass `filter.git-crypt.required`
  im Worktree-gitdir `false` und `filter.git-crypt.clean`/`smudge` auf `cat` stehen) —
  **für beide** Pfade (locked und unlocked-mit-Key-Fixture). Test ausführen und
  scheitern sehen (expected: fail) — der unlocked-Pfad ist noch nicht gehärtet.
- [ ] In `scripts/worktree-create.sh` den **unlocked** Pfad härten: nach dem Key-Copy
  und vor/nach `git -C "$WT_PATH" checkout` die `--worktree`-Filter-Neutralisierung
  (`extensions.worktreeConfig true`, `filter.git-crypt.clean cat`,
  `filter.git-crypt.required false`) **ebenfalls** setzen — der `smudge`-Filter darf
  im unlocked Pfad echt entschlüsseln (Key vorhanden), aber `clean`/`required` dürfen
  Commits nicht blockieren. Alternativ den gemeinsamen Neutralisierungs-Block in eine
  lokale Funktion `_neutralize_git_crypt_clean()` extrahieren und in beiden Zweigen
  aufrufen (DRY, hält die Datei klein).
- [ ] Verifizieren: Test grün; `bash scripts/worktree-create.sh <tmp-branch> <tmpdir>`
  in einem Wegwerf-Pfad, dann dort `git commit --allow-empty` + eine reale Datei-
  Änderung committen → Exit 0.
- [ ] **Akzeptanzkriterium:** Ein Commit im frischen Worktree gelingt ohne manuelles
  `git config filter.git-crypt.clean cat`.

### Task 2 — Friction 1 (Sicherheitsnetz): Commit-Verify-vor-Push in dev-flow

- [ ] In `.claude/skills/dev-flow-execute/SKILL.md` (Schritt 5 „PR erstellen", Z. ~449)
  und `.claude/skills/dev-flow-chore/SKILL.md` (Commit-Step, Z. ~90) den Commit-Step so
  formulieren, dass **nach** `git commit` verifiziert wird, dass der HEAD vom Basis-Stand
  abweicht, **bevor** gepusht wird. Snippet-Muster (mit `&&`-Verkettung statt zwei
  unverketteter Zeilen):
  ```bash
  BASE_SHA="$(git rev-parse "@{upstream}" 2>/dev/null || git rev-parse origin/main)"
  git add -A
  git commit -m "<type>(<scope>): <subject> [<TICKET_ID>]"
  HEAD_SHA="$(git rev-parse HEAD)"
  if [ "$HEAD_SHA" = "$BASE_SHA" ]; then
    echo "FATAL: commit landete nicht (git-crypt clean-Filter?). Push abgebrochen." >&2
    exit 1
  fi
  git push -u origin "$(git rev-parse --abbrev-ref HEAD)"
  ```
- [ ] Dokumentieren, warum (Verweis auf Friction 1) — der unverkettete `commit`/`push`
  war die „passed-locally"-Falle.
- [ ] **Akzeptanzkriterium:** dev-flow Commit-Step bricht ab, wenn der Commit nicht landete.

### Task 3 — Friction 2: PR-Titel-Scope-Preflight-Helper (`scripts/preflight-pr-scope.sh`) (TDD)

Pures Bash-Helper, das **vor** `gh pr create` den Scope aus dem geplanten PR-Titel gegen
die in `ci.yml` gepflegte semantic-PR-Allowlist prüft. Liest die Allowlist **dynamisch**
aus dem Workflow (kein Hardcoding) → bleibt automatisch synchron, wenn die Liste wächst.

- [ ] **Test zuerst:** `tests/unit/preflight-pr-scope.bats` neu anlegen:
  - gültiger Scope (`feat(admin): …`) → Exit 0,
  - ungültiger Scope (`feat(cockpit): …`) → Exit ≠ 0 + Vorschlags-/Fehlermeldung mit
    der Liste der erlaubten Scopes,
  - Titel ohne Scope (`docs: …`) → Exit 0 (scope-los ist erlaubt),
  - Allowlist wird aus einer Fixture-`ci.yml` gelesen (Pfad als Arg/Env überschreibbar,
    damit der Test nicht von der echten `ci.yml` abhängt).
- [ ] `scripts/preflight-pr-scope.sh` neu schreiben (`set -euo pipefail`):
  - Arg 1 = PR-Titel; optional `CI_WORKFLOW` (Default `.github/workflows/ci.yml`).
  - Scope per Regex aus dem Titel extrahieren: `^[a-z]+\(([a-z0-9-]+)\):`.
  - Allowlist aus dem `scopes: |`-Block der `commit-lint`-Job-`with`-Sektion in `ci.yml`
    parsen (awk/sed über den eingerückten Block bis zur nächsten Schlüssel-/Dedent-Zeile).
  - Kein Scope im Titel → Exit 0 (semantic-PR erlaubt scope-lose Titel).
  - Scope ∈ Allowlist → Exit 0; sonst Exit 1 + `echo` der erlaubten Scopes (Vorschlag).
  - **Keine Brand-Domain-Literale**, keine hartkodierte Scope-Liste.
- [ ] In `Taskfile.yml` `test:unit:preflight-pr-scope` analog zu
  `test:unit:worktree-create` (Z. ~504) anlegen und in den `test:all`-/`test:unit`-
  Aggregator einhängen (S4: Skript wird über Test erreichbar).
- [ ] In `dev-flow-execute`/`-chore`-SKILL **vor** `gh pr create` einen Schritt
  ergänzen: `bash scripts/preflight-pr-scope.sh "<geplanter PR-Titel>"` — bei Exit ≠ 0
  Titel korrigieren, **bevor** der PR angelegt wird.
- [ ] **Akzeptanzkriterium:** Preflight prüft den PR-Titel-Scope gegen die Allowlist vor `gh pr create`.

### Task 4 — Friction 3a: `ci.yml` Conventional-Commits-Job auf `edited` re-validieren

- [ ] In `.github/workflows/ci.yml` den `commit-lint`-Job (Z. ~180) so erweitern, dass
  der PR-Titel auch bei `edited` re-validiert wird. Da der Workflow aktuell **keinen**
  expliziten `pull_request: types:`-Filter hat (nur `branches`/`paths-ignore`) und der
  Default `[opened, synchronize, reopened]` ist, den `commit-lint`-Job mit einer
  **job-lokalen** `if`-Bedingung absichern und einen `edited`-Trigger ergänzen. Saubere
  Variante: einen separaten `pull_request_target`/`pull_request`-Event-Eintrag mit
  `types: [opened, synchronize, reopened, edited]` ist hier nicht möglich ohne den
  globalen Trigger zu verbreitern → stattdessen den **globalen** `on.pull_request` um
  `types: [opened, synchronize, reopened, edited]` ergänzen und sicherstellen, dass die
  übrigen Jobs (Offline/Vitest/Security) durch ihre vorhandenen `if`-Guards bzw. den
  `paths-ignore`-Filter von rein-`edited`-Läufen nicht unnötig laufen.
  - **Prüfen:** Welche Jobs würden durch ein reines `edited`-Event zusätzlich laufen?
    Falls unerwünscht (Kosten), die teuren Jobs mit
    `if: github.event.action != 'edited'` absichern und nur `commit-lint` ohne diesen
    Guard lassen. Entscheidung im Plan-Review festhalten; Default: nur `commit-lint`
    läuft auf `edited`, alle anderen Jobs bekommen `if: github.event.action != 'edited'`
    (additiv zu bestehenden `if`).
- [ ] `task workspace:validate` ist hier irrelevant (kein k8s-Manifest) — stattdessen
  YAML-Syntax lokal mit `yamllint .github/workflows/ci.yml` (falls vorhanden) sowie
  `actionlint` (falls verfügbar) prüfen.
- [ ] **Akzeptanzkriterium:** `ci.yml` validiert den PR-Titel auch auf `edited` (Titel-Fix
  re-validiert ohne Leer-Commit).

### Task 5 — Friction 3b (Nebenbefund): `gh pr edit --title` → REST-`PATCH`-Fallback in dev-flow

- [ ] In `.claude/skills/dev-flow-execute/SKILL.md` und `.claude/skills/dev-flow-chore/SKILL.md`
  alle Hinweise auf `gh pr edit --title` durch den REST-Fallback ersetzen bzw. ergänzen:
  ```bash
  # gh pr edit --title scheitert an Projects-Classic-GraphQL-Deprecation → REST PATCH:
  gh api -X PATCH "repos/{owner}/{repo}/pulls/<n>" -f title="<neuer Titel>"
  ```
  (mit `{owner}/{repo}`-Platzhaltern bzw. `$(gh repo view --json nameWithOwner -q .nameWithOwner)`),
  und auf den Preflight (Task 3) verweisen, sodass Titel-Edits idealerweise gar nicht nötig sind.
- [ ] **Akzeptanzkriterium:** dev-flow nutzt `gh api -X PATCH` für Titel-Edits.

### Task 6 — Finale Verifikation (Pflicht-Gates)

- [ ] `task test:changed` — gezielte Tests für die geänderten Domains (inkl. der neuen/
  erweiterten BATS-Tests `worktree-create.bats`, `preflight-pr-scope.bats`).
- [ ] `task freshness:regenerate` — generierte Artefakte aktualisieren (test-inventory,
  repo-index). Falls `git diff --name-only` generierte Indexdateien zeigt: mitcommitten.
- [ ] `task freshness:check` — CI-Äquivalent: Freshness + `quality:check` (S1–S4-Ratchet)
  + Baseline-Key-Count-Assertion. Muss grün sein.
- [ ] `task test:all` — voller Offline-Gate-Lauf (BATS inkl. neuem
  `test:unit:preflight-pr-scope`, Kustomize-Struktur, Taskfile-Dry-Run).
- [ ] Sicherstellen, dass `docs/code-quality/baseline.json` **nicht** wächst (keine neuen
  Keys) und `website/src/data/test-inventory.json` nach Test-Änderungen regeneriert und
  mitcommittet ist.
- [ ] Manuelle Smoke-Probe: frischen Worktree anlegen, dort committen (Friction 1 fix),
  `scripts/preflight-pr-scope.sh "feat(cockpit): x"` → Exit 1 mit Vorschlag,
  `scripts/preflight-pr-scope.sh "feat(admin): x"` → Exit 0.

## Nicht-Ziele

- Keine Änderung am Branch-Protection-Required-Set.
- Keine Lockerung der git-crypt-Verschlüsselung — nur Worktree-lokale Filter-
  Neutralisierung der bereits verschlüsselten Blobs.
- Keine Verbreiterung der semantic-PR-Allowlist um `cockpit` (der korrekte Scope war
  `admin`); der Preflight macht den Fehler nur früh sichtbar.
