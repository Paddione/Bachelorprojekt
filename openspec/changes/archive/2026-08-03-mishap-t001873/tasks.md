---
title: "mishap-t001873 — Implementation Plan"
ticket_id: T001873
domains: [test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-t001873 — Implementation Plan

_Ticket: T001873_

## Purpose

`scripts/preflight-pr-scope.sh` (T001592-Check) vergleicht die aus dem PR-Titel extrahierte
Ticket-ID case-**sensitiv** per bash-Regex (`[[ ! "$CURRENT_BRANCH" =~ $TICKET_ID ]]`) gegen den
aktuellen Branchnamen. `dev-flow-chore` erzeugt aber `chore/<slug>`-Branches durchgehend in
lowercase (real passiert: PR-Titel `[T001869]`, Branch `chore/doc-cleanup-t001869` →
`preflight-pr-scope: FATAL: PR title ticket ID 'T001869' does not match current branch name
'chore/doc-cleanup-t001869'`, Branch-Rename als Workaround nötig). Der Vergleich wird
case-insensitiv gemacht.

## File Structure

```
scripts/preflight-pr-scope.sh              GEAENDERT (~4 Z im Ticket-ID-Block) — Vergleich case-insensitiv (tr + Substring statt Regex)
tests/spec/ci-cd.bats                       GEAENDERT (+~20 Z) — neuer @test, Regression für den lowercase-Branch-Fall
.claude/skills/dev-flow-chore/SKILL.md      GEAENDERT (+1 Satz in Schritt 1) — Hinweis: Ticket-ID sollte im Branch-Slug enthalten sein (Groß-/Kleinschreibung egal)
```

### S1-Budget (Pflicht-Preflight pro geänderter Datei)

`.sh`-Limit = 500, `.bats` ist ungegatet (kein Budget-Eintrag nötig).

| Datei | Ist | Wirksame Schwelle |
|---|---|---|
| `scripts/preflight-pr-scope.sh` | 114 | 386 |

Beide Änderungen bleiben weit unter dem Budget — keine Split/Shrink-Maßnahme nötig.

## Task 1 — RED: Failing-Regression in `tests/spec/ci-cd.bats`

Füge am Ende von `tests/spec/ci-cd.bats` einen neuen `@test` hinzu, der den realen Mishap
reproduziert: PR-Titel `chore(docs): x [T999901]` + Branch `chore/foo-t999901` (durchgehend
lowercase) in einem isolierten Temp-Git-Repo. Der Test setzt sein eigenes Fixture-Repo **inline im
Testkörper** auf (nicht in der globalen `setup()` der Datei — die wird von ~30 bestehenden Tests in
dieser Datei geteilt und darf nicht verändert werden). Das Muster für das Temp-Repo (git init auf
einer Nicht-main/master-Branch, damit die Branch-Guards von `preflight-pr-scope.sh` nicht
fehlschlagen, plus eine Fixture-`ci.yml` mit bekannter Scope-Allowlist) folgt
`tests/unit/preflight-pr-scope.bats::setup()`.

```bash
# --- T001873: preflight-pr-scope lowercase-Branch-Regression (Mishap-Ticket) ---
@test "T001873: preflight-pr-scope akzeptiert lowercase Ticket-ID im Branchnamen" {
  local tmp
  tmp="$(mktemp -d)"

  # Fixture ci.yml mit 'docs' als bekanntem Scope (isoliert von echter ci.yml-Drift)
  local fixture="$tmp/ci.yml"
  cat > "$fixture" <<'EOF'
jobs:
  commit-lint:
    steps:
      - uses: amannn/action-semantic-pull-request@v5.5.3
        with:
          scopes: |
            docs
            test
EOF

  # Isoliertes Fixture-Repo direkt auf dem lowercase-Branch aus dem Mishap-Report,
  # nicht main/master/feature/fix -> preflight-pr-scope's Branch-Guards greifen nicht ein.
  git -C "$tmp" init -q -b chore/foo-t999901
  git -C "$tmp" config user.email "test@example.invalid"
  git -C "$tmp" config user.name "Test Fixture"
  git -C "$tmp" commit -q --allow-empty -m "fixture"

  run bash -c "cd '$tmp' && bash '$REPO_ROOT/scripts/preflight-pr-scope.sh' 'chore(docs): x [T999901]' '$fixture'"
  rm -rf "$tmp"

  [ "$status" -eq 0 ]
}
```

RED ausführen:

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd.bats
# expected: FAIL — der neue Test "T001873: preflight-pr-scope akzeptiert lowercase Ticket-ID im
# Branchnamen" schlägt fehl, weil der case-sensitive Regex-Vergleich in preflight-pr-scope.sh
# 'T999901' nicht im lowercase-Branch 'chore/foo-t999901' findet (FATAL, exit 1).
```

## Task 2 — GREEN: Case-insensitiven Vergleich in `scripts/preflight-pr-scope.sh` implementieren

Ersetze den Ticket-ID-Vergleichsblock (aktuell Zeilen 31–37, `if [ -n "$TICKET_ID" ]; then … fi`)
durch einen case-insensitiven Substring-Vergleich — beide Seiten mit `tr '[:upper:]' '[:lower:]'`
normalisieren, kein Regex mehr nötig:

```bash
if [ -n "$TICKET_ID" ]; then
  # Case-insensitive Vergleich [T001873]: dev-flow-chore erzeugt chore/<slug>-Branches
  # durchgehend in lowercase; die Ticket-ID im PR-Titel ist [T123456] (uppercase).
  BRANCH_LC="$(echo "$CURRENT_BRANCH" | tr '[:upper:]' '[:lower:]')"
  TICKET_LC="$(echo "$TICKET_ID" | tr '[:upper:]' '[:lower:]')"
  if [[ "$BRANCH_LC" != *"$TICKET_LC"* ]]; then
    echo "preflight-pr-scope: FATAL: PR title ticket ID '$TICKET_ID' does not match current branch name '$CURRENT_BRANCH'" >&2
    exit 1
  fi
fi
```

GREEN verifizieren — derselbe Testlauf aus Task 1 muss jetzt grün sein:

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd.bats
# erwartet: alle Tests grün, inkl. "T001873: preflight-pr-scope akzeptiert lowercase Ticket-ID im Branchnamen"
```

Regression-Check gegen die bestehende Suite (darf durch die Änderung nicht brechen):

```bash
./tests/unit/lib/bats-core/bin/bats tests/unit/preflight-pr-scope.bats
# erwartet: alle Tests grün (case-sensitives Verhalten war dort nie assertiert, nur Scope-Logik)
```

## Task 3 — Doku-Hinweis in `.claude/skills/dev-flow-chore/SKILL.md` Schritt 1

Ergänze in Schritt 1 ("Worktree anlegen & claimen"), direkt nach dem `git checkout -b chore/<slug>`
/ `worktree-create.sh chore/<slug> …`-Block, einen Halbsatz: falls eine bestehende `TICKET_EXT_ID`
wiederverwendet wird, sollte deren Ticket-Nummer im `<slug>` enthalten sein — Groß-/Kleinschreibung
ist seit T001873 irrelevant, da `preflight-pr-scope.sh` den Vergleich case-insensitiv durchführt.

```markdown
> Enthält `<slug>` eine wiederverwendete `TICKET_EXT_ID` (z.B. `T001869`), sollte deren Ticketnummer
> im Slug vorkommen (z.B. `doc-cleanup-t001869`) — `preflight-pr-scope.sh` prüft das PR-Titel↔Branch-
> Matching case-insensitiv (T001873), Groß-/Kleinschreibung im Slug spielt also keine Rolle.
```

## Task 4 — Final Verification (mandatory CI gates)

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

- `task test:changed` deckt den neuen `tests/spec/ci-cd.bats`-Test ab (BATS-Teil der Domain `test`)
  und läuft `test:inventory` implizit über `freshness:regenerate` erneut mit — das neue
  `@test`-Requirement erscheint danach in `website/src/data/test-inventory.json`; diese Datei mit
  committen.
- `task freshness:check` ist das CI-Äquivalent (Freshness + Quality-Gates S1–S4 + Baseline-Assertion)
  und muss grün sein, bevor committet wird.
