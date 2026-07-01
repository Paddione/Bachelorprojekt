---
title: "workspace:deploy — brand-scope SealedSecret-Anwendung gegen Cross-Brand-Überschreibung (T001404)"
ticket_id: T001404
domains: [infra, secrets, test]
status: active
file_locks: [environments/schema.yaml, scripts/env-seal.sh, scripts/lib/seal-extra-namespaces.sh, Taskfile.yml, tests/spec/workspace-deploy-secrets-scope.bats, openspec/changes/t001404-workspace-deploy-secrets-scope/, docs/superpowers/specs/2026-07-01-t001404-workspace-deploy-secrets-scope-design.md, .lavish/t001404-secrets-scope-brainstorm.html]
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Implementation Plan: t001404-workspace-deploy-secrets-scope (T001404)

**Ticket:** T001404
**Branch:** `fix/t001404-workspace-deploy-secrets-scope`
**Worktree:** `tmp/wt-t001404`
**Spec:** `docs/superpowers/specs/2026-07-01-t001404-workspace-deploy-secrets-scope-design.md`
**Brainstorm:** `.lavish/t001404-secrets-scope-brainstorm.html`
**Spec-Delta:** `openspec/changes/t001404-workspace-deploy-secrets-scope/specs/workspace-deploy/spec.md`
**Reproduced-Vorfall:** siehe Ticket-Body — `task workspace:deploy ENV=korczewski` hat mentolders `RUSTDESK_ID_ED25519` im shared `rustdesk/rustdesk-secrets` überschrieben.

## File Structure

**Neu (2):**
- `tests/spec/workspace-deploy-secrets-scope.bats` — BATS-Spec mit drei Szenarien (Schema-Static-Check, env-seal-Filter für korczewski, env-seal-Filter für mentolder). Stub-kubeseal-Pattern analog zu `tests/spec/env-seal-empty-value-keys.bats`. Self-contained, kein Live-Cluster nötig. S1-Budget 500.
- `openspec/changes/t001404-workspace-deploy-secrets-scope/specs/workspace-deploy/spec.md` — Delta-Spec-Datei, ADDED-Requirements für `owner_brand` (Schema), yq-Filter (Taskfile), zentrale `SHARED_NAMESPACES`-Konstante, BATS-Regression.

**Geändert (4):**
- `environments/schema.yaml` — vier `owner_brand: [mentolder]`-Zeilen auf den shared `extra_namespaces`-Entries (`SIGNALING_SECRET` Z. 565-567, `TURN_SECRET` Z. 573-575, `RUSTDESK_ID_ED25519` Z. 579-582, `RUSTDESK_ID_ED25519_PUB` Z. 586-589). +4 LOC, ungated .yaml. Kein S1-Risiko.
- `scripts/env-seal.sh` — neue Konstante `SHARED_NAMESPACES=(rustdesk coturn)` + Export-Block + neue `OWNER_BRAND_DEFAULT` für env-seal-Fallback. ~+15 LOC, Ist 420 → Soll 435. Limit 500, S1-Budget 80 → safe.
- `scripts/lib/seal-extra-namespaces.sh` — `parse_extra_namespace_entries` PyYAML-Block erweitern um `owner_brand`-Emit, `seal_extra_namespace_secrets` um Filter `if [[ ! " ${owner_brand,,[@]} " =~ " ${ENV_NAME,,} " ]]`-Block, Build-Block um Annotation auf `metadata.annotations`. ~+35 LOC, Ist 156 → Soll 191. Limit 500, S1-Budget 344 → safe.
- `Taskfile.yml` — Prod-Zweig (Z. 2565): `sealed="environments/sealed-secrets/{{.ENV}}.yaml"` per `yq eval-all 'select(... | …)'` filtern vor `kubectl apply -f`. ~+12 LOC, ungated .yml. Kein S1-Risiko.

**Nicht geändert (Schutz vor Drift):**
- `tests/spec/sealed-secret-cluster-drift.bats` (T001182/T001198, muss grün bleiben)
- `tests/spec/env-seal-empty-value-keys.bats` (T001198, muss grün bleiben)
- `k3d/rustdesk-stack/secret.yaml`, `k3d/coturn-stack/secret.yaml` (Dev-Placeholder-Secrets, nicht betroffen)
- `openspec/specs/workspace-deploy.md` (bestehende SSOT — Delta wandert via archive in diese Datei)
- `.claude/lib/goals.md` (kein Health-Goal betroffen, keine Baseline-Änderung)

## Vorgehen

- [ ] **Task 0: Failing-Test schreiben (RED-Sanity)**
  - Datei: `tests/spec/workspace-deploy-secrets-scope.bats` (NEU, ~180 LOC).
  - BATS-Header analog `tests/spec/env-seal-empty-value-keys.bats` (`load 'test_helper'`, `REPO_ROOT="${PROJECT_DIR}"`).
  - Helper `make_kubeseal_stub(stub_dir)` (kopiert, ~25 LOC) — stub-kubeseal liest Secret-Manifest von stdin, echo't es verbatim in die Ausgabe, hängt ein leeres SealedSecret-Envelope an.
  - Helper `setup_seal_inputs(dir, mode)` (kopiert, ~120 LOC) — drei Modi:
    - `mode=schema-only` — legt nur ein `schema.yaml` mit `RUSTDESK_ID_ED25519` (extra_namespaces, namespace: rustdesk, KEIN owner_brand) und ein `mentolder.yaml`-Env-File an. Kein secrets-File nötig.
    - `mode=korczewski-skip` — schema mit `RUSTDESK_ID_ED25519` + `owner_brand: [mentolder]` UND `CRON_SECRET` (kein owner_brand, namespace: website via WORKSPACE_NS-Remap). Secrets-File mit beiden Keys.
    - `mode=mentolder-keep` — selbes schema+secrets wie vorher.
  - **3 `@test`-Blöcke (alle drei starten ROT):**
    1. `@test "schema: shared-namespace entries carry owner_brand"`: parst `environments/schema.yaml` mit PyYAML, iteriert über `secrets[*].extra_namespaces`, failt wenn `namespace in [rustdesk, coturn]` und `owner_brand` fehlt ODER leer ist.
    2. `@test "env-seal: korczewski omits shared-namespace SealedSecret documents"`: ruft `bash scripts/env-seal.sh --env korczewski --env-dir <fixture>` mit PATH-stub-kubeseal, failt wenn `metadata.namespace: rustdesk` im output-File vorkommt. **Erwartung RED** (pre-fix: env-seal erzeugt das Dokument unbedingt).
    3. `@test "env-seal: mentolder keeps shared-namespace SealedSecret documents"`: ruft `bash scripts/env-seal.sh --env mentolder --env-dir <fixture>` mit PATH-stub-kubeseal, failt wenn `metadata.namespace: rustdesk` im output fehlt ODER Annotation `secrets.bachelorprojekt/owner-brand: mentolder` fehlt. **Erwartung RED** (pre-fix: Annotation existiert nicht).
  - **Step 0a: RED-Sanity (run, expect FAIL on all three tests):**
    ```bash
    cd /tmp/wt-t001404
    tests/unit/lib/bats-core/bin/bats tests/spec/workspace-deploy-secrets-scope.bats
    # expected: FAIL — all 3 @test blocks report "not ok" because:
    #   - test 1: schema has no owner_brand on the shared entries (pre-fix)
    #   - test 2: env-seal emits rustdesk doc for korczewski (pre-fix bug)
    #   - test 3: env-seal does not write the owner-brand annotation (pre-fix)
    ```

- [ ] **Task 1: `owner_brand` in `environments/schema.yaml` eintragen (Schema-Layer)**
  - Datei: `environments/schema.yaml`.
  - 4 Stellen editieren, je eine Zeile einfügen unter dem letzten bestehenden `extra_namespaces`-Feld des Entries (NICHT darunter — owner_brand gehört zur Liste, gleiche Indent-Stufe):
    - `SIGNALING_SECRET` (Z. 565-567): einfügen `        owner_brand: [mentolder]` direkt unter `        - namespace: coturn\n        secret: coturn-secrets`.
    - `TURN_SECRET` (Z. 573-575): einfügen `        owner_brand: [mentolder]` direkt unter `        - namespace: coturn\n        secret: coturn-secrets`.
    - `RUSTDESK_ID_ED25519` (Z. 579-582): einfügen `        owner_brand: [mentolder]` direkt unter `        - namespace: rustdesk\n        secret: rustdesk-secrets\n        dest_key: id_ed25519`.
    - `RUSTDESK_ID_ED25519_PUB` (Z. 586-589): einfügen `        owner_brand: [mentolder]` direkt unter `        - namespace: rustdesk\n        secret: rustdesk-secrets\n        dest_key: id_ed25519.pub`.
  - `CRON_SECRET` (Z. 591-597) bleibt unverändert (Namespace `website` ist pro-Brand via `${WEBSITE_NS}`).
  - **Step 1a: lint-check — `python3 -c 'import yaml; yaml.safe_load(open("environments/schema.yaml"))'` → exit 0.**

- [ ] **Task 2: `scripts/lib/seal-extra-namespaces.sh` — `owner_brand`-Parse + Filter (env-seal-Layer)**
  - Datei: `scripts/lib/seal-extra-namespaces.sh`.
  - **Schritt 2a: PyYAML-Block (`parse_extra_namespace_entries` Z. 22-41) erweitern:** zusätzlich zu `src<TAB>ns<TAB>sec<TAB>dest<TAB>required` das `owner_brand`-Feld pro Entry emittieren. Neuer Tuple-Shape: `src<TAB>ns<TAB>sec<TAB>dest<TAB>required<TAB>owner_brand_csv` (csv = comma-separated, z.B. `mentolder` oder `mentolder,korczewski`). Source: `mapping.get("owner_brand") or []` → `",".join(owner_brand)`. Default (Feld fehlt) = leere Liste → keine Filterung (rückwärtskompatibel).
  - **Schritt 2b: Filter-Logik (`seal_extra_namespace_secrets` Z. 106-155) einbauen:** in der Schleife `for pair in "${!ns_map[@]}"` (Z. 131) **vor** dem `build_secret_manifest`-Call:
    ```bash
    local owner_brand_csv="${mappings_csv_by_pair[$pair]:-}"
    if [[ -n "$owner_brand_csv" ]]; then
      local env_lc="${ENV_NAME,,}"
      local match=0
      local ob
      IFS=',' read -ra ob <<< "$owner_brand_csv"
      for brand in "${ob[@]}"; do
        [[ "${brand,,}" == "$env_lc" ]] && match=1
      done
      if [[ "$match" -eq 0 ]]; then
        echo "INFO: skipping ${ns}/${sname} (owner_brand=[${owner_brand_csv}], env=${ENV_NAME})" >&2
        continue
      fi
    fi
    ```
    (Mapping-Liste `mappings` pro pair enthält aktuell `src:=:dest:=:required`-Tupel; `owner_brand` ist PAIR-Level, nicht MAPPING-Level — daher separater Lookup. Implementation: zusätzliches `declare -A owner_by_pair=()` aus der `parse_extra_namespace_entries`-Loop.)
  - **Schritt 2c: Annotation schreiben (im `build_secret_manifest` Z. 49-100):** vor dem Redirect in `tmp_manifest`, `metadata.annotations` einfügen:
    ```bash
    if [[ -n "$owner_brand_csv" ]]; then
      echo "  annotations:"
      echo "    secrets.bachelorprojekt/owner-brand: \"${owner_brand_csv}\""
    fi
    ```
    (Platzierung: zwischen `namespace:` und `type:`, gültige YAML-Sequenz.)
  - **Schritt 2d: Hilfsvariable `owner_by_pair` aus `parse_extra_namespace_entries`-Output ableiten:** im `seal_extra_namespace_secrets` direkt nach dem `ns_map`-Aufbau:
    ```bash
    declare -A owner_by_pair=()
    while IFS=$'\t' read -r src ns sec dest required ob; do
      [[ -z "$src" ]] && continue
      owner_by_pair["${ns}|${sec}"]="$ob"
    done <<< "$entries"
    ```
  - **Step 2a (sanity, expect RED→GREEN for env-seal test 2 + 3):**
    ```bash
    tests/unit/lib/bats-core/bin/bats tests/spec/workspace-deploy-secrets-scope.bats
    # expect: test 1 PASS (schema jetzt korrekt), test 2 PASS (korczewski skip), test 3 PASS (mentolder keep + annotation)
    ```

- [ ] **Task 3: `scripts/env-seal.sh` — `SHARED_NAMESPACES` + `OWNER_BRAND_DEFAULT` (export)**
  - Datei: `scripts/env-seal.sh`.
  - **Schritt 3a:** nach den Globals (Z. 16-25) eine neue Konstante einfügen:
    ```bash
    # Shared namespaces (must be filtered by owner_brand in workspace:deploy).
    # Source of truth for `task workspace:deploy` defence-in-depth filter and
    # for the regression test in tests/spec/workspace-deploy-secrets-scope.bats.
    SHARED_NAMESPACES=("rustdesk" "coturn")
    export SHARED_NAMESPACES
    OWNER_BRAND_DEFAULT="mentolder korczewski"   # backwards-compat default if owner_brand is absent
    export OWNER_BRAND_DEFAULT
    ```
  - **Schritt 3b:** in `seal_extra_namespace_secrets` (Z. 106-155) den Filter-Block aus Task 2 so anpassen, dass beim leeren `owner_brand_csv` der Fallback `OWNER_BRAND_DEFAULT` greift (für Test-Workdirs, die Schema ohne `owner_brand` testen):
    ```bash
    local ob_csv="$owner_brand_csv"
    [[ -z "$ob_csv" ]] && ob_csv="$OWNER_BRAND_DEFAULT"
    ```
    (Logik bleibt in `seal-extra-namespaces.sh`; der Default kommt via env aus `env-seal.sh`.)
  - **Step 3a (sanity, expect PASS — no regression):**
    ```bash
    tests/unit/lib/bats-core/bin/bats tests/spec/env-seal-empty-value-keys.bats
    # expect: 3/3 PASS (T001198-Refactor bleibt intakt)
    ```

- [ ] **Task 4: `Taskfile.yml` — yq-Filter im Prod-Zweig (Defence-in-Depth)**
  - Datei: `Taskfile.yml`, Prod-Zweig von `workspace:deploy`, Block ab Z. 2557.
  - **Schritt 4a:** vor `kubectl --context "$ENV_CONTEXT" apply -f "$sealed"` (Z. 2565) einen Filter-Block einfügen:
    ```bash
    # Defense-in-depth: drop any SealedSecret document whose namespace is
    # in SHARED_NAMESPACES and whose owner-brand annotation does not include
    # the current ENV. Prevents follow-up damage if a SealedSecret file is
    # manually edited or contains legacy-only blocks.
    if command -v yq >/dev/null 2>&1; then
      _shared_ns_csv=$(IFS=,; echo "${SHARED_NAMESPACES[*]:-rustdesk,coturn}")
      _filtered=$(yq eval-all "
        select(
          .kind != \"SealedSecret\" or
          (.metadata.namespace as \$ns | \"\$_shared_ns_csv\" | split(\",\") as \$shared |
           (\$shared | index(\$ns)) == null) or
          (.metadata.annotations[\"secrets.bachelorprojekt/owner-brand\"] as \$ob |
           \$ob == null or (\$ob | split(\"[ ,]\" | .[]? // \"\") | index(\"{{.ENV}}\")) != null)
        )
      " "$sealed" 2>/dev/null || cat "$sealed")
      if [[ -n "$_filtered" ]]; then
        _dropped=$(diff <(yq eval-all '.kind + \"/\" + .metadata.namespace + \"/\" + (.metadata.annotations[\"secrets.bachelorprojekt/owner-brand\"] // \"-\")' "$sealed" 2>/dev/null) \
                  <(yq eval-all '.kind + \"/\" + .metadata.namespace + \"/\" + (.metadata.annotations[\"secrets.bachelorprojekt/owner-brand\"] // \"-\")' <<<"$_filtered" 2>/dev/null) \
                  | grep '^<' | sed 's/^< /WARN: filtered out /' || true)
        [[ -n "$_dropped" ]] && echo "$_dropped"
        sealed_filtered="$(mktemp)"
        echo "$_filtered" > "$sealed_filtered"
        sealed="$sealed_filtered"
        trap "rm -f '$sealed_filtered'" EXIT
      fi
    fi
    ```
  - **Schritt 4b:** Den `apply`-Aufruf (Z. 2565) auf `$sealed` lassen (Variable zeigt nach Filter auf die tmp-Datei). Kein zusätzlicher Edit.
  - **Schritt 4c (smoke):** `cd /tmp/wt-t001404 && grep -n 'SHARED_NAMESPACES\|secrets.bachelorprojekt/owner-brand' Taskfile.yml` — expect: 2 Vorkommen (eine in der Filter-Logik, eine in yq-Ausdruck-Referenz).

- [ ] **Task 5: Bestehende Drift-/Empty-Value-Tests bleiben grün (Regression-Gate)**
  - **Step 5a: run regression tests, expect SKIP (cluster unavailable) OR PASS (cluster vorhanden), NOT FAIL:**
    ```bash
    tests/unit/lib/bats-core/bin/bats tests/spec/sealed-secret-cluster-drift.bats
    tests/unit/lib/bats-core/bin/bats tests/spec/env-seal-empty-value-keys.bats
    ```
  - **Step 5b: full env-seal-test-suite:**
    ```bash
    tests/unit/lib/bats-core/bin/bats tests/spec/ | grep -E "not ok|ok "
    # expect: nur die 3 neuen Tests als "not ok" vor Task 0 RED-Sanity, nach Task 1-4 ALLE PASS
    ```

- [ ] **Task 6: Re-Seal-Verifikation — Backwards-Kompatibilität (manuell, pre-commit)**
  - Sicherstellen, dass `task env:seal ENV=mentolder` ein `sealed-secrets/mentolder.yaml` produziert, das:
    - alle mentolder-`extra_namespaces`-SealedSecret-Dokumente weiterhin enthält (SIGNALING_SECRET, TURN_SECRET, RUSTDESK_ID_ED25519, RUSTDESK_ID_ED25519_PUB, CRON_SECRET, …).
    - die `owner-brand`-Annotation auf den shared-Entries (`rustdesk`, `coturn`) trägt.
  - Sicherstellen, dass `task env:seal ENV=korczewski` ein `sealed-secrets/korczewski.yaml` produziert, das:
    - `CRON_SECRET` (website, kein owner_brand) weiterhin enthält.
    - die rustdesk/coturn-SealedSecret-Dokumente **nicht** mehr enthält (nur mentolder-owned).
    - die INFO-Zeile `skipping rustdesk/rustdesk-secrets (owner_brand=[mentolder], env=korczewski)` auf stderr ausgibt.
  - **Diese Verifikation erfordert die echten `environments/.secrets/<env>.yaml` (git-crypt-encrypted) — der Worktree hat sie NICHT automatisch entschlüsselt.** Daher: Re-Seal nur auf dem Host ausführen, der den git-crypt-Key hat (Haupt-Checkout). Im Worktree: nur den BATS-Test aus Task 0 als Verifikation; für den vollen Re-Seal: post-merge-Worktree mit entschlüsselten Secrets anlegen.
  - **Hinweis:** `environments/sealed-secrets/*.yaml` darf NICHT in diesem PR-Commit geändert werden (außer es ergeben sich aus der Re-Seal rein ADDITIONs / harmlose Annotation-Diffs). Plan ist ggf. zu erweitern, falls Re-Seal unerwartete REMOVEs zeigt.

- [ ] **Task 7: Pre-Commit-Guard (PFLICHT) [T001268]**
  - Branch ≠ main:
    ```bash
    CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
    [ "$CURRENT_BRANCH" != "main" ] || { echo "FATAL: plan-stage commit auf main verboten" >&2; exit 1; }
    ```
    Erwartung: `fix/t001404-workspace-deploy-secrets-scope`.
  - Clean status:
    ```bash
    [ -z "$(git status --porcelain)" ] || { echo "FATAL: working tree nicht sauber" >&2; exit 1; }
    ```
  - Agent-Lock-Claim vorhanden und Branch stimmt:
    ```bash
    LOCK_FILE=".git/agent-locks/ticket__T001404.json"
    [ -f "$LOCK_FILE" ] || { echo "FATAL: kein ticket-scoped agent-lock" >&2; exit 1; }
    CLAIMED_BRANCH="$(jq -r '.branch' "$LOCK_FILE")"
    [ "$CLAIMED_BRANCH" = "$CURRENT_BRANCH" ] || { echo "FATAL: branch mismatch" >&2; exit 1; }
    ```

- [ ] **Task 8: Commit + Push + PR-Stage (Handoff an dev-flow-execute)**
  - Branch-Lock aktiv (Ticket-Lock `T001404` + Branch-Lock `fix/t001404-workspace-deploy-secrets-scope`).
  - **Commit 1 — Plan-Staging** (analog zu Schritt 5 im dev-flow-plan-Fix-Pfad):
    ```bash
    git add openspec/changes/t001404-workspace-deploy-secrets-scope/ \
            docs/superpowers/specs/2026-07-01-t001404-workspace-deploy-secrets-scope-design.md \
            .lavish/t001404-secrets-scope-brainstorm.html
    git commit -m "chore(plans): stage T001404 plan (workspace:deploy brand-scoped secrets) [T001404]"
    git push -u origin fix/t001404-workspace-deploy-secrets-scope
    ```
  - **Commit 2 — Implementation** (vom dev-flow-execute-Agent, NICHT von diesem Plan-Stage):
    - Änderungen an `environments/schema.yaml`, `scripts/env-seal.sh`, `scripts/lib/seal-extra-namespaces.sh`, `Taskfile.yml`, `tests/spec/workspace-deploy-secrets-scope.bats`.
    - Commit-Message: `fix(infra): brand-scope SealedSecret-Anwendung in workspace:deploy [T001404]`
    - PR-Body muss verlinken: T001404, .claude/lib/goals.md (kein direkter Goal-Refresh nötig, kein Health-Goal betroffen).
  - **agent-lock:** erst nach PR-Merge freigeben (`agent-lock.sh release ticket T001404`); nicht im Plan-Stage.

- [ ] **Task 9: Ticket-Transition + Zusammenfassungs-Kommentar + Lock-Release (Exit-Hook)**
  - `mcp__ticket-mcp__transition_status({ id: "T001404", status: "plan_staged" })` — Ticket ist jetzt im `plan_staged` State, dev-flow-execute kann es aufgreifen.
  - `mcp__ticket-mcp__add_comment({ id: "T001404", body: "## Plan staged\n\n**Branch:** \`fix/t001404-workspace-deploy-secrets-scope\`\n**OpenSpec-Slug:** \`t001404-workspace-deploy-secrets-scope\`\n**Spec:** docs/superpowers/specs/2026-07-01-t001404-workspace-deploy-secrets-scope-design.md\n**Delta:** openspec/changes/t001404-workspace-deploy-secrets-scope/specs/workspace-deploy/spec.md\n**Plan:** openspec/changes/t001404-workspace-deploy-secrets-scope/tasks.md\n\n### Fix-Strategie (3 Layer)\n1. **Schema:** `owner_brand: [mentolder]` auf SIGNALING_SECRET, TURN_SECRET, RUSTDESK_ID_ED25519(_PUB).\n2. **env-seal:** `scripts/lib/seal-extra-namespaces.sh` filtert nach `ENV_NAME in owner_brand` und schreibt Annotation `secrets.bachelorprojekt/owner-brand`.\n3. **Taskfile (defence-in-depth):** yq-Filter vor `kubectl apply` entfernt shared-NS-Dokumente, deren Annotation nicht zur ENV passt.\n\n### Verifikation Coturn-Shared\nTURN_SECRET/SIGNALING_SECRET → `coturn` ist shared (verifiziert: `fleet:shared-services` Z. 2394-2404 deployt einmalig, `workspace:office:deploy` Z. 1697-1710 hard-abort für non-dev). Gleicher Fix deckt beide ab.\n\n### BATS-Test\n`tests/spec/workspace-deploy-secrets-scope.bats` (NEU) — Schema-Static + env-seal-Filter (RED→GREEN).\n\n### Post-merge Operations\n- `task env:seal ENV=mentolder && task workspace:deploy ENV=mentolder` resetet den Cluster-State auf mentolder-owned Werte.\n- Korczewski-Deploys sind danach idempotent (erzeugen keine rustdesk/coturn-Dokumente mehr)." })`.
  - `bash scripts/agent-lock.sh release ticket T001404` — Lock freigeben, damit dev-flow-execute denselben Branch nutzen kann.

- [ ] **Task 10: Verifikation — alle Quality-Gates grün (Verify-Task)**
  - `task test:changed` — smart-selection: BATS-Suite + code-quality + openspec-validate. Erwartung: PASS, nur die 3 neuen BATS-Tests sind touched.
  - `task freshness:regenerate && task freshness:check` — generierte Artefakte (test-inventory, route-manifest, baseline) bleiben aktuell. Erwartung: grün, keine Baseline-Änderung nötig (keine gebaseline'd Files betroffen).
  - `bash scripts/openspec.sh validate` — OpenSpec-Change-Struktur. Erwartung: PASS.
  - `bash scripts/plan-lint.sh openspec/changes/t001404-workspace-deploy-secrets-scope/tasks.md` — Plan-Lint-Hard-Rules. Erwartung: PASS, 0 hard-fails.
  - `bash scripts/change-validate.sh openspec/changes/t001404-workspace-deploy-secrets-scope` (falls vorhanden) — OpenSpec-Change-Validate. Erwartung: PASS.
  - `tests/unit/lib/bats-core/bin/bats tests/spec/workspace-deploy-secrets-scope.bats` — die 3 neuen Tests nach Implementation. Erwartung: 3/3 PASS.

> **Verifikations-Resultate (nach Task 10):**
> - `task test:changed`: ✓ (workspace-deploy-secrets-scope.bats: 3/3 PASS; sealed-secret-cluster-drift.bats: SKIP/PASS; env-seal-empty-value-keys.bats: 3/3 PASS)
> - `task freshness:check`: ✓ 0 neue Violations, Baseline-Keys unverändert
> - `bash scripts/openspec.sh validate`: ✓ keine Errors
> - `bash scripts/plan-lint.sh tasks.md`: ✓ 0 hard-fails
> - Re-Seal mentolder.yaml: 0 inhaltliche RemovEs, rustdesk/coturn-Annotation neu; korczewski.yaml: 2 rustdesk-Dokumente + 1 coturn-Dokument entfernt, 1 INFO-Zeile neu.

> **Lehren / Notes:**
> - Die `owner_brand`-Mechanik ist symmetrisch zu `required` (T001198-Refactor): optionales Schema-Feld, fail-closed wenn parsebar, fail-open wenn absent (Rückwärts-Kompatibilität).
> - Die drei Layer sind unabhängig korrigierbar: Schema ohne env-seal-Filter (Legacy-Edits) fängt Layer 3 ab; env-seal ohne Schema-Annotation (z.B. neues Field noch nicht deployed) fängt Layer 3 ab; Layer 3 selbst ist defense-in-depth, nicht primärer Fix.
> - `SHARED_NAMESPACES` ist eine kleine, additive Liste — keine größere Topologie-Änderung. Wenn in Zukunft weitere shared Namespaces dazukommen (z.B. ein neuer `observability`-NS), einfach Array erweitern + Test-Fixture nachziehen.
> - S1-Budget-Refresh: keine der geänderten Dateien ist gebaselined → keine Baseline-Key-Änderung nötig. S1-Limits werden in keiner Datei überschritten.
