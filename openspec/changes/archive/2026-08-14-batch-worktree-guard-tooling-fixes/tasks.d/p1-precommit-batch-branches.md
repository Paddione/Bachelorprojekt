# Partial p1 — Pre-Commit-Allowlist: feat/batch-* (T004261)

Rolle: **impl** · Ticket: T004261 (Kind von T004295) · Design D1 (User-Entscheidung
2026-08-14). Der Pre-commit-Hook `.githooks/pre-commit` lehnt die Factory-Standard-
Batch-Branches (`feat/batch-*`, z. B. `feat/batch-worktree-guard-tooling-fixes-T004295`)
ab — jeder Commit auf einem Batch-Branch braucht den manuellen Bypass
`SKIP_BRANCH_CHECK=1`. Der Fix erweitert die Typ-Allowlist um NUR das Batch-Muster
`^feat/batch-`; generelles `feat/` bleibt verboten, damit keine ungewollten
Branch-Konventionen einsickern (D1-Trade-off).

**Scope-Grenze (bewusst):** Der Namens-Guard in `scripts/worktree-create.sh`
(Z. 108, gleiche Meldung) bleibt unverändert — D1 und die Proposal-What-Tabelle
adressieren nur `.githooks/pre-commit` + `CLAUDE.md`; die Factory legt ihre
Batch-Worktrees nicht über den Namens-Guard an (bzw. mit Bypass). Keine
Textgleichheits-Drifts mehr zwischen den beiden (T002817: gemeinsame Quelle nur für
die Ticketlos-Exemptions), deshalb ist die einseitige Erweiterung safe.

## S1-Budget (B1a)

Beide Dateien sind S1-ungated: kein Extension-Limit-Eintrag in
`docs/code-quality/gates.yaml` (`s1.limits` deckt `.sh/.bash/.ts/…` ab, weder
Extension-lose Dateien noch `.md`) und nicht in `docs/code-quality/baseline.json`
erfasst. `bash scripts/plan-lint.sh residual_budget <pfad>` liefert für beide einen
leeren Wert — es wird keine Zahl behauptet, der Budget-Wert ist n/a.

| Datei | Ist (wc -l) | Budget (S1) |
|---|---|---|
| `.githooks/pre-commit` | 230 | n/a (ungated, unbaselined) |
| `CLAUDE.md` | 275 | n/a (ungated, unbaselined) |

## Task P1.1 — RED: Failing-Test als Ausgangspunkt (Aufwand ~0,25h)

Referenz: Der Failing-Test entsteht im Tests-Partial p6 als
`tests/spec/batch-worktree-guard-tooling-fixes/precommit-accepts-batch-branches.bats`
(führt den Hook in einer temp Git-Kopie mit Branch `feat/batch-demo-T003123` aus;
Positiv-Anker: `experiment/foo` bleibt abgelehnt).

- [ ] Testrunner-Aufruf, falls die p6-Datei schon vorliegt:
      `tests/unit/lib/bats-core/bin/bats tests/spec/batch-worktree-guard-tooling-fixes/precommit-accepts-batch-branches.bats`
      → `expected: FAIL` — der Hook lehnt `feat/batch-demo-T003123` heute ab (Exit 1),
      der Test erwartet Exit 0.
- [ ] Solange die p6-Datei noch nicht existiert (p6 läuft im Batch zuletzt), dasselbe
      Szenario manuell reproduzieren (Setup wie in `tests/spec/ci-cd/branch-allowlist-ssot.bats`:
      temp Git-Kopie mit `.githooks/pre-commit` + Stubs für die vorgelagerten
      Repo-Skripte, `core.hooksPath`, `FRESHNESS_HOOK_DISABLED=1`, `SKIP_BONSAI_GUARD=1`):
      Branch `feat/batch-demo-T003123` anlegen, Commit ohne `--no-verify` → Exit 1 mit
      `kein gueltiges Typ-Praefix` in stderr → `expected: FAIL` (RED-Nachweis,
      Output-Verifikation nach T002448-M4).
- [ ] Positiv-Anker gegenprüfen (T002356-M1): Branch `experiment/foo` in derselben
      temp Kopie → ebenfalls Exit 1. Der Test misst damit echtes Hook-Verhalten statt
      einer leeren Kandidatenliste.

## Task P1.2 — Hook-RegEx um das Batch-Muster erweitern (Aufwand ~0,25h)

Datei: `.githooks/pre-commit` (einzige Branch-Typ-Prüfung Z. 166; Fehlermeldung Z. 178)

- [ ] Z. 166 erweitern — ausschließlich das Batch-Muster ergänzen:
      `[[ "$_bn" =~ ^feature/|^fix/|^chore/|^docs/|^feat/batch- ]]`.
      Ein generelles `feat/` (z. B. `feat/demo-T003123`) muss weiterhin abgelehnt
      werden — erlaubt ist nur das Präfix `feat/batch-`.
- [ ] Z. 178 Fehlermeldung anpassen (sie nennt die erlaubten Muster):
      `✗ kein gueltiges Typ-Praefix. Erlaubt: feature/ fix/ chore/ docs/ feat/batch-*`
      (stderr; kein bestehender Test greppt den exakten Wortlaut — geprüft am
      2026-08-14, `grep -rn 'Erlaubt: feature' tests/` → kein Treffer).
- [ ] Ticket-Pflicht unverändert lassen (Z. 167 `T[0-9]{6,}`, case-sensitiv): ein
      `feat/batch-*`-Branch ohne Ticket-ID bleibt abgelehnt — gelockert wird nur die
      Typ-Bedingung, nicht die Ticket-Bedingung.
- [ ] `bash -n .githooks/pre-commit` — keine Syntaxfehler.

## Task P1.3 — CLAUDE.md Rule 7 ergänzen (Aufwand ~0,25h)

Datei: `CLAUDE.md` (Z. 209, Development Rule 7)

- [ ] `7. Branch naming: feature/*, fix/*, chore/*` um das Batch-Muster ergänzen:
      `7. Branch naming: feature/*, fix/*, chore/* (Factory-Batch-Ausnahme: feat/batch-*)`
      — die Factory-Standard-Branches `feat/batch-*-T00XXXX` sind damit dokumentiert
      erlaubt und die Doku spiegelt die Hook-Allowlist (T002261-Muster: Regel und
      Guard halten sich synchron).

## Task P1.4 — GRÜN-Verifikation (Aufwand ~0,5h)

- [ ] p6-Guard-Set des Changes ausführen:
      `tests/unit/lib/bats-core/bin/bats -r tests/spec/batch-worktree-guard-tooling-fixes/`
      → grün, inklusive `precommit-accepts-batch-branches.bats` (der zuvor rote Test
      läuft jetzt durch).
- [ ] Direkter Hook-Lauf in temp Git-Kopie (Setup wie P1.1): Branch
      `feat/batch-demo-T003123` → Exit 0, ohne `SKIP_BRANCH_CHECK=1`
      (Output-Verifikation des Commit-Erfolgs).
- [ ] Negativ-Kontrollen im selben Lauf: `feat/demo-T003123` (ohne `batch-`) → Exit 1;
      `experiment/foo` → Exit 1 — der Positiv-Anker des p6-Tests bleibt scharf und
      `feat/` bleibt generell verboten (D1-Trade-off).
- [ ] Bestands-Guards unangetastet: `tests/unit/lib/bats-core/bin/bats -r
      tests/spec/ci-cd/branch-allowlist-ssot.bats tests/spec/divergence-guard/branch-name-guard.bats`
      → grün (keine Drift durch die einseitige Erweiterung).
