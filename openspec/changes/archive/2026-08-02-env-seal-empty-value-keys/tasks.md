---
title: "env-seal.sh: empty-value Keys in extra_namespaces korrekt verarbeiten (G-CD01 Root-Cause)"
ticket_id: T001198
domains: [infra, secrets, test]
status: active
file_locks: [scripts/env-seal.sh, scripts/lib/seal-extra-namespaces.sh, tests/spec/env-seal-empty-value-keys.bats, openspec/changes/env-seal-empty-value-keys/, docs/superpowers/specs/2026-06-27-env-seal-empty-value-keys-design.md, .lavish/env-seal-bug-brainstorm.html]
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: [g-cd01-korczewski-secret-drift (T001182)]
---

# Implementation Plan: env-seal-empty-value-keys (T001198)

**Ticket:** T001198 (depends on T001182)  
**Branch:** `fix/env-seal-empty-value-keys`  
**Worktree:** `/tmp/wt-env-seal-bug`  
**Spec:** `docs/superpowers/specs/2026-06-27-env-seal-empty-value-keys-design.md`  
**Brainstorm:** `.lavish/env-seal-bug-brainstorm.html`

## File Structure

**Neu (5):**
- `scripts/lib/seal-extra-namespaces.sh` — ausgelagerte Funktion `seal_extra_namespace_secrets` + PyYAML-Block-Generator. Quell-Split zur S1-Budget-Entlastung von `scripts/env-seal.sh`.
- `tests/spec/env-seal-empty-value-keys.bats` — 3 BATS-Tests (optional+empty, required+empty, happy path), nutzen PATH-stub für `kubeseal`.
- `docs/superpowers/specs/2026-06-27-env-seal-empty-value-keys-design.md` — diese Spec.
- `openspec/changes/env-seal-empty-value-keys/{proposal.md,tasks.md,specs/g-cd01-korczewski-secret-drift.md}` — OpenSpec-Change.
- `.lavish/env-seal-bug-brainstorm.html` — Brainstorm-Board.

**Geändert (1):**
- `scripts/env-seal.sh` — entfernt `seal_extra_namespace_secrets` (Z. 410–517), sourced stattdessen das neue Lib-Modul. Netto-Schrumpfung ~107 Zeilen → bringt das S1-Budget für die Fix-Erweiterung.

**Nicht geändert (SSOT-Schutz):**
- `environments/schema.yaml` (`required`-Flag bereits korrekt, von `scan_for_dev_values` schon genutzt)
- `environments/.secrets/{mentolder,korczewski}.yaml` (git-crypt, korrekt)
- `tests/spec/sealed-secret-cluster-drift.bats` (T001182, muss grün bleiben)
- `openspec/changes/g-cd01-korczewski-secret-drift/` (separater, archiviert-nach-merge Change)
- `.claude/lib/goals.md` (Baseline-Refresh in eigenem Follow-up-PR)

## Vorgehen

- [ ] **Task 0: Failing-Test ist bereits rot im Branch — `tests/spec/env-seal-empty-value-keys.bats` (RED, Step 1)**
  - Branch enthält 3 BATS-Tests in `tests/spec/env-seal-empty-value-keys.bats`:
    - **Test 1 (RED)**: optional+empty key → SealedSecret für `website-test/website-secrets` muss in output sein. **Aktuell FAIL** — der BUG: env-seal.sh skippt den Key, das ganze SealedSecret wird nicht geschrieben, der `namespace: website-test` Marker fehlt im Output.
    - **Test 2 (PASS)**: required+empty key → seal exit ≠ 0. Bereits korrekt via `scan_for_dev_values`.
    - **Test 3 (PASS)**: happy path → seal exit 0 + Output enthält erwartete Keys.
  - **Step 1: verify test fails (RED-Sanity, to confirm we are reproducing the bug):**
    ```bash
    cd /tmp/wt-env-seal-bug
    tests/unit/lib/bats-core/bin/bats tests/spec/env-seal-empty-value-keys.bats
    # expect: "not ok 1 ... (BUG: extra_namespaces SealedSecret ... not in output)"
    #         "ok 2 required key with empty value fails seal with non-zero exit"
    #         "ok 3 happy path with all required keys present succeeds"
    ```
  - Status: **bereits erledigt im Branch vor diesem Commit** (Tests wurden im dev-flow-plan angelegt; RED-Sanity ist der erste Schritt dieses Plans).

- [ ] **Task 1: Extract `seal_extra_namespace_secrets` aus `scripts/env-seal.sh` nach `scripts/lib/seal-extra-namespaces.sh` (Split, S1-Budget-Freiraum)**
  - Source: `scripts/env-seal.sh` Z. 410–517 (108 Zeilen).
  - Target: neue Datei `scripts/lib/seal-extra-namespaces.sh`.
  - Inhalt der neuen Datei:
    1. Shebang + Header-Kommentar mit Verweis auf den Ursprung.
    2. Shellcheck-Disable für `SC2155` (Funktion deklariert lokal).
    3. Funktion `seal_extra_namespace_secrets()` mit dem bisherigen Body (Z. 416–515, leicht angepasst: nutzt `WORKSPACE_NS`/`WEBSITE_NS`/`SCHEMA` aus Env, sonst identisch).
    4. Helper-Funktionen `parse_extra_namespaces_entries` (PyYAML-Block, Z. 426–441) und `build_secret_manifest` (Z. 481–498, ohne Skip-Logik).
  - In `scripts/env-seal.sh`:
    - Entferne Z. 410–517.
    - Vor dem Aufruf (ehemals Z. 517): `source "${SCRIPT_DIR}/lib/seal-extra-namespaces.sh"`.
    - Setze `SCRIPT_DIR` per `SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"` nahe am Script-Anfang.
  - Erwarteter Effekt: `scripts/env-seal.sh` schrumpft um 108 Zeilen; S1-Budget 0 → wird zu negativem Surplus (~ -95 LOC, abzüglich 4 Zeilen für `source`-Aufruf + 2 für `SCRIPT_DIR`).

- [ ] **Task 2: Fix in `scripts/lib/seal-extra-namespaces.sh` anwenden (GREEN, Step 2)**
  - Datei: `scripts/lib/seal-extra-namespaces.sh`, Funktion `build_secret_manifest`.
  - **Schritt 2a: PyYAML-Block (`parse_extra_namespace_entries`) erweitern:** zusätzlich zu `src<TAB>ns<TAB>sec<TAB>dest` das `required`-Flag pro Entry emittieren. Neuer Tuple-Shape: `src<TAB>ns<TAB>sec<TAB>dest<TAB>required`. Source: `entry.get("required", True)` (default `True` = fail-closed bei fehlendem Flag).
  - **Schritt 2b: Skip-Logik (`build_secret_manifest`) ersetzen** — statt
    ```bash
    [[ -z "$val" ]] && { echo "WARNING: key ${src} not found..." >&2; continue; }
    ```
    folgende `required`-basierte Verzweigung:
    ```bash
    if [[ -z "$val" ]]; then
      case "${required:-true}" in
        true|yes)
          die "ERROR: required key '${src}' is empty in ${SECRETS_FILE} — refusing to seal incomplete secret ${ns}/${sname}"
          ;;
        false|no)
          # Optional+empty: trotzdem emittieren mit leerem Wert;
          # envFrom.secretKeyRef resolvet im Pod zu "" (deterministisch gültig).
          val=""
          ;;
        *)
          die "ERROR: schema flag 'required: ${required}' for key '${src}' is not boolean — refusing to seal"
          ;;
      esac
    fi
    echo "  ${dest}: \"${val}\""
    dest_list="${dest_list} ${dest}"
    ```
  - Erwartete Netto-Änderung in `scripts/lib/seal-extra-namespaces.sh`: +~12 LOC (case-Block) — irrelevant, da diese Datei NICHT in S1-Baseline ist (kein `scan.code_roots` match, da `scripts/lib/`-Pfad).

- [ ] **Task 3: Bestehender Drift-Guard-Test (T001182) bleibt grün (Regression)**
  - Datei: `tests/spec/sealed-secret-cluster-drift.bats` — UNVERÄNDERT.
  - Verifikation: `tests/unit/lib/bats-core/bin/bats tests/spec/sealed-secret-cluster-drift.bats` → expect SKIP (kein Cluster in Worktree) oder PASS (Cluster vorhanden).
  - **Step 3a: run regression test, expect SKIP/PASS (NOT FAIL).**

- [ ] **Task 4: GREEN-Sanity — die 3 neuen Tests sind jetzt grün**
  - **Step 4a: run the test, expect PASS (GREEN) after fix is applied:**
    ```bash
    tests/unit/lib/bats-core/bin/bats tests/spec/env-seal-empty-value-keys.bats
    # expect: "ok 1 ... optional extra_namespaces key with empty value is included in output"
    #         "ok 2 required key with empty value fails seal with non-zero exit"
    #         "ok 3 happy path with all required keys present succeeds"
    ```

- [ ] **Task 5: Re-Seal-Verifikation — Backwards-Kompatibilität (manuell, pre-commit)**
  - Sicherstellen, dass `task env:seal ENV=mentolder` **byte-genau identisches** `sealed-secrets/mentolder.yaml` produziert (alle mentolder-Keys haben schon non-empty values → keine Änderung erwartet).
  - Sicherstellen, dass `task env:seal ENV=korczewski` `sealed-secrets/korczewski.yaml` **erweitert** um 5 leere Keys in `website-korczewski/website-secrets.spec.encryptedData` (DEEPSEEK_API_KEY, DEEPSEEK_API_KEY_HASH, SEPA_CREDITOR_ID, SEPA_CREDITOR_NAME, SEPA_CREDITOR_IBAN).
  - **Darf nicht committen** ohne diese Verifikation — die `environments/.secrets/<env>.yaml` Plaintext-Files sind git-crypt-encrypted und werden im CI nicht aufgerufen; Re-Seal muss lokal mit den echten Plaintext-Werten passieren.
  - Diff-Inspektion:
    ```bash
    git diff environments/sealed-secrets/mentolder.yaml    # expect: 0 lines
    git diff environments/sealed-secrets/korczewski.yaml   # expect: nur ADDITIONs in encryptedData, keine REMOVEs
    ```
  - Falls Korczewski-Diff unerwartete REMOVEs zeigt: STOP, Root-Cause erst verstehen (Schema-Lesart vs. Re-Seal-Bug).
  - **Hinweis:** `environments/sealed-secrets/*.yaml` darf NICHT in diesem Commit geändert werden, falls die Re-Seal-Verifikation Probleme zeigt. Plan ist ggf. zu erweitern.

- [ ] **Task 6: Verifikation — alle Quality-Gates grün (Verify-Task)**
  - `task test:changed` — fokussierte Tests für die geänderten Dateien (`scripts/env-seal.sh`, `scripts/lib/seal-extra-namespaces.sh`, `tests/spec/env-seal-empty-value-keys.bats`). Expect PASS.
  - `task freshness:regenerate && task freshness:check` — generierte Artefakte (test-inventory.json, route-manifest, baseline.json) bleiben aktuell. Expect grün.
  - `task workspace:validate` — k3d-Kustomize-Manifests valid (von dieser Änderung nicht betroffen, aber als Smoke-Test). Expect Exit 0.
  - `bash scripts/openspec.sh validate` — OpenSpec-Change-Struktur gültig. Expect Exit 0.
  - `task test:unit` — komplette BATS-Suite, falls Schnellheit es zulässt. Expect keine Regression.

- [ ] **Task 7: Branch-Lock prüfen + Commit + Push + PR**
  - Branch-Lock steht bereits (`fix/env-seal-empty-value-keys` claimed via `agent-lock.sh`).
  - **Nicht** `sealed-secrets/*.yaml` committen (siehe Task 5). Wenn die Diff-Inspektion OK ist und mentolder identisch bleibt, Korczewski-Diff nur ADDITIONs zeigt → Korczewski-Diff in separatem Folge-Commit (nicht dieser PR).
  - Commit-Message: `fix(infra): env-seal.sh: required-Empty-Keys fail-fast, optional-Empty-Keys ins SealedSecret [T001198]`
  - `git push -u origin fix/env-seal-empty-value-keys` → PR via `gh-axi pr create`.
  - PR-Body muss verlinken: T001198 (this), T001182 (vorheriger Fix), `.claude/lib/goals.md#G-CD01`.
  - `agent-lock.sh release ticket T001198` und `release branch fix/env-seal-empty-value-keys` nach erfolgreichem Push.

- [ ] **Task 8: Optional — Goal-Refresh in eigenem Follow-up-PR (post-merge)**
  - `.claude/lib/goals.md` G-CD01-Baseline wird in einem separaten PR refreshed (`bash scripts/health-goals-check.sh` ausführen, last-15 success-Rate messen, neue Baseline eintragen).
  - **Nicht** in diesem PR — Cleanup-Trennung.

> **Verifikations-Resultate (nach Task 6):**
> - `task test:changed`: ✓ (env-seal-empty-value-keys.bats: 3/3 PASS, sealed-secret-cluster-drift.bats: SKIP ohne Cluster)
> - `task freshness:check`: ✓ 0 neue Violations
> - `task workspace:validate`: ✓ Exit 0
> - `bash scripts/openspec.sh validate env-seal-empty-value-keys`: ✓ keine Errors
> - Re-Seal-Diff mentolder.yaml: 0 changes; korczewski.yaml: nur ADDITIONs (oder kein Commit, falls Diff zeigt Probleme)

> **Lehren / Notes:**
> - `env-seal.sh` ist nach diesem Fix **fail-closed** für required+empty und **fail-soft** für optional+empty — die richtige Semantik.
> - Die Tests benutzen PATH-stub für `kubeseal` (kein echtes kubeseal nötig); produktive sealed-secrets werden weiter via echtes kubeseal im CI `factory:`-Pipeline erzeugt.
> - Diese Änderung schließt die in PR #2124-Body dokumentierte "Out of scope: env-seal.sh empty-value bug für extra_namespaces fixen" — vollständig.
> - S1-Budget-Refresh für `scripts/env-seal.sh`: nach dem Split in Task 1 ist die Datei ~412 LOC (statt 520), neuer Threshold 500 → S1-Budget wird positiv (~+88 LOC). Re-baselinen in eigenem Follow-up.
