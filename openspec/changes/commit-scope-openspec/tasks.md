---
title: "commit-scope-openspec — Implementation Plan"
ticket_id: T003139
domains: [ci, scripts]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# commit-scope-openspec — Implementation Plan

_Ticket: T003139_

## File Structure

| Datei | Ist | Budget |
|---|---|---|
| `scripts/validate-commit-msg.sh` | 278 | 522 |
| `tests/spec/ci-cd/unknown-scope-names-source.bats` | 110 | neu (Guard, bereits angelegt) |
| `openspec/changes/commit-scope-openspec/specs/ci-cd.md` | 40 | Delta-Spec (nicht S1-relevant) |

`scripts/validate-commit-msg.sh` ist nicht gebaselinet; wirksame Schwelle ist das
`.sh`-Limit 800 aus `docs/code-quality/gates.yaml`, Budget also 522 Zeilen. Die Aenderung
umfasst rund zehn Zeilen — kein Split noetig.

`commitlint.config.cjs` wird **nicht** angefasst: die Entscheidung ist, die Liste nicht zu
erweitern.

## Entscheidung (Belege in `proposal.md`)

Erklaeren statt erweitern. `openspec` bleibt Alias von `plans`; die Ablehnung wird
aussagekraeftiger — fuer jeden Scope, nicht nur fuer diesen einen.

## Task 1 — Guard laeuft rot (RED)

Der Guard liegt bereits auf dem Branch. Vor der Implementierung ausfuehren und den roten
Stand festhalten.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/unknown-scope-names-source.bats
# expected: FAIL — 3 von 6 Tests rot (SSOT-Datei, Auflistungsbefehl, aliasfreier Fall);
# die drei Positiv-Anker (gueltiger Scope akzeptiert, ungueltiger Scope abgelehnt,
# Alias-Auskunft erhalten) sind bereits gruen und muessen gruen bleiben.
```

Beide Testformen erfassen (T002696) — Sammeldatei und Verzeichnis:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/ci-cd*
```

## Task 2 — Zusatzzeilen in der Scope-Ablehnung

In `scripts/validate-commit-msg.sh`, im `else`-Zweig von `validate_subject()` (der Block ab
`echo "  ✗ ${label}unknown scope ..."`, aktuell Zeile 179–192): nach dem bestehenden
Alias-/Suggestion-Block und vor der CI-Hinweiszeile zwei weitere Zeilen auf `stderr`
ausgeben:

- eine, die `commitlint.config.cjs` als Quelle der Scope-Liste nennt,
- eine, die `scripts/validate-commit-msg.sh scopes` als Befehl zum Auflisten nennt.

Randbedingungen:

- Die Zeilen erscheinen **immer**, wenn ein Scope abgelehnt wird — auch dann, wenn weder
  `scope_hint` noch `suggest_scope` etwas liefert. Der bestehende `if/elif`-Block bleibt
  unangetastet; die neuen Zeilen stehen ausserhalb davon.
- Alias-Auskunft und Nearest-Scope-Vorschlag behalten ihren Vorrang und ihre Reihenfolge.
- Ausgabe nach `stderr` wie die uebrigen Diagnosezeilen, damit der Hook-Output zusammen
  bleibt.
- Kein `set -e`-Fallstrick: der Rueckgabewert des Blocks bleibt `return 1`.

## Task 3 — Gegenprobe an der realen Ablehnung

```bash
printf 'chore(openspec): 54 gemergte Changes archivieren [T003139]\n' > /tmp/msg-t003139.txt
bash scripts/validate-commit-msg.sh message /tmp/msg-t003139.txt
# erwartet: exit 1, Ausgabe nennt 'plans', 'commitlint.config.cjs' und
# 'validate-commit-msg.sh scopes'

bash scripts/validate-commit-msg.sh scopes | wc -l
# erwartet: 15 — der genannte Befehl funktioniert wirklich und listet die Scopes

printf 'chore(plans): archive a merged change [T003139]\n' > /tmp/msg-ok.txt
bash scripts/validate-commit-msg.sh message /tmp/msg-ok.txt
# erwartet: exit 0, keine Diagnose

rm -f /tmp/msg-t003139.txt /tmp/msg-ok.txt
```

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/unknown-scope-names-source.bats
# erwartet: 6/6 gruen
```

## Task 4 — Testinventar

Der Guard ist eine neue Testdatei, der CI-Inventarcheck greift.

```bash
task test:inventory
git status --short website/src/data/
```

`website/src/data/test-inventory.json` **und** `website/src/data/openspec-status.json`
mitcommitten, falls sie sich aendern — die zweite wird leicht uebersehen.

## Task 5 — Abschliessende Verifikation

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Zusaetzlich, weil der Scope-Guard auf dem eigenen Commit-Pfad liegt:

```bash
bash scripts/validate-commit-msg.sh range origin/main..HEAD
# erwartet: exit 0 — die eigenen Commits dieses Branches sind konventionskonform
```
