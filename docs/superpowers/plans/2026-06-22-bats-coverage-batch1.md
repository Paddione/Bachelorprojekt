# BATS Coverage Expansion — Batch 1 (G-RH03) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drei fehlende BATS-Dateien unter `tests/spec/` erstellen, um die OpenSpec-Abdeckung von 17% auf ~23% zu steigern und die testbaren Verhaltensweisen der Secret-Rotation-, Secret-Deploy-Automation- und Backup-Pipeline-Specs zu verifizieren.

**Architecture:** Jede BATS-Datei bildet eine OpenSpec-SSOT-Spec ab (`openspec/specs/<name>.md`). Tests sind offline-fähig (kein Cluster nötig): Sie rufen echte Scripts mit Fixture-Dateien in `BATS_TEST_TMPDIR` auf. Die bestehenden Test-Hooks in `env-seal.sh` (`--_test-dev-scan`, `--_test-dup-check`, etc.) ermöglichen isoliertes Testen der Subkomponenten.

**Tech Stack:** BATS (bash automated testing system), `tests/unit/test_helper.bash` (bats-support + bats-assert), `scripts/env-seal.sh`, `scripts/env-generate.sh`, `scripts/backup-restore.sh`.

## Global Constraints

- Eine BATS-Datei pro OpenSpec-SSOT-Spec (Convention aus `CLAUDE.md`)
- Dateipfade: `tests/spec/<spec-slug>.bats` — Slug = Dateiname von `openspec/specs/<slug>.md`
- Header-Kommentar immer: `# SSOT: openspec/specs/<slug>.md`
- Tests müssen offline laufen — Cluster-abhängige Tests mit `skip "needs live cluster"` markieren
- `load 'test_helper'` lädt `tests/unit/test_helper.bash` (der BATS-Suchalgorithmus findet es via `BATS_LIB_PATH`)
- Neuen Testlauf via `./tests/runner.sh local <ID>` validieren — die Spec-ID entspricht der BATS-Datei
- Jede `.bats`-Datei nach dem Schreiben mit `bats tests/spec/<slug>.bats` ausführen, um sicherzustellen, dass keine BATS-Syntax-Fehler vorliegen
- Free test IDs: `tests/unit/FA-SF-*.bats` belegen FA-SF-50–53; für `tests/spec/*.bats` gibt es kein ID-System — Dateiname = ID

---

### Task 1: `tests/spec/secret-rotation.bats` — Secret-Rotation-Spec abdecken

**Files:**
- Create: `tests/spec/secret-rotation.bats`
- Read: `openspec/specs/secret-rotation.md` (die zu testenden Scenarios)
- Read: `scripts/env-seal.sh` (Test-Hooks: `--_test-dev-scan`, `--_test-dup-check`, `--_test-cert-compare`)
- Read: `scripts/env-generate.sh` (Overwrite-Protection + no-TTY-Error)

**Interfaces:**
- Konsumiert: `scripts/env-seal.sh`, `scripts/env-generate.sh`
- Produziert: BATS-Datei die `secret-rotation.md`-Scenarios testet

- [ ] **Step 1: BATS-Datei anlegen**

```bash
cat > tests/spec/secret-rotation.bats << 'BATS'
#!/usr/bin/env bats
# tests/spec/secret-rotation.bats
# SSOT: openspec/specs/secret-rotation.md

load 'test_helper'

SEAL_SCRIPT="${PROJECT_DIR}/scripts/env-seal.sh"
GEN_SCRIPT="${PROJECT_DIR}/scripts/env-generate.sh"

# ── Dev-value scanner ──────────────────────────────────────────────

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

# ── Duplicate-key detector ─────────────────────────────────────────

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

# ── Cert-drift detection ───────────────────────────────────────────

@test "env-seal: identical certs pass fingerprint check" {
  local cert_a="${BATS_TEST_TMPDIR}/cert-a.pem"
  local cert_b="${BATS_TEST_TMPDIR}/cert-b.pem"
  # Same content → same fingerprint
  echo "-----BEGIN CERTIFICATE-----\nMIIFakeCert==\n-----END CERTIFICATE-----" > "$cert_a"
  cp "$cert_a" "$cert_b"

  run bash "$SEAL_SCRIPT" --env _noexist --_test-cert-compare "$cert_a" "$cert_b"
  assert_success
}

@test "env-seal: differing certs fail fingerprint check with drift message" {
  local cert_a="${BATS_TEST_TMPDIR}/cert-a.pem"
  local cert_b="${BATS_TEST_TMPDIR}/cert-b.pem"
  echo "-----BEGIN CERTIFICATE-----\nCert-A-Content==\n-----END CERTIFICATE-----" > "$cert_a"
  echo "-----BEGIN CERTIFICATE-----\nCert-B-DIFFERENT==\n-----END CERTIFICATE-----" > "$cert_b"

  run bash "$SEAL_SCRIPT" --env _noexist --_test-cert-compare "$cert_a" "$cert_b"
  assert_failure
}

# ── Overwrite protection in env-generate.sh ────────────────────────

@test "env-generate: refuses to overwrite existing secrets file" {
  local env_dir="${BATS_TEST_TMPDIR}/environments"
  mkdir -p "${env_dir}/.secrets"
  # Pre-create minimal schema
  cat > "${env_dir}/schema.yaml" <<'YAML'
version: 1
secrets:
  - name: SHARED_DB_PASSWORD
    required: true
    generate: true
    length: 32
YAML
  # Pre-create existing secrets file
  echo "SHARED_DB_PASSWORD: existing-value" > "${env_dir}/.secrets/testenv.yaml"

  run bash "$GEN_SCRIPT" --env testenv --env-dir "$env_dir"
  assert_failure
  # File must not have been overwritten
  run cat "${env_dir}/.secrets/testenv.yaml"
  assert_output --partial "existing-value"
}
BATS
```

- [ ] **Step 2: BATS-Syntax prüfen**

```bash
bats --version
bats tests/spec/secret-rotation.bats
```

Erwartung: Alle Tests laufen, keiner mit "syntax error". Manche können fehlschlagen falls `env-seal.sh` die Test-Hooks anders implementiert — dann anpassen.

- [ ] **Step 3: Commit**

```bash
git add tests/spec/secret-rotation.bats
git commit -m "test(secret-rotation): BATS coverage für secret-rotation.md [G-RH03]"
```

---

### Task 2: `tests/spec/secrets-deploy-automation.bats` — Deploy-Automation-Spec abdecken

**Files:**
- Create: `tests/spec/secrets-deploy-automation.bats`
- Read: `openspec/specs/secrets-deploy-automation.md`
- Read: `scripts/env-validate.sh` (validate --schema-only)
- Read: `environments/schema.yaml` (für Fixture-Schema)

**Interfaces:**
- Konsumiert: `scripts/env-validate.sh` (bereits durch `tests/unit/env-validate.bats` getestet — diese Datei testet das Overlay-Verhalten)
- Produziert: BATS-Datei die SealedSecret-Vollständigkeits- und Overlay-Struktur-Checks testet

- [ ] **Step 1: Specs lesen**

```bash
cat openspec/specs/secrets-deploy-automation.md | head -80
```

Notiere welche Scenarios testbar sind (Overlay `$patch: delete`, Vollständigkeit, extra-namespace Projektion).

- [ ] **Step 2: BATS-Datei anlegen**

```bash
cat > tests/spec/secrets-deploy-automation.bats << 'BATS'
#!/usr/bin/env bats
# tests/spec/secrets-deploy-automation.bats
# SSOT: openspec/specs/secrets-deploy-automation.md

load 'test_helper'

SEAL_SCRIPT="${PROJECT_DIR}/scripts/env-seal.sh"
REPO_ROOT="${PROJECT_DIR}"

# ── $patch: delete in prod overlay ────────────────────────────────

@test "prod/kustomization.yaml contains patch:delete for workspace-secrets" {
  run grep -c 'patch.*delete\|delete.*patch\|\$patch.*delete' "${REPO_ROOT}/prod/kustomization.yaml"
  assert_success
  # At least 1 occurrence of $patch: delete
  [ "$output" -ge 1 ]
}

@test "workspace-secrets Secret is absent from kustomize prod-mentolder output" {
  if ! command -v kubectl >/dev/null 2>&1; then
    skip "kubectl not installed"
  fi
  if ! kubectl kustomize "${REPO_ROOT}/prod-fleet/mentolder" --enable-helm 2>/dev/null >/dev/null; then
    skip "kustomize build failed (missing env vars or kubeseal)"
  fi

  run bash -c "kubectl kustomize '${REPO_ROOT}/prod-fleet/mentolder' 2>/dev/null | grep 'kind: Secret' -A 3 | grep 'name: workspace-secrets'"
  assert_failure  # workspace-secrets must NOT appear in the output
}

# ── SealedSecret completeness check via env-seal.sh test hooks ────

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

  # Sealed file missing SMTP_PASSWORD
  cat > "$sealed_file" <<'YAML'
apiVersion: bitnami.com/v1alpha1
kind: SealedSecret
spec:
  encryptedData:
    SHARED_DB_PASSWORD: "AgBCDEFGH..."
YAML

  # Minimal env file
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

# ── Sealed-secrets file structure ─────────────────────────────────

@test "sealed-secrets/mentolder.yaml exists and has encryptedData" {
  local sealed="${REPO_ROOT}/environments/sealed-secrets/mentolder.yaml"
  [ -f "$sealed" ] || skip "mentolder sealed-secrets not found"
  run grep -c "encryptedData" "$sealed"
  assert_success
  [ "$output" -ge 1 ]
}

@test "sealed-secrets/korczewski.yaml exists and has encryptedData" {
  local sealed="${REPO_ROOT}/environments/sealed-secrets/korczewski.yaml"
  [ -f "$sealed" ] || skip "korczewski sealed-secrets not found"
  run grep -c "encryptedData" "$sealed"
  assert_success
  [ "$output" -ge 1 ]
}
BATS
```

- [ ] **Step 3: BATS-Syntax prüfen**

```bash
bats tests/spec/secrets-deploy-automation.bats
```

Erwartung: Tests laufen (manche skippen falls Cluster fehlt, aber keine Syntax-Fehler).

- [ ] **Step 4: Commit**

```bash
git add tests/spec/secrets-deploy-automation.bats
git commit -m "test(secrets-deploy-automation): BATS coverage für secrets-deploy-automation.md [G-RH03]"
```

---

### Task 3: `tests/spec/backup-pipeline.bats` — Backup-Pipeline-Spec abdecken

**Files:**
- Create: `tests/spec/backup-pipeline.bats`
- Read: `openspec/specs/backup-pipeline.md`
- Read: `k3d/backup.yaml` (CronJob-Definitionen)
- Read: `scripts/backup-restore.sh` (Restore-Script-Struktur)

**Interfaces:**
- Konsumiert: k3d-Manifeste, `scripts/backup-restore.sh`
- Produziert: BATS-Datei die Backup-Manifest-Struktur und Script-Exitcodes testet

- [ ] **Step 1: Backup-Manifeste und Restore-Script verstehen**

```bash
grep -n "CronJob\|schedule\|db-backup\|pvc-backup\|retention\|30" k3d/backup.yaml | head -20
grep -n "pg_isready\|pg_dump\|PGDMP\|200\|mtime" k3d/backup.yaml scripts/backup-restore.sh 2>/dev/null | head -20
```

Notiere die Schedule-Zeiten und Script-Namen in den CronJob-Specs.

- [ ] **Step 2: BATS-Datei anlegen**

```bash
cat > tests/spec/backup-pipeline.bats << 'BATS'
#!/usr/bin/env bats
# tests/spec/backup-pipeline.bats
# SSOT: openspec/specs/backup-pipeline.md

load 'test_helper'

REPO_ROOT="${PROJECT_DIR}"

# ── CronJob manifest structure ─────────────────────────────────────

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

@test "db-backup runs at 02:00 UTC (schedule: 0 2 * * *)" {
  run grep -A 5 "name: db-backup" "${REPO_ROOT}/k3d/backup.yaml"
  assert_success
  assert_output --partial "0 2"
}

@test "pvc-backup runs at 03:00 UTC (schedule: 0 3 * * *)" {
  run grep -A 5 "name: pvc-backup" "${REPO_ROOT}/k3d/backup.yaml"
  assert_success
  assert_output --partial "0 3"
}

# ── Retention policy ───────────────────────────────────────────────

@test "backup script references 30-day retention (find -mtime +30)" {
  # The backup script in the CronJob image or inline must reference 30 days
  run grep -rn "mtime.*30\|30.*mtime\|RETENTION.*30\|keep.*30" \
    "${REPO_ROOT}/k3d/backup.yaml" \
    "${REPO_ROOT}/scripts/backup-restore.sh" 2>/dev/null
  assert_success
}

# ── AES-256-CBC encryption ─────────────────────────────────────────

@test "backup references AES-256-CBC encryption" {
  run grep -rn "aes-256-cbc\|AES-256-CBC\|openssl enc\|pbkdf2" \
    "${REPO_ROOT}/k3d/backup.yaml" 2>/dev/null
  assert_success
}

# ── backup-restore.sh structure ────────────────────────────────────

@test "backup-restore.sh exists and is executable" {
  [ -f "${REPO_ROOT}/scripts/backup-restore.sh" ]
  [ -x "${REPO_ROOT}/scripts/backup-restore.sh" ]
}

@test "backup-restore.sh has --help or usage output" {
  run bash "${REPO_ROOT}/scripts/backup-restore.sh" --help 2>&1 || true
  # Either exits with usage text or with an error containing "Usage"
  [[ "$output" =~ [Uu]sage ]] || [[ "$output" =~ [Hh]elp ]] || [[ "${status}" != "0" ]]
}

# ── Filen upload — conditional on credentials ──────────────────────

@test "backup references Filen upload conditioned on FILEN_EMAIL" {
  run grep -rn "FILEN_EMAIL\|FILEN_PASSWORD\|@filen/cli\|filen" \
    "${REPO_ROOT}/k3d/backup.yaml" 2>/dev/null
  assert_success
}
BATS
```

- [ ] **Step 3: BATS ausführen**

```bash
bats tests/spec/backup-pipeline.bats
```

Erwartung: Alle Tests laufen. Falls `backup.yaml` nicht den Erwartungen entspricht, Assertions an echte Manifest-Inhalte anpassen.

- [ ] **Step 4: Commit**

```bash
git add tests/spec/backup-pipeline.bats
git commit -m "test(backup-pipeline): BATS coverage für backup-pipeline.md [G-RH03]"
```

---

### Task 4: Coverage messen und PR erstellen

**Files:**
- Modified: `tests/spec/` (3 neue Dateien aus Tasks 1–3)
- Read: `website/src/data/test-inventory.json` (muss regeneriert werden!)

**Interfaces:**
- Konsumiert: neue `.bats`-Dateien aus Tasks 1–3
- Produziert: aktualisiertes `test-inventory.json`, PR mit 3 neuen Spec-Dateien

- [ ] **Step 1: Coverage vor und nach messen**

```bash
SPECS=$(ls openspec/specs/*.md 2>/dev/null | wc -l)
BATS=$(ls tests/spec/*.bats 2>/dev/null | wc -l)
echo "Specs: $SPECS | BATS: $BATS | Coverage: $(python3 -c "print(f'{$BATS/$SPECS*100:.0f}%')")"
```

Erwartung: 3 mehr BATS-Dateien als vorher (9 → 12), Coverage ~23%.

- [ ] **Step 2: test-inventory.json regenerieren (CI-Gate!)**

```bash
task test:inventory
git diff website/src/data/test-inventory.json | head -20
```

Erwartung: `test-inventory.json` enthält die 3 neuen Spec-Dateien.

- [ ] **Step 3: Alle Offline-Tests laufen lassen**

```bash
task test:all
```

Erwartung: Exit 0. Falls Tests fehlschlagen, Assertions in den neuen BATS-Dateien an die echten Script-Outputs anpassen.

- [ ] **Step 4: Commit und PR**

```bash
git add website/src/data/test-inventory.json
git commit -m "chore(tests): regenerate test-inventory after BATS batch 1"

git push -u origin feature/bats-coverage-batch1
gh pr create \
  --title "test: BATS Coverage Batch 1 — secret-rotation, secrets-deploy-automation, backup-pipeline [G-RH03]" \
  --body "Adds 3 spec BATS files. Coverage: 17% → ~23% (9→12 of 53 specs). No code changes, tests only."
gh pr merge --squash --auto
```
