---
title: "pr-scope-drift — Implementation Plan"
ticket_id: T001364
domains: [test, infra]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# pr-scope-drift — Implementation Plan

_Ticket: T001364_

## Context

Drei unabhängige Scope-Listen sind auseinandergedriftet (siehe
`docs/superpowers/specs/2026-07-01-pr-scope-drift-design.md`):
`commitlint.config.cjs` (behauptete SSOT), die hartcodierte `scopes:`-Liste im `commit-lint`-Job von
`.github/workflows/ci.yml`, und die validierungslose Branch-Namen-Ableitung in
`.github/workflows/pr-auto-title.yml`. `commitlint.config.cjs` wird zur einzigen tatsächlichen
Wahrheitsquelle, exponiert über `scripts/validate-commit-msg.sh scopes`.

**Zusätzlicher Befund (nicht im Design-Dokument, beim Plan-Schreiben entdeckt):** Ein vierter
Konsument existiert bereits — `scripts/preflight-pr-scope.sh` (genutzt von
`.claude/skills/git-workflow/SKILL.md` Schritt 4 vor jedem `gh pr create`). Es parst den
`scopes: |`-Block direkt aus `.github/workflows/ci.yml` per `awk`. Sobald Task 2 den hartcodierten
Block durch `scopes: ${{ steps.load-scopes.outputs.scopes }}` ersetzt, matcht dieser `awk`-Parser
nichts mehr (`scopes:` ist keine `|`-Block-Zeile mehr) → `preflight-pr-scope.sh` würde mit
„could not parse scope allowlist" (Exit 2) für **jede** zukünftige PR-Erstellung brechen. Das ist
eine reale Regression, die im Design-Dokument nicht abgedeckt ist. Dieser Plan behebt sie in Task 4
(Fallback auf die SSOT-Quelle), ohne die bestehende `tests/unit/preflight-pr-scope.bats` zu ändern
(die Tests übergeben eine Fixture-Datei mit echtem `scopes: |`-Block und bleiben dadurch unberührt
grün — der Fallback greift nur, wenn das Parsing der übergebenen/Default-Datei leer bleibt).

## File Structure

```
scripts/validate-commit-msg.sh          (geändert, +~18 Zeilen)   — neuer `scopes`-Modus
scripts/register-scope.sh                (neu, ~70 Zeilen)         — Scope-Registrierung, SSOT-Mutation
scripts/preflight-pr-scope.sh            (geändert, +~10 Zeilen)   — SSOT-Fallback bei leerem awk-Parse
.github/workflows/ci.yml                 (geändert, netto ~ -75 Zeilen) — dynamischer scopes-Load-Schritt
.github/workflows/pr-auto-title.yml      (geändert, +~10 Zeilen)   — checkout + SSOT-Validierung
.claude/skills/git-workflow/SKILL.md     (geändert, +~4 Zeilen)    — Doku-Hinweis register-scope.sh
tests/spec/t001356-git02-conventional-commit.bats  (bereits committed, unverändert — wird durch
                                                      diesen Plan grün gemacht)
```

## Pre-flight: Budget-Check pro Zieldatei

`docs/code-quality/baseline.json` enthält für keine der Zieldateien einen `S1:`-Eintrag (per
`jq -r '."S1:<pfad>".metric // "nicht-baselined"' docs/code-quality/baseline.json` verifiziert —
alle vier Antworten waren `nicht-baselined`). Es gilt das statische Extension-Limit.

| Datei | Extension-Limit | Ist (vor Änderung) | Geschätztes Delta | Ist (nach Änderung, ca.) | Budget-Fazit |
|---|---|---|---|---|---|
| `scripts/validate-commit-msg.sh` | 500 (`.sh`) | 170 | +18 | ~188 | weit unter Limit |
| `scripts/register-scope.sh` | 500 (`.sh`, neu) | 0 | +70 | ~70 | weit unter Limit |
| `scripts/preflight-pr-scope.sh` | 500 (`.sh`) | 53 | +10 | ~63 | weit unter Limit |
| `.github/workflows/ci.yml` | ungegated (`.yml` nicht in S1-Tabelle) | 433 | -75 (Inline-Liste entfällt) | ~358 | kein S1-Gate anwendbar |
| `.github/workflows/pr-auto-title.yml` | ungegated (`.yml`) | 122 | +10 | ~132 | kein S1-Gate anwendbar |
| `.claude/skills/git-workflow/SKILL.md` | ungegated (`.md`) | — | +4 | — | kein S1-Gate anwendbar |
| `commitlint.config.cjs` | 200 (`.cjs`) | 62 | 0 (nur zur Laufzeit durch `register-scope.sh` mutiert, nicht in diesem Plan) | 62 | weit unter Limit |

Kein Split/Extraktion nötig. Keine neue BATS-Datei → `task test:inventory` nicht erforderlich.
Keine Brand-Domain-Literale in den geplanten Snippets (S3 n/a — keine `k3d/`/`prod*/`/`website/src/`-Dateien betroffen).

## Task 1 — `validate-commit-msg.sh scopes`-Modus

**Datei:** `scripts/validate-commit-msg.sh`

Neuer Case-Zweig im `main()`-Dispatch (nach `message`, vor dem Default-`*)`-Fall):

```bash
    scopes)
      local scopes
      scopes="$(load_allowed_scopes)"
      if [ -z "$scopes" ]; then
        echo "validate-commit-msg: could not load scopes from $CONFIG" >&2
        exit 1
      fi
      # load_allowed_scopes() returns a space-joined string; emit one per line.
      printf '%s\n' $scopes
      exit 0
      ;;
```

Aktualisiere den Usage-Kommentar am Dateikopf (Zeilen 18-21) um die Zeile
`#   validate-commit-msg.sh scopes                 # print every allowed scope, one per line`.
Aktualisiere auch die finale `usage`-Fehlermeldung (Zeile ~164) um `scopes` zu erwähnen.

Kein Duplikat der Scope-Logik — nutzt die bestehende `load_allowed_scopes()`-Funktion (Zeilen 46-54)
unverändert.

**Failing-Test-Step (RED) für diesen Task:**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/t001356-git02-conventional-commit.bats \
  --filter "scopes: prints the allowed scope list, one per line"
# expected: FAIL — `scopes` mode does not exist yet on main/vor diesem Task
```

Nach der Implementierung müssen beide `scopes:`-Tests
(„prints the allowed scope list" und „output matches commitlint.config.cjs scope-enum exactly")
grün sein:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/t001356-git02-conventional-commit.bats \
  --filter "scopes:"
```

## Task 2 — `ci.yml`: `commit-lint`-Job lädt Scopes dynamisch

**Datei:** `.github/workflows/ci.yml`, Job `commit-lint` (aktuell Zeile ~289-433)

Neuer Schritt zwischen dem bestehenden `actions/checkout` (mit `fetch-depth: 0`) und dem
`amannn/action-semantic-pull-request`-Schritt:

```yaml
      - name: Load allowed scopes from commitlint.config.cjs
        id: load-scopes
        run: |
          {
            echo 'scopes<<SCOPES_EOF'
            bash scripts/validate-commit-msg.sh scopes
            echo 'SCOPES_EOF'
          } >> "$GITHUB_OUTPUT"
```

Der bisherige hartcodierte `scopes: |`-Block (der komplette, mehrzeilige `with.scopes`-Eintrag)
wird ersetzt durch eine einzelne Zeile:

```yaml
          scopes: ${{ steps.load-scopes.outputs.scopes }}
```

`types:` bleibt unverändert (Design-Spec: nur Scopes betroffen, keine Typänderung). Die driftende
Inline-Liste (inkl. der zusätzlichen `goals`/`openspec`/`mentolder-web`/`skills`/`quality`-Einträge
und dem fehlenden `arena`-Eintrag) entfällt vollständig — das war der eigentliche Drift-Bug.

**Verifikation:**

```bash
grep -q 'validate-commit-msg.sh scopes' .github/workflows/ci.yml
tests/unit/lib/bats-core/bin/bats tests/spec/t001356-git02-conventional-commit.bats \
  --filter "ci.yml commit-lint job loads scopes dynamically"
```

Zusätzlich lokal (kein CI-Netzwerkzugriff nötig): `bash scripts/validate-commit-msg.sh scopes`
muss non-leer laufen, damit der `$GITHUB_OUTPUT`-Block im echten Workflow-Run nicht leer bleibt.

## Task 3 — `pr-auto-title.yml`: Checkout + SSOT-Validierung

**Datei:** `.github/workflows/pr-auto-title.yml`

1. Neuer Schritt vor dem bestehenden `Check and fix PR title`-Schritt:

```yaml
      - name: Checkout
        uses: actions/checkout@93cb6efe18208431cddfb8368fd83d5badbf9bfd  # v5
        with:
          fetch-depth: 1
```

   (gleicher gepinnter SHA wie die anderen `actions/checkout`-Aufrufe im Repo — shallow reicht, nur
   `commitlint.config.cjs` und `scripts/validate-commit-msg.sh` werden gebraucht.)

2. Nach Abschnitt „── 3. Try to extract a scope from the slug ──" (aktuell Zeilen 88-99), vor
   Abschnitt „── 4. Build the subject …":

```bash
          # ── 3b. Validate the derived scope against the SSOT scope list ─────
          # Unregistered scopes must not be written into the title — fall back
          # to a scope-less title instead (T001364).
          if [[ -n "$SCOPE" ]]; then
            if ! bash scripts/validate-commit-msg.sh scopes | grep -qxF "$SCOPE"; then
              echo "⚠️  Derived scope '$SCOPE' is not registered — falling back to scope-less title."
              SCOPE=""
            fi
          fi
```

Das bestehende Verhalten für einen bereits validen Scope ändert sich nicht (Abschnitte 4-6 bleiben
unverändert — sie lesen weiterhin `$SCOPE`).

**Verifikation:**

```bash
grep -q 'actions/checkout' .github/workflows/pr-auto-title.yml
grep -q 'validate-commit-msg.sh scopes' .github/workflows/pr-auto-title.yml
tests/unit/lib/bats-core/bin/bats tests/spec/t001356-git02-conventional-commit.bats \
  --filter "pr-auto-title.yml"
```

## Task 4 — `scripts/register-scope.sh` (neu) + `preflight-pr-scope.sh`-Fallback

### 4a. Neues Skript `scripts/register-scope.sh`

```bash
#!/usr/bin/env bash
# register-scope.sh <scope> [--config <path>] — idempotently register a new
# scope in commitlint.config.cjs's scope-enum (the SSOT, T001364).
set -euo pipefail

SCOPE="${1:?Usage: register-scope.sh <scope> [--config <path>]}"
shift || true

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="$repo_root/commitlint.config.cjs"

while [ $# -gt 0 ]; do
  case "$1" in
    --config) CONFIG="$2"; shift 2 ;;
    *) echo "usage: register-scope.sh <scope> [--config <path>]" >&2; exit 2 ;;
  esac
done

if [[ ! "$SCOPE" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  echo "register-scope: invalid scope format '$SCOPE' (must match ^[a-z0-9][a-z0-9-]*$)" >&2
  exit 1
fi

[ -f "$CONFIG" ] || { echo "register-scope: config not found: $CONFIG" >&2; exit 2; }

if node -e "
  const cfg = require('$CONFIG');
  const scopes = cfg.rules['scope-enum'][2];
  process.exit(scopes.includes('$SCOPE') ? 0 : 1);
"; then
  echo "register-scope: scope '$SCOPE' is already registered — nothing to do" >&2
  exit 1
fi

# Text-line insert: find the array's closing bracket line and append a new
# line with matching indent/quoting directly before it. Avoids a full AST
# rewrite; preserves comments/formatting in the rest of the file.
node -e "
  const fs = require('fs');
  const path = '$CONFIG';
  const scope = '$SCOPE';
  const lines = fs.readFileSync(path, 'utf8').split('\n');
  const closeIdx = lines.findIndex((l) => l.trim() === ']');
  if (closeIdx === -1) { console.error('register-scope: could not find scope-enum array close'); process.exit(1); }
  const indent = lines[closeIdx - 1].match(/^\s*/)[0];
  lines.splice(closeIdx, 0, indent + \"'\" + scope + \"',\");
  fs.writeFileSync(path, lines.join('\n'));
"

echo "register-scope: added '$SCOPE' to $CONFIG"
exit 0
```

`chmod +x scripts/register-scope.sh`.

Hinweis zur Zeilen-Insert-Strategie: `commitlint.config.cjs` enthält im aktuellen Stand nur ein
einziges Array, das mit `]` endet (`scope-enum`-Array, Zeile ~59) — der einfache `l.trim() === ']'`-
Suchpfad ist deshalb eindeutig. Sollte künftig ein zweites Array-Ende in der Datei hinzukommen,
müsste dieser Suchpfad präzisiert werden — für diesen Plan reicht die einfache Variante, da die
Config aktuell nur ein Array besitzt.

### 4b. Fallback in `scripts/preflight-pr-scope.sh`

**Regression-Fix (siehe Kontext-Abschnitt oben):** wenn der `awk`-Parse aus der übergebenen/Default
`ci.yml` leer bleibt, auf die SSOT-Quelle zurückfallen, bevor der Exit-2-Fehlerpfad greift.

Ersetze den bestehenden Block:

```bash
if [ -z "$_allowed" ]; then
  echo "preflight-pr-scope: could not parse scope allowlist from '$CI_WORKFLOW'" >&2
  exit 2
fi
```

durch:

```bash
if [ -z "$_allowed" ]; then
  _ssot_script="$(dirname "$0")/validate-commit-msg.sh"
  if [ -x "$_ssot_script" ]; then
    _allowed="$("$_ssot_script" scopes 2>/dev/null || true)"
  fi
fi

if [ -z "$_allowed" ]; then
  echo "preflight-pr-scope: could not parse scope allowlist from '$CI_WORKFLOW' and SSOT fallback failed" >&2
  exit 2
fi
```

Dieser Fallback wird durch `tests/unit/preflight-pr-scope.bats` (bestehend, unverändert) NICHT
ausgelöst, da alle dortigen Testfälle eine Fixture mit echtem `scopes: |`-Block übergeben — der
`awk`-Parse liefert dort bereits ein nicht-leeres Ergebnis, der Fallback-Zweig wird nie erreicht.
Der Fallback greift ausschließlich im echten Repo-`ci.yml` nach Task 2 (kein literaler
`scopes: |`-Block mehr).

**Verifikation:**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/t001356-git02-conventional-commit.bats \
  --filter "register-scope.sh"
# expected: FAIL vor Task 4a — Skript existiert noch nicht

tests/unit/lib/bats-core/bin/bats tests/unit/preflight-pr-scope.bats
# muss weiterhin grün bleiben (Regressionscheck, keine Datei-Änderung an diesem Test)

# End-to-end Regression-Beweis für den Fallback (manuell, nicht Teil der BATS-Suite):
bash scripts/preflight-pr-scope.sh "feat(website): x"
# erwartet Exit 0 gegen die ECHTE (bereits per Task 2 umgestellte) ci.yml
```

## Task 5 — Doku-Hinweis in `.claude/skills/git-workflow/SKILL.md`

**Datei:** `.claude/skills/git-workflow/SKILL.md`, Abschnitt „Conventional Commits — Pflichtformat"
(nach der bestehenden Bullet-Liste, vor den Beispielen, ca. Zeile 65).

Neuer Absatz:

```markdown
**Neuer Scope nötig?** Bevor ein noch nicht registrierter Scope (z. B. ein neuer Goal-Code wie
`sec06`) in einer Commit-Message oder einem PR-Titel verwendet wird, zuerst
`bash scripts/register-scope.sh <scope>` ausführen und die geänderte `commitlint.config.cjs`
mitcommitten — sonst schlägt das `commit-lint`-Gate (und `preflight-pr-scope.sh`) mit "unknown
scope" fehl. `commitlint.config.cjs` ist die einzige Quelle; `ci.yml` und `pr-auto-title.yml`
laden daraus dynamisch (T001364).
```

Reine Doku-Änderung, kein S1-Gate (`.md` ungegated).

**Verifikation:** `grep -q 'register-scope.sh' .claude/skills/git-workflow/SKILL.md`

## Task 6 — Finale Verifikation (Pflicht-Gates)

```bash
# Gesamte betroffene Spec-Datei grün (alle @test-Blöcke, inkl. der 9 neuen aus T001364)
tests/unit/lib/bats-core/bin/bats tests/spec/t001356-git02-conventional-commit.bats

# Regressionscheck für den vierten (nicht im Design-Doc erfassten) Konsumenten
tests/unit/lib/bats-core/bin/bats tests/unit/preflight-pr-scope.bats

# OpenSpec-Validierung der Delta-Specs vor dem Commit
bash scripts/openspec.sh validate
# alternativ: task test:openspec

# Mandatory CI-Gate-Kommandos
task test:changed
task freshness:regenerate
task freshness:check
```

Keine neue BATS-Datei in diesem Plan → `task test:inventory` ist nicht erforderlich (bereits
committete Test-Datei `tests/spec/t001356-git02-conventional-commit.bats` wird nur grün gemacht,
nicht neu angelegt).

## Non-Goals

- Keine Änderung an den erlaubten Conventional-Commit-*Typen* (`feat`, `fix`, …) — nur Scopes.
- Kein automatisches Entfernen ungenutzter Scopes aus `commitlint.config.cjs`.
- Keine Änderung am lokalen `pre-push`-Hook-Verhalten (`.githooks/pre-push` ruft weiterhin
  `validate-commit-msg.sh` mit `range`/`head`/`message` unverändert auf).
- Kein separater, eigenständiger Shell-Test für die `pr-auto-title.yml`-Fallback-Logik — das
  Kernrisiko (fehlende/driftende Scope-Quelle) ist bereits über den `scopes`-BATS-Test in Task 1
  abgedeckt; die Grep-Assertions in Task 3 stellen sicher, dass der Workflow tatsächlich gegen
  diese Quelle validiert.
