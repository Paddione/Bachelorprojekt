---
title: sf-fixture-hardening — Implementation Plan
ticket_id: T005591
domains: [test, docs, db]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# sf-fixture-hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exec-Fehler in den SF-Test-Fixtures werden observable (rc≠0 + stderr); Skip maskiert keine create-Fehler; Kontrakt-Assertions präzisiert. Review-Befunde 1–5 aus PR #4447.

**Architecture:** Kleine Änderungen an drei Test-Dateien; der neue BATS-Test pinnt Befund 1 gegen eine fake-kubectl.

**Tech Stack:** Bash, BATS (vendored).

**Spec:** `openspec/changes/sf-fixture-hardening/design.md`

## Global Constraints

- Befund 6 (SQL-Interpolation) NICHT ändern — nur Kommentar.
- `tests/spec/software-factory/_sf_common.bash` Z. 128 (`psql < "$latest"`) NICHT ändern — bewusster stdin-Read.
- Kein Produktionscode — reine Test-Infrastruktur.

## File Structure

```
tests/lib/factory-test-fixtures.sh                        # MODIFY: Befunde 1, 4
tests/spec/software-factory/_sf_common.bash               # MODIFY: Befund 1 (stderr-Log)
tests/spec/software-factory/scheduling-cleanup-guard.bats # MODIFY: Befunde 2, 3, 5
tests/spec/software-factory/sf-fixture-observability.bats # EXISTS: failing Test (rot verifiziert)
openspec/changes/sf-fixture-hardening/specs/software-factory.md  # EXISTS: Delta
```

---

### Task 1: Exec-Observability (Befund 1) + Rot-Grün

**Files:**
- Modify: `tests/lib/factory-test-fixtures.sh`, `tests/spec/software-factory/_sf_common.bash`
- Test: `tests/spec/software-factory/sf-fixture-observability.bats` (existiert, rot)

- [ ] **Step 1: Rot bestätigen**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/sf-fixture-observability.bats`
expected: FAIL — `[ "$status" -ne 0 ]` schlägt fehl (Funktion liefert 0 trotz exec-Failure).

- [ ] **Step 2: SELECT-exec auf Fehler prüfen**

In `purge_real_feature` (tests/lib/factory-test-fixtures.sh) den SELECT-Block ersetzen:

```bash
  local title select_rc
  title=$(kubectl exec -i "$pod" -n "$ns" --context "$ctx" -c postgres -- \
    psql -U postgres -d website -qtAc "SELECT title FROM tickets.tickets WHERE external_id='$ext_id';" < /dev/null 2> >(sed 's/^/[purge-exec] /' >&2) | tr -d '[:space:]')
  select_rc=${PIPESTATUS[0]}
  if [[ $select_rc -ne 0 ]]; then
    echo "purge_real_feature: exec failed (rc=$select_rc) for $ext_id — row state unknown" >&2
    return 1
  fi
  [[ -n "$title" ]] || return 0   # idempotent: Zeile existiert nicht mehr
```

- [ ] **Step 3: Teardown stderr nicht mehr verwerfen**

In `tests/spec/software-factory/_sf_common.bash` `_sf_teardown` (Z. ~131): den Purge-Aufruf so umstellen, dass stderr ins Test-Log läuft statt `/dev/null` — Aufruf bleibt via `|| true` exit-neutral.

- [ ] **Step 4: Test grün**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/sf-fixture-observability.bats`
Expected: PASS — rc≠0 + stderr-Beleg.

- [ ] **Step 5: Commit**

```bash
git add tests/lib/factory-test-fixtures.sh tests/spec/software-factory/_sf_common.bash tests/spec/software-factory/sf-fixture-observability.bats
git commit -m "test(scripts): make SF fixture exec failures observable [T005591]"
```

---

### Task 2: Skip/Kontrakt/Konsistenz (Befunde 2–5)

**Files:**
- Modify: `tests/spec/software-factory/scheduling-cleanup-guard.bats`
- Modify: `tests/lib/factory-test-fixtures.sh` (Befund 4)

- [ ] **Step 1: Skip→Fail bei erreichbarer DB (Befund 2)**

In `scheduling-cleanup-guard.bats` Z. ~70: `[ -n "$created" ] || skip` ersetzen durch eine DB-Erreichbarkeitsprüfung — erreichbar und leer ⇒ `fail "create path produced no row"`; skip nur bei verifiziert offline.

- [ ] **Step 2: Kontrakt-Präzision (Befund 3)**

Guard-Test 3: statt `-ne 0` den dokumentierten **Exit 4** asserten. Der `--force`-Pfad: nach Exit 0 zusätzlich prüfen, dass die Zeile wirklich gelöscht ist (SELECT liefert leer).

- [ ] **Step 3: `< /dev/null`-Konsistenz (Befund 4)**

`ensure_purge_fn_current` (Z. ~123) und `purge_factory_test_data` (Z. ~161) in `tests/lib/factory-test-fixtures.sh` erhalten `< /dev/null` an ihren exec-Aufrufen. Z. 128 (`psql < "$latest"`) unverändert lassen.

- [ ] **Step 4: Brand-Mismatch-Kommentar (Befund 5)**

Am Guard-Test-1-Seed einen Kommentar ergänzen: mentolder-Seed + korczewski-Purge sind harmlos, weil der DELETE auf die global eindeutige external_id filtert.

- [ ] **Step 5: Suite**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/scheduling-cleanup-guard.bats tests/spec/software-factory/sf-fixture-observability.bats`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/spec/software-factory/scheduling-cleanup-guard.bats tests/lib/factory-test-fixtures.sh
git commit -m "test(scripts): harden SF fixture guard contract [T005591]"
```

---

### Task 3: Verifikation und Artefakte

**Files:**
- Verify: `openspec/changes/sf-fixture-hardening/`, `tests/spec/software-factory/*`

- [ ] **Step 1: OpenSpec-Validierung**

Run: `task openspec:validate`
Expected: Exit 0. Fehlt `.ticket`: `echo T005591 > openspec/changes/sf-fixture-hardening/.ticket`.

- [ ] **Step 2: CI-äquivalente Spec-Suite**

Run: `timeout 900 task test:spec:changed`
Expected: Exit 0.

- [ ] **Step 3: Geänderte Domains**

Run: `timeout 900 task test:changed`
Expected: Exit 0.

- [ ] **Step 4: Freshness**

Run:
```bash
task freshness:regenerate
git add docs/code-quality/repo-index.json website/src/data/openspec-status.json website/src/data/test-inventory.json 2>/dev/null || true
git commit -m "chore: regenerate freshness artifacts [T005591]"
task freshness:check
```
Expected: `freshness:check` Exit 0; Artefakte im Commit.

- [ ] **Step 5: Abschluss-Commit**

```bash
git add openspec/changes/sf-fixture-hardening/
git commit -m "chore(plans): finalize sf-fixture-hardening change [T005591]"
```
