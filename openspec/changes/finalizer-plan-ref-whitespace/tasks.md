---
title: "finalizer-plan-ref-whitespace — Implementation Plan"
ticket_id: T012243
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# finalizer-plan-ref-whitespace — Implementation Plan

_Ticket: T012243_

## File Structure

```
tests/spec/agent-skills/finalize-plan-ref-whitespace.bats   new     (bereits im RED-Commit)
scripts/devflow-post-merge-finalize.sh                      modify  423 L, S1-Limit .sh = 800, Budget 377
openspec/specs/agent-skills.md                              modify  (Archiv-Merge des Deltas, durch openspec archive)
```

## Partials

| # | Rolle | target_files |
|---|-------|--------------|
| p1 | fix + tests | `scripts/devflow-post-merge-finalize.sh`, `tests/spec/agent-skills/finalize-plan-ref-whitespace.bats` |

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Der Test liegt im Stage-Commit dieses Branches. Er schneidet
      die `json_field`-Definition samt `PLAN_REF`-Zuweisung und die Schritt-2-Auswertung per
      awk-Bereichsmuster aus dem Skript und führt beides gegen ein realistisches Ticket-JSON aus.
      Der Extraktor-**Aufruf** stammt bewusst aus dem Skript, nicht aus dem Test — sonst prüfte
      der Test die eigene Annahme statt das Verhalten.
      `expected: FAIL` für Test 2 („BRANCH ist der Branchname allein"); Test 1 (Positiv-Anker),
      Test 3 (PLAN_FILE) und Test 4 (status/type-Regression) sind grün und müssen es bleiben.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/finalize-plan-ref-whitespace.bats
# expected: FAIL — "not ok 2 extract: BRANCH ist der Branchname allein, ohne angehaengtes plan="
```

## Task 1 — json_field_raw einführen und plan_ref darüber lesen

- [ ] In `scripts/devflow-post-merge-finalize.sh` neben `json_field()` einen zweiten Extraktor
      `json_field_raw()` ergänzen. Er entfernt ausschließlich die JSON-Syntax um den Wert herum
      (führender Feldname, Doppelpunkt, umschließende Quotes) und lässt den Wert selbst
      unangetastet:

```bash
json_field_raw() { # $1 = Feldname, $2 = JSON-Text
  echo "$2" | grep -o "\"$1\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -1 \
    | sed "s/^\"$1\"[[:space:]]*:[[:space:]]*\"//; s/\"$//" || true
}
```

- [ ] Die Zuweisung `PLAN_REF=` auf `json_field_raw` umstellen. `TICKET_STATUS` und
      `TICKET_TYPE` bleiben auf `json_field` — sie tragen keine bedeutungstragenden Leerzeichen.

- [ ] Über `json_field()` einen Kommentar setzen, der die Einschränkung benennt: der Extraktor
      ist für Werte ohne bedeutungstragende Leerzeichen; wer ein Feld mit zusammengesetztem Wert
      ergänzt, nimmt `json_field_raw`. Ohne diesen Hinweis wiederholt sich der Fehler beim
      nächsten Feld — die Falle ist an der Aufrufstelle nicht sichtbar.

- [ ] GREEN-Nachweis:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/finalize-plan-ref-whitespace.bats
# expected: 4/4 ok
```

- [ ] Die awk-Extraktion im Test hängt an drei Ankerzeilen: dem Kommentarbeginn bzw.
      `json_field() {`, der Zeile `PLAN_REF=` und `PLAN_FILE=""` … `fi`. Wird eine davon
      umformuliert, im selben Task das Bereichsmuster in
      `tests/spec/agent-skills/finalize-plan-ref-whitespace.bats` mitziehen — der Test bricht
      sonst mit „nicht gefunden" ab statt eine Aussage zu treffen.

## Task 2 — Regression der bestehenden Finalizer-Guards

- [ ] Die Guards in `tests/spec/agent-skills/` greifen auf Schritt 1/2 und die
      Worktree-Auflösung zu (T006348, T008014, T012240) und dürfen nicht brechen:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/agent-skills/
```

## Task 3 — Abschließende Verifikation

- [ ] Vollständiger Verify-Lauf:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

