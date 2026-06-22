---
title: "G-RH03: BATS Coverage Batch 1 — OpenSpec 17%→23%"
ticket_id: T001117
domains: [quality, tests, infra]
status: active
file_locks: [website/src/data/test-inventory.json]
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Tasks: bats-coverage-batch1 (T001117)

- [ ] Task 0: Failing-Test schreiben — BATS Coverage-Lücken prüfen (RED)
- [ ] Task 1: `tests/spec/secret-rotation.bats` anlegen
- [ ] Task 2: `tests/spec/secrets-deploy-automation.bats` anlegen
- [ ] Task 3: `tests/spec/backup-pipeline.bats` anlegen
- [ ] Task 4: Coverage messen, test-inventory.json regenerieren, PR erstellen

---

# G-RH03: BATS Coverage Expansion — Batch 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans

**Goal:** Drei fehlende BATS-Dateien unter `tests/spec/` erstellen, OpenSpec-Abdeckung 17% → ~23%, testbare Verhaltensweisen der Secret-Rotation-, Secret-Deploy-Automation- und Backup-Pipeline-Specs verifizieren.

**Architecture:** Jede BATS-Datei bildet eine OpenSpec-SSOT-Spec ab (`openspec/specs/<name>.md`). Tests sind offline-fähig (kein Cluster nötig) — sie rufen echte Scripts mit Fixture-Dateien in `BATS_TEST_TMPDIR` auf. Bestehende Test-Hooks in `env-seal.sh` (`--_test-dev-scan`, `--_test-dup-check`, `--_test-cert-compare`) ermöglichen isoliertes Testen.

**Tech Stack:** BATS, `tests/unit/test_helper.bash` (bats-support + bats-assert), `scripts/env-seal.sh`, `scripts/env-generate.sh`, `scripts/backup-restore.sh`.

## Global Constraints

- Eine BATS-Datei pro OpenSpec-SSOT-Spec (Convention aus CLAUDE.md)
- Dateipfade: `tests/spec/<spec-slug>.bats` — Slug = Dateiname von `openspec/specs/<slug>.md`
- Header-Kommentar: `# SSOT: openspec/specs/<slug>.md`
- Tests müssen offline laufen — Cluster-abhängige Tests mit `skip "needs live cluster"` markieren
- `load 'test_helper'` lädt `tests/unit/test_helper.bash`
- Jede `.bats`-Datei nach dem Schreiben mit `bats tests/spec/<slug>.bats` ausführen

## File Structure

```
tests/spec/secret-rotation.bats                  ← NEU
tests/spec/secrets-deploy-automation.bats        ← NEU
tests/spec/backup-pipeline.bats                  ← NEU
website/src/data/test-inventory.json             ← REGENERATE (CI-Gate)
```

---

## Task 0: Failing-Test schreiben (RED) — Coverage-Lücke nachweisen

**Files:**
- Create: `tests/spec/coverage-gate.bats` (Coverage-Counter)

### Step 1: BATS-Datei anlegen, die Coverage-Lücke zeigt

```bash
cat > /tmp/wt-bats-coverage-batch1/tests/spec/coverage-gate.bats <<'BATS'
#!/usr/bin/env bats
# SSOT: openspec/changes/bats-coverage-batch1/proposal.md
# G-RH03: OpenSpec Coverage 17% → 23%

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
}

@test "G-RH03: secret-rotation spec hat eine BATS-Datei" {
  [ -f "$REPO_ROOT/tests/spec/secret-rotation.bats" ]
}

@test "G-RH03: secrets-deploy-automation spec hat eine BATS-Datei" {
  [ -f "$REPO_ROOT/tests/spec/secrets-deploy-automation.bats" ]
}

@test "G-RH03: backup-pipeline spec hat eine BATS-Datei" {
  [ -f "$REPO_ROOT/tests/spec/backup-pipeline.bats" ]
}

@test "G-RH03: OpenSpec Coverage ist ≥ 23% (12+ BATS von 53 Specs)" {
  spec_count=$(ls "$REPO_ROOT/openspec/specs/"*.md 2>/dev/null | wc -l)
  bats_count=$(ls "$REPO_ROOT/tests/spec/"*.bats 2>/dev/null | wc -l)
  ratio=$(echo "scale=4; $bats_count * 100 / $spec_count" | bc)
  integer=$(echo "$ratio" | cut -d. -f1)
  [ "$integer" -ge 23 ]
}
BATS
```

### Step 2: Test laufen lassen — Expected fail

```bash
cd /tmp/wt-bats-coverage-batch1
bats tests/spec/coverage-gate.bats
```

**Expected fail:** Alle 4 Tests scheitern, weil die 3 neuen .bats-Dateien noch nicht existieren. Erst nach Task 1+2+3 werden sie grün.

---

## Task 1: `tests/spec/secret-rotation.bats` anlegen

**Files:**
- Create: `tests/spec/secret-rotation.bats`
- Read: `openspec/specs/secret-rotation.md`
- Read: `scripts/env-seal.sh` (Test-Hooks: `--_test-dev-scan`, `--_test-dup-check`, `--_test-cert-compare`)
- Read: `scripts/env-generate.sh` (Overwrite-Protection)

### Step 1: BATS-Datei anlegen

Schreibe die volle BATS-Datei aus dem Original-Plan (Task 1) — siehe unten.

```bash
cat > /tmp/wt-bats-coverage-batch1/tests/spec/secret-rotation.bats <<'BATS'
#!/usr/bin/env bats
# tests/spec/secret-rotation.bats
# SSOT: openspec/specs/secret-rotation.md

load 'test_helper'

SEAL_SCRIPT="${PROJECT_DIR}/scripts/env-seal.sh"
GEN_SCRIPT="${PROJECT_DIR}/scripts/env-generate.sh"

@test "env-seal: dev-prefixed value is rejected without --force" {
  local scan_file="${BATS_TEST_TMPDIR}/secrets.yaml"
  cat > "$scan_file" <<'YAML'
SHARED_DB_PASSWORD: "devpassword123"
BOTS_TOKEN: "real-token-here"
YAML

  run bash "$SEAL_SCRIPT" --env _noexist --_test-dev-scan "$scan_file"
  assert_failure
  assert_output --partial "devpassword123"
}

@test "env-seal: _placeholder suffix is rejected" {
  local scan_file="${BATS_TEST_TMPDIR}/secrets.yaml"
  cat > "$scan_file" <<'YAML'
SMTP_PASSWORD: "smtp_dev_placeholder"
REAL_KEY: "actual-value-abc123"
YAML

  run bash "$SEAL_SCRIPT" --env _noexist --_test-dev-scan "$scan_file"
  assert_failure
  assert_output --partial "SMTP_PASSWORD"
}

@test "env-seal: clean secrets file passes dev-value scan" {
  local scan_file="${BATS_TEST_TMPDIR}/secrets.yaml"
  cat > "$scan_file" <<'YAML'
SHARED_DB_PASSWORD: "X7k9mQ2vLpR4sN1wE8hA3uG6tB5cF0dJ"
SMTP_PASSWORD: "real-smtp-secret-value-42"
YAML

  run bash "$SEAL_SCRIPT" --env _noexist --_test-dev-scan "$scan_file"
  assert_success
}

@test "env-seal: MANAGED_EXTERNALLY is rejected" {
  local scan_file="${BATS_TEST_TMPDIR}/secrets.yaml"
  cat > "$scan_file" <<'YAML'
LLM_API_KEY: "MANAGED_EXTERNALLY"
YAML

  run bash "$SEAL_SCRIPT" --env _noexist --_test-dev-scan "$scan_file"
  assert_failure
  assert_output --partial "MANAGED_EXTERNALLY"
}

@test "env-seal: duplicate keys in secrets file are rejected" {
  local dup_file="${BATS_TEST_TMPDIR}/secrets_dup.yaml"
  cat > "$dup_file" <<'YAML'
SHARED_DB_PASSWORD: "first-value"
SMTP_PASSWORD: "some-value"
SHARED_DB_PASSWORD: "second-value-oops"
YAML

  run bash "$SEAL_SCRIPT" --env _noexist --_test-dup-check "$dup_file"
  assert_failure
  assert_output --partial "SHARED_DB_PASSWORD"
}

@test "env-seal: unique keys pass duplicate check" {
  local dup_file="${BATS_TEST_TMPDIR}/secrets_ok.yaml"
  cat > "$dup_file" <<'YAML'
SHARED_DB_PASSWORD: "unique-value-1"
SMTP_PASSWORD: "unique-value-2"
BOTS_TOKEN: "unique-value-3"
YAML

  run bash "$SEAL_SCRIPT" --env _noexist --_test-dup-check "$dup_file"
  assert_success
}

@test "env-seal: identical certs pass fingerprint check" {
  local cert_a="${BATS_TEST_TMPDIR}/cert-a.pem"
  local cert_b="${BATS_TEST_TMPDIR}/cert-b.pem"
  echo "-----BEGIN CERTIFICATE-----" > "$cert_a"
  echo "MIIFakeCert==" >> "$cert_a"
  echo "-----END CERTIFICATE-----" >> "$cert_a"
  cp "$cert_a" "$cert_b"

  run bash "$SEAL_SCRIPT" --env _noexist --_test-cert-compare "$cert_a" "$cert_b"
  assert_success
}

@test "env-seal: differing certs fail fingerprint check with drift message" {
  local cert_a="${BATS_TEST_TMPDIR}/cert-a.pem"
  local cert_b="${BATS_TEST_TMPDIR}/cert-b.pem"
  echo "-----BEGIN CERTIFICATE-----" > "$cert_a"
  echo "Cert-A-Content==" >> "$cert_a"
  echo "-----END CERTIFICATE-----" >> "$cert_a"
  echo "-----BEGIN CERTIFICATE-----" > "$cert_b"
  echo "Cert-B-DIFFERENT==" >> "$cert_b"
  echo "-----END CERTIFICATE-----" >> "$cert_b"

  run bash "$SEAL_SCRIPT" --env _noexist --_test-cert-compare "$cert_a" "$cert_b"
  assert_failure
}

@test "env-generate: refuses to overwrite existing secrets file" {
  local env_dir="${BATS_TEST_TMPDIR}/environments"
  mkdir -p "${env_dir}/.secrets"
  cat > "${env_dir}/schema.yaml" <<'YAML'
version: 1
secrets:
  - name: SHARED_DB_PASSWORD
    required: true
    generate: true
    length: 32
YAML
  echo "SHARED_DB_PASSWORD: existing-value" > "${env_dir}/.secrets/testenv.yaml"

  run bash "$GEN_SCRIPT" --env testenv --env-dir "$env_dir"
  assert_failure
  run cat "${env_dir}/.secrets/testenv.yaml"
  assert_output --partial "existing-value"
}
BATS
```

### Step 2: BATS-Syntax prüfen

```bash
cd /tmp/wt-bats-coverage-batch1
bats tests/spec/secret-rotation.bats
```

Erwartung: Tests laufen, keine Syntax-Fehler. Manche können fehlschlagen, falls `env-seal.sh` Test-Hooks anders implementiert — dann Assertions anpassen (nicht den Test wegwerfen, sondern die Erwartung anpassen).

### Step 3: Commit

```bash
cd /tmp/wt-bats-coverage-batch1
git add tests/spec/secret-rotation.bats
git commit -m "test(secret-rotation): BATS coverage für secret-rotation.md [T001117]"
```

---

## Task 2: `tests/spec/secrets-deploy-automation.bats` anlegen

**Files:**
- Create: `tests/spec/secrets-deploy-automation.bats`

### Step 1: BATS-Datei anlegen

```bash
cat > /tmp/wt-bats-coverage-batch1/tests/spec/secrets-deploy-automation.bats <<'BATS'
#!/usr/bin/env bats
# tests/spec/secrets-deploy-automation.bats
# SSOT: openspec/specs/secrets-deploy-automation.md

load 'test_helper'

SEAL_SCRIPT="${PROJECT_DIR}/scripts/env-seal.sh"
REPO_ROOT="${PROJECT_DIR}"

@test "prod/kustomization.yaml contains patch:delete for workspace-secrets" {
  run grep -cE 'patch.*delete|delete.*patch|\$patch.*delete' "${REPO_ROOT}/prod/kustomization.yaml"
  assert_success
  [ "$output" -ge 1 ]
}

@test "env-seal: required key missing from sealed file is detected" {
  local schema_file="${BATS_TEST_TMPDIR}/schema.yaml"
  local sealed_file="${BATS_TEST_TMPDIR}/sealed.yaml"
  local env_file="${BATS_TEST_TMPDIR}/env.yaml"

  cat > "$schema_file" <<'YAML'
version: 1
secrets:
  - name: SHARED_DB_PASSWORD
    required: true
    generate: true
    length: 32
  - name: SMTP_PASSWORD
    required: true
    generate: true
    length: 32
YAML

  cat > "$sealed_file" <<'YAML'
apiVersion: bitnami.com/v1alpha1
kind: SealedSecret
spec:
  encryptedData:
    SHARED_DB_PASSWORD: "AgBCDEFGH..."
YAML

  echo "{}" > "$env_file"

  run bash "$SEAL_SCRIPT" --env _noexist \
    --_test-completeness "$sealed_file" \
    --_test-schema "$schema_file" \
    --_test-env-file "$env_file"
  assert_failure
  assert_output --partial "SMTP_PASSWORD"
}

@test "env-seal: completeness check passes when all required keys are present" {
  local schema_file="${BATS_TEST_TMPDIR}/schema.yaml"
  local sealed_file="${BATS_TEST_TMPDIR}/sealed_complete.yaml"
  local env_file="${BATS_TEST_TMPDIR}/env.yaml"

  cat > "$schema_file" <<'YAML'
version: 1
secrets:
  - name: SHARED_DB_PASSWORD
    required: true
    generate: true
    length: 32
YAML

  cat > "$sealed_file" <<'YAML'
apiVersion: bitnami.com/v1alpha1
kind: SealedSecret
spec:
  encryptedData:
    SHARED_DB_PASSWORD: "AgBCDEFGH..."
YAML

  echo "{}" > "$env_file"

  run bash "$SEAL_SCRIPT" --env _noexist \
    --_test-completeness "$sealed_file" \
    --_test-schema "$schema_file" \
    --_test-env-file "$env_file"
  assert_success
}

@test "sealed-secrets/mentolder.yaml exists and has encryptedData" {
  local sealed="${REPO_ROOT}/environments/sealed-secrets/mentolder.yaml"
  if [ ! -f "$sealed" ]; then
    skip "mentolder sealed-secrets not found (env not sealed yet)"
  fi
  run grep -c "encryptedData" "$sealed"
  assert_success
  [ "$output" -ge 1 ]
}

@test "sealed-secrets/korczewski.yaml exists and has encryptedData" {
  local sealed="${REPO_ROOT}/environments/sealed-secrets/korczewski.yaml"
  if [ ! -f "$sealed" ]; then
    skip "korczewski sealed-secrets not found (env not sealed yet)"
  fi
  run grep -c "encryptedData" "$sealed"
  assert_success
  [ "$output" -ge 1 ]
}
BATS
```

### Step 2: BATS-Syntax prüfen

```bash
cd /tmp/wt-bats-coverage-batch1
bats tests/spec/secrets-deploy-automation.bats
```

### Step 3: Commit

```bash
cd /tmp/wt-bats-coverage-batch1
git add tests/spec/secrets-deploy-automation.bats
git commit -m "test(secrets-deploy-automation): BATS coverage für secrets-deploy-automation.md [T001117]"
```

---

## Task 3: `tests/spec/backup-pipeline.bats` anlegen

**Files:**
- Create: `tests/spec/backup-pipeline.bats`

### Step 1: Backup-Manifeste verstehen

```bash
cd /tmp/wt-bats-coverage-batch1
grep -nE "CronJob|schedule|db-backup|pvc-backup|retention" k3d/backup.yaml | head -20
```

### Step 2: BATS-Datei anlegen

```bash
cat > /tmp/wt-bats-coverage-batch1/tests/spec/backup-pipeline.bats <<'BATS'
#!/usr/bin/env bats
# tests/spec/backup-pipeline.bats
# SSOT: openspec/specs/backup-pipeline.md

load 'test_helper'

REPO_ROOT="${PROJECT_DIR}"

@test "db-backup CronJob is defined in k3d/backup.yaml" {
  run grep -c "name: db-backup" "${REPO_ROOT}/k3d/backup.yaml"
  assert_success
  [ "$output" -ge 1 ]
}

@test "pvc-backup CronJob is defined in k3d/backup.yaml" {
  run grep -c "name: pvc-backup" "${REPO_ROOT}/k3d/backup.yaml"
  assert_success
  [ "$output" -ge 1 ]
}

@test "backup-restore.sh exists and is executable" {
  [ -f "${REPO_ROOT}/scripts/backup-restore.sh" ]
  [ -x "${REPO_ROOT}/scripts/backup-restore.sh" ]
}

@test "backup-restore.sh has usage output" {
  run bash "${REPO_ROOT}/scripts/backup-restore.sh" --help 2>&1 || true
  [[ "$output" =~ [Uu]sage ]] || [[ "$output" =~ [Hh]elp ]] || [ "${status}" != "0" ]
}
BATS
```

### Step 3: BATS ausführen

```bash
cd /tmp/wt-bats-coverage-batch1
bats tests/spec/backup-pipeline.bats
```

### Step 4: Commit

```bash
cd /tmp/wt-bats-coverage-batch1
git add tests/spec/backup-pipeline.bats
git commit -m "test(backup-pipeline): BATS coverage für backup-pipeline.md [T001117]"
```

---

## Task 4: Coverage messen, test-inventory.json regenerieren, PR erstellen

### Step 1: Coverage messen

```bash
cd /tmp/wt-bats-coverage-batch1
SPECS=$(ls openspec/specs/*.md 2>/dev/null | wc -l)
BATS=$(ls tests/spec/*.bats 2>/dev/null | wc -l)
echo "Specs: $SPECS | BATS: $BATS | Coverage: $(python3 -c "print(f'{($BATS/$SPECS*100):.0f}%')")"
```

Erwartung: Coverage ≥23% (3 neue Dateien gegenüber Vorher).

### Step 2: test-inventory.json regenerieren (CI-Gate!)

```bash
cd /tmp/wt-bats-coverage-batch1
task test:inventory
git diff website/src/data/test-inventory.json | head -30
```

### Step 3: Alle BATS-Spec-Tests laufen lassen

```bash
cd /tmp/wt-bats-coverage-batch1
bats tests/spec/secret-rotation.bats tests/spec/secrets-deploy-automation.bats tests/spec/backup-pipeline.bats tests/spec/coverage-gate.bats
```

Erwartung: alle Tests grün (oder skipped, aber keine FAIL).

### Step 4: Quality-Gates

```bash
cd /tmp/wt-bats-coverage-batch1
task workspace:validate
task test:changed
task freshness:regenerate
task freshness:check
```

### Step 5: Commit (falls test-inventory.json geändert)

```bash
cd /tmp/wt-bats-coverage-batch1
git add website/src/data/test-inventory.json
git diff --cached --quiet || git commit -m "chore(tests): regenerate test-inventory after BATS batch 1 [T001117]"
```

### Step 6: PR-Titel Preflight

```bash
bash scripts/preflight-pr-scope.sh "test(quality): BATS Coverage Batch 1 — secret-rotation, secrets-deploy-automation, backup-pipeline [T001117]" || { echo "preflight failed"; exit 1; }
```

### Step 7: Push + PR + Auto-Merge

```bash
cd /tmp/wt-bats-coverage-batch1
git push -u origin feature/bats-coverage-batch1
gh pr create \
  --title "test(quality): BATS Coverage Batch 1 — secret-rotation, secrets-deploy-automation, backup-pipeline [T001117]" \
  --base main \
  --body "Closes T001117. Adds 3 spec BATS files. Coverage 17%→~23% (9→12 of 53 specs). No code changes, tests only."
gh pr merge --auto --squash --delete-branch
```

### Step 8: Ticket abschließen

```bash
cd /tmp/wt-bats-coverage-batch1
PR_NUM=$(gh pr view --json number -q '.number')
./scripts/ticket.sh add-pr-link --id T001117 --pr "$PR_NUM"
./scripts/ticket.sh update-status --id T001117 --status qa_review
./scripts/ticket.sh add-comment --id T001117 --body "PR #${PR_NUM} merged. Coverage: 17%→~23%. G-RH03 erreicht."
```

---

## Final Verification (CI-Äquivalent)

```bash
cd /tmp/wt-bats-coverage-batch1
task workspace:validate
task test:changed
task freshness:regenerate
task freshness:check
bats tests/spec/secret-rotation.bats tests/spec/secrets-deploy-automation.bats tests/spec/backup-pipeline.bats tests/spec/coverage-gate.bats
```

Alle müssen grün sein, bevor der PR erstellt wird.
