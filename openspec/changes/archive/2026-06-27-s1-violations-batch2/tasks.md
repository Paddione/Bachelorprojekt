---
title: "G-RH01: S1-Frozen-Violations Batch 2 — baseline.json 70→≤30"
ticket_id: T001155
domains: [quality, infra, website]
status: completed
file_locks: [docs/code-quality/baseline.json, website/src/lib/tickets-db.ts, scripts/backup-restore.sh, Taskfile.yml]
shared_changes: false
batch_id: null
parent_feature: s1-violations-batch1
depends_on_plans: [s1-violations-batch1]
---

# Tasks: s1-violations-batch2 (T001155)

- [x] Task 0: Failing-Test schreiben — BATS `tests/spec/s1-violations-batch2.bats` (RED)
- [x] Task 1: `scripts/backup-restore.sh` aufteilen (1037 → < 500 Zeilen Dispatcher)
- [x] Task 2: `website/src/lib/tickets-db.ts` aufteilen (1096 → < 200 Zeilen Re-Export-Index)
- [x] Task 3: CI-Guard Härtung in `Taskfile.yml` Phase 3 (`freshness:check` → blockt neue Baseline-Keys ohne `[baseline-allow:<reason>]`-Tag)
- [x] Task 4: `task quality:baseline:refresh` + finaler Stand + Tests
- [x] Task 5: Finaler Verifikations-Task (`task test:changed` + `task freshness:regenerate` + `task freshness:check`)

---

# G-RH01: S1-Frozen-Violations Reduction — Batch 2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans

**Goal:** `docs/code-quality/baseline.json` von 70 auf ≤ 30 Einträge reduzieren, G-RH01-Ziel erreichen. Die zwei größten verbleibenden Source-Files (`tickets-db.ts` 1096 LOC, `backup-restore.sh` 1037 LOC) sind beide auf ihrem Baseline-Wert eingefroren → Budget = 0. Die Refactor-PR MUSS beide Dateien echt verkleinern.

**Architecture:** Drei Hebel in Reihenfolge: (1) `backup-restore.sh` Split in Helper-Lib + 4 Subcommand-Skripte + dünner Dispatcher, (2) `tickets-db.ts` Split in 3 Tabellen-Module + Migrations-Modul + Re-Export-Index, (3) CI-Guard härten, sodass neue Baseline-Keys explizit per PR-Tag freigegeben werden müssen. Nach jedem Refactor-Hebel: refresh + check, um Fortschritt zu sehen.

**Tech Stack:** Node.js, `scripts/code-quality/baseline-refresh.mjs`, `scripts/code-quality/load.mjs`, `scripts/code-quality/check.mjs`, TypeScript, Svelte, Astro, Bash, BATS.

## Global Constraints

- S1-Limits (aus `docs/code-quality/gates.yaml`):
  - `.ts`/`.js`/`.jsx`/`.py` → **600** Zeilen
  - `.svelte`/`.sh`/`.mjs`/`.mts` → **500** Zeilen
  - `.astro`/`.tsx`/`.java`/`.php` → **400** Zeilen
  - `.bash` → **300** Zeilen
- **Wirksame Schwellen** der Refactor-Files (gebaselined → ratchet auf Baseline-Wert, NICHT auf Limit):
  - `tickets-db.ts` Ist=1096, Baseline=1096 → **Budget 0**, MUSS echt verkleinert werden (Ziel < 200 LOC als Re-Export-Index)
  - `backup-restore.sh` Ist=1037, Baseline=1037 → **Budget 0**, MUSS echt verkleinert werden (Ziel < 500 LOC Dispatcher, BATS-Suite bleibt grün)
- Bestehende BATS-Tests für `backup-restore.sh` bleiben unverändert grün — `bash backup-restore.sh <subcmd>` bleibt die Aufrufform
- Bestehende Importer von `tickets-db.ts` nutzen `import { initTicketsSchema } from '~/lib/tickets-db'` — bleibt durch Index-File
- Ziel: `docs/code-quality/baseline.json` ≤ 30 Einträge
- Alle Code-Änderungen müssen `task test:changed` bestehen
- Nach jedem Split-Schritt: `task quality:baseline:refresh` und Änderung committen
- Kein API-Bruch bei den Refactor-Files (Index-Re-Export bzw. Dispatcher-Routing)

## File Structure

```
docs/code-quality/baseline.json                              ← MODIFY: refresh nach Refactor
website/src/lib/tickets-db.ts                                ← MODIFY: re-export-Index ≤ 200 LOC
website/src/lib/tickets/tables/tickets.ts                    ← NEU: DDL tickets.tickets + ticket_links + ticket_activity + ticket_comments
website/src/lib/tickets/tables/factory-control.ts            ← NEU: DDL factory_control + pipeline_*
website/src/lib/tickets/tables/systemtest-linkback.ts        ← NEU: source_test_* ALTER TABLE
website/src/lib/tickets/migrations.ts                        ← NEU: Legacy ALTER TABLE-Patches
scripts/backup-restore.sh                                    ← MODIFY: dünner Dispatcher ≤ 500 LOC
scripts/backup-restore-lib.sh                                ← NEU: sourced Helpers (≤ 100 LOC)
scripts/backup-restore-db.sh                                 ← NEU: cmd_db_* Subcommands
scripts/backup-restore-pvc.sh                                ← NEU: cmd_pvc_* Subcommands
scripts/backup-restore-filen.sh                              ← NEU: cmd_filen_* Subcommands
scripts/backup-restore-recovery.sh                           ← NEU: cmd_recovery_* Subcommands
scripts/code-quality/baseline-key-count-assertion.mjs        ← NEU: extrahierte PR-Tag-Assertion
Taskfile.yml                                                 ← MODIFY: Phase 3 Härtung in freshness:check
tests/spec/s1-violations-batch2.bats                         ← NEU: RED→GREEN Regression
```

---

## Task 0: Failing-Test schreiben (RED)

**Files:**
- Create: `tests/spec/s1-violations-batch2.bats`

### Step 1: BATS-Datei mit vier Test-Cases anlegen

```bash
cat > /tmp/wt-s1-frozen-paydown/tests/spec/s1-violations-batch2.bats <<'BATS'
#!/usr/bin/env bats
# SSOT: openspec/changes/s1-violations-batch2/proposal.md
# G-RH01: S1-Frozen-Violations Batch 2 — baseline.json 70→≤30
# Counts only S1-prefixed keys (file-size violations). S2/S3/S4 are
# independent gates tracked separately and not in scope for G-RH01.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
}

@test "G-RH01 batch2: baseline.json S1-Einträge ≤ 30" {
  count=$(jq -r '[keys[] | select(startswith("S1:"))] | length' "$REPO_ROOT/docs/code-quality/baseline.json")
  [ "$count" -le 30 ]
}

@test "G-RH01 batch2: tickets-db.ts ist unter S1-Limit" {
  loc=$(wc -l < "$REPO_ROOT/website/src/lib/tickets-db.ts")
  [ "$loc" -le 600 ]
}

@test "G-RH01 batch2: backup-restore.sh ist unter S1-Limit" {
  loc=$(wc -l < "$REPO_ROOT/scripts/backup-restore.sh")
  [ "$loc" -le 500 ]
}

@test "G-RH01 batch2: tickets-db.ts ist auf Re-Export-Index geschrumpft" {
  # Nach dem Split in Task 2 muss tickets-db.ts fast nur aus re-exports bestehen
  loc=$(wc -l < "$REPO_ROOT/website/src/lib/tickets-db.ts")
  [ "$loc" -le 200 ]
}

@test "G-RH01 batch2: backup-restore.sh ist auf Dispatcher geschrumpft" {
  # Nach dem Split in Task 1 darf der Dispatcher < 500 Zeilen sein
  loc=$(wc -l < "$REPO_ROOT/scripts/backup-restore.sh")
  [ "$loc" -le 200 ]
}
BATS
chmod +x /tmp/wt-s1-frozen-paydown/tests/spec/s1-violations-batch2.bats
```

### Step 2: Test laufen lassen — Expected fail (RED)

```bash
cd /tmp/wt-s1-frozen-paydown
bats tests/spec/s1-violations-batch2.bats
```

**Erwarteter Output:** mindestens 4 von 5 Tests rot.
- `baseline.json` ist 70 (Test 1 rot, erwartet ≤ 30)
- `tickets-db.ts` ist 1096 (Test 2 + 4 rot, erwartet ≤ 600 bzw. ≤ 200)
- `backup-restore.sh` ist 1037 (Test 3 + 5 rot, erwartet ≤ 500 bzw. ≤ 200)

Erst nach Task 1+2+4 werden alle 5 Tests grün.

### Step 3: Commit (RED-Snapshot, ohne Refactor-Änderungen)

```bash
cd /tmp/wt-s1-frozen-paydown
git add tests/spec/s1-violations-batch2.bats
git commit -m "test(spec): add s1-violations-batch2 RED regression suite [T001155]"
```

---

## Task 1: `scripts/backup-restore.sh` aufteilen (1037 → < 500 Zeilen Dispatcher)

> **S1-Budget:** backup-restore.sh Ist=1037, Baseline=1037 → **Budget 0** — diese PR MUSS die Datei echt verkleinern (Ziel ≤ 200 LOC Dispatcher). BATS-Suite (`tests/unit/recovery-domain-durability.bats` etc., 5 Dateien) bleibt unverändert grün.

**Files:**
- Modify: `scripts/backup-restore.sh` (ersetzen durch Dispatcher ≤ 200 LOC)
- Create: `scripts/backup-restore-lib.sh` (sourced Helpers ≤ 100 LOC)
- Create: `scripts/backup-restore-db.sh` (cmd_db_* Subcommands)
- Create: `scripts/backup-restore-pvc.sh` (cmd_pvc_* Subcommands)
- Create: `scripts/backup-restore-filen.sh` (cmd_filen_* Subcommands)
- Create: `scripts/backup-restore-recovery.sh` (cmd_recovery_* Subcommands)

### Step 1: Subcommand-Bereiche aus Original extrahieren

```bash
cd /tmp/wt-s1-frozen-paydown
# Aktuelle Struktur inspizieren — Subcommand-Blöcke identifizieren
grep -nE "^  [a-z][a-z-]*\)$" scripts/backup-restore.sh | head -40
wc -l scripts/backup-restore.sh
```

Erwartung: 1037 Zeilen. Subcommands sind: `list`, `trigger`, `restore`, `pvc-list`, `pvc-trigger`, `pvc-restore`, `filen-pull`, `stage`, `verify`, `browse`, `unbrowse`, `restore-file`, `restore-table`, `unstage`.

### Step 2: Helper-Lib schreiben (Zeilen 85-130 des Originals)

```bash
cat > /tmp/wt-s1-frozen-paydown/scripts/backup-restore-lib.sh <<'LIB'
# scripts/backup-restore-lib.sh — sourced Helpers for backup-restore*.sh
# Sourced by backup-restore.sh (Dispatcher) and all subcommand scripts.
# Globals consumed: NS, CTX_FLAG, MANIFEST (set by Dispatcher)
set -euo pipefail

_die() { echo "ERROR: $*" >&2; exit 1; }

# Render k3d/recovery-browser.yaml ($MANIFEST) with envsubst placeholders
# resolved from the live domain-config ConfigMap. Reads globals: MANIFEST, KC, NS.
_render_recovery_browser() {
  local cm; cm=$($KC get configmap domain-config -n "$NS" -o json 2>/dev/null || echo '{}')
  export RECOVER_DOMAIN TLS_SECRET_NAME KC_DOMAIN WORKSPACE_NAMESPACE
  RECOVER_DOMAIN=$(printf '%s' "$cm"  | jq -r '.data.RECOVER_DOMAIN // "recover.localhost"')
  TLS_SECRET_NAME=$(printf '%s' "$cm" | jq -r '.data.TLS_SECRET_NAME // "workspace-wildcard-tls"')
  KC_DOMAIN=$(printf '%s' "$cm"       | jq -r '.data.KC_DOMAIN // "auth.localhost"')
  WORKSPACE_NAMESPACE="$NS"
  envsubst '$RECOVER_DOMAIN $TLS_SECRET_NAME $KC_DOMAIN $WORKSPACE_NAMESPACE' < "$MANIFEST"
}

_db_pass_key() {
  case "$1" in
    keycloak)    echo KEYCLOAK_DB_PASSWORD ;;
    nextcloud)   echo NEXTCLOUD_DB_PASSWORD ;;
    vaultwarden) echo VAULTWARDEN_DB_PASSWORD ;;
    website)     echo WEBSITE_DB_PASSWORD ;;
    docuseal)    echo DOCUSEAL_DB_PASSWORD ;;
    *) _die "unknown database '$1' (valid: keycloak nextcloud vaultwarden website docuseal all)" ;;
  esac
}

_pvc_service_mount() {
  case "$1" in
    nextcloud-files)   echo "nextcloud-files.tar.gz.enc" ;;
    vaultwarden-data)  echo "vaultwarden-data.tar.gz.enc" ;;
    docuseal-data)     echo "docuseal-data.tar.gz.enc" ;;
    *) _die "unknown PVC service '$1' (valid: nextcloud-files vaultwarden-data docuseal-data all)" ;;
  esac
}

_target_kind() {
  case "$1" in
    keycloak|nextcloud|vaultwarden|website|docuseal) echo db ;;
    nextcloud-files|vaultwarden-data|docuseal-data)  echo service ;;
    *) _die "unknown stage target '$1'" ;;
  esac
}
LIB
chmod +x /tmp/wt-s1-frozen-paydown/scripts/backup-restore-lib.sh
```

### Step 3: Subcommand-Skripte anlegen (Stubs, dann Inhalt kopieren)

```bash
cd /tmp/wt-s1-frozen-paydown
for name in db pvc filen recovery; do
  cat > "scripts/backup-restore-${name}.sh" <<STUB
#!/usr/bin/env bash
# scripts/backup-restore-${name}.sh — cmd_${name}_* subcommands
# Sourced by backup-restore.sh dispatcher. Do not call directly.
set -euo pipefail
SCRIPT_DIR="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=backup-restore-lib.sh
source "\$SCRIPT_DIR/backup-restore-lib.sh"

# cmd_${name}_* functions extracted from original backup-restore.sh
# (Implementation: copy respective case-branch from original)
STUB
  chmod +x "scripts/backup-restore-${name}.sh"
done
```

### Step 4: Inhalte aus Original in Subcommand-Skripte kopieren

```bash
cd /tmp/wt-s1-frozen-paydown
# Original-Datei lesen und in 4 Sektionen aufteilen
# (Manuell: jeweils `case "CMD" in <category> ... esac` Block extrahieren)
# - backup-restore-db.sh: list, trigger, restore
# - backup-restore-pvc.sh: pvc-list, pvc-trigger, pvc-restore
# - backup-restore-filen.sh: filen-pull
# - backup-restore-recovery.sh: stage, verify, browse, unbrowse, restore-file, restore-table, unstage

# Konkret: aus der Original-Datei jeweils die entsprechenden case-Branches
# in die neue Datei kopieren, case-Wrapper drumherum entfernen.
# Beispiel für db.sh:
#   cmd_db_list() { ... }  # war: list) ... ;;
#   cmd_db_trigger() { ... }
#   cmd_db_restore() { ... }
```

Manuelle Migration (kein Bash-Oneliner sinnvoll): Jede der 4 Subcommand-Dateien enthält die extrahierten Funktionen `cmd_<name>_*` aus dem Original-Script. Reihenfolge:
1. `scripts/backup-restore-db.sh` (list, trigger, restore) — DB-Backups
2. `scripts/backup-restore-pvc.sh` (pvc-list, pvc-trigger, pvc-restore) — PVC-Datei-Backups
3. `scripts/backup-restore-filen.sh` (filen-pull) — Filen-Cloud-Download
4. `scripts/backup-restore-recovery.sh` (stage, verify, browse, unbrowse, restore-file, restore-table, unstage) — Browsable Recovery

### Step 5: Dispatcher schreiben (≤ 200 LOC)

```bash
cat > /tmp/wt-s1-frozen-paydown/scripts/backup-restore.sh <<'DISPATCHER'
#!/usr/bin/env bash
# scripts/backup-restore.sh — Workspace backup management dispatcher
# All operations target the backup-pvc inside the workspace namespace.
# This file is a thin dispatcher; implementations live in backup-restore-{db,pvc,filen,recovery}.sh.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NS=workspace
SCRIPT=$(basename "$0")
REPO_ROOT="${REPO_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
# shellcheck source=backup-restore-lib.sh
source "$SCRIPT_DIR/backup-restore-lib.sh"

usage() {
  cat <<EOF
Usage: $SCRIPT <command> [options]
Commands (database):         list | trigger | restore <db> <ts>
Commands (PVC file data):    pvc-list | pvc-trigger | pvc-restore <svc> <ts>
Commands (Filen cloud):      filen-pull <ts> [--remote-path <path>]
Commands (recovery):         stage | verify | browse | unbrowse |
                             restore-file | restore-table | unstage
Options:
  --context <ctx>   kubectl context (default: active context)
  --namespace <ns>  Kubernetes namespace (default: workspace)
  -y, --yes         Skip confirmation prompt for restore
  -h, --help        Show this help
EOF
}

CTX_FLAG=""
YES=false
POSITIONAL=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --context)     CTX_FLAG="--context $2"; shift 2 ;;
    --namespace)   NS="$2"; shift 2 ;;
    --remote-path) REMOTE_PATH="$2"; shift 2 ;;
    -y|--yes)      YES=true; shift ;;
    -h|--help)     usage; exit 0 ;;
    *) POSITIONAL+=("$1"); shift ;;
  esac
done
set -- "${POSITIONAL[@]+"${POSITIONAL[@]}"}"

CMD="${1:-}"; shift || true
KC="kubectl ${CTX_FLAG}"

# Route to subcommand script
case "$CMD" in
  list|trigger|restore)            exec "$SCRIPT_DIR/backup-restore-db.sh"      "$CMD" "$@" ;;
  pvc-list|pvc-trigger|pvc-restore) exec "$SCRIPT_DIR/backup-restore-pvc.sh"    "$CMD" "$@" ;;
  filen-pull)                      exec "$SCRIPT_DIR/backup-restore-filen.sh"  "$CMD" "$@" ;;
  stage|verify|browse|unbrowse|restore-file|restore-table|unstage)
                                   exec "$SCRIPT_DIR/backup-restore-recovery.sh" "$CMD" "$@" ;;
  "") usage; exit 1 ;;
  *)  _die "unknown command '$CMD' (try --help)" ;;
esac
DISPATCHER
chmod +x /tmp/wt-s1-frozen-paydown/scripts/backup-restore.sh
```

### Step 6: Zeilenlimits verifizieren

```bash
cd /tmp/wt-s1-frozen-paydown
wc -l scripts/backup-restore.sh scripts/backup-restore-lib.sh \
       scripts/backup-restore-db.sh scripts/backup-restore-pvc.sh \
       scripts/backup-restore-filen.sh scripts/backup-restore-recovery.sh
```

Erwartung:
- `backup-restore.sh` ≤ 200 LOC (Dispatcher)
- Keine Subcommand-Datei über 500 LOC (S1-Limit `.sh`)

### Step 7: BATS-Suite bleibt grün

```bash
cd /tmp/wt-s1-frozen-paydown
# Direkter Smoke-Test: alle Subcommands ohne BATS
for cmd in list pvc-list; do
  bash scripts/backup-restore.sh "$cmd" 2>&1 | head -3 || true
done
bash scripts/backup-restore.sh --help | head -5

# Volle BATS-Suite
task test:changed
```

Erwartung: BATS-Suite exit 0.

### Step 8: Qualitäts-Check + Commit

```bash
cd /tmp/wt-s1-frozen-paydown
task quality:check
git add scripts/backup-restore.sh scripts/backup-restore-lib.sh \
        scripts/backup-restore-db.sh scripts/backup-restore-pvc.sh \
        scripts/backup-restore-filen.sh scripts/backup-restore-recovery.sh
git commit -m "refactor(scripts): backup-restore.sh split (1037→<200 Dispatcher + 4 Subcommand-Skripte) [T001155]"
```

---

## Task 2: `website/src/lib/tickets-db.ts` aufteilen (1096 → < 200 Zeilen Re-Export-Index)

> **S1-Budget:** tickets-db.ts Ist=1096, Baseline=1096 → **Budget 0** — diese PR MUSS die Datei echt verkleinern (Ziel ≤ 200 LOC Re-Export-Index). API-Bruch verboten: `initTicketsSchema` muss aus `~/lib/tickets-db` weiterhin importierbar sein.

**Files:**
- Modify: `website/src/lib/tickets-db.ts` (Re-Export-Index ≤ 200 LOC)
- Create: `website/src/lib/tickets/tables/tickets.ts` (DDL `tickets.tickets` + `ticket_links` + `ticket_activity` + `ticket_comments`)
- Create: `website/src/lib/tickets/tables/factory-control.ts` (DDL `factory_control` + `pipeline_*`)
- Create: `website/src/lib/tickets/tables/systemtest-linkback.ts` (`source_test_*` Linkback)
- Create: `website/src/lib/tickets/migrations.ts` (Legacy ALTER TABLE-Patches)

### Step 1: Struktur des Original-Files analysieren

```bash
cd /tmp/wt-s1-frozen-paydown
grep -nE "^  await pool\.query|^  //|^export" website/src/lib/tickets-db.ts | head -80
wc -l website/src/lib/tickets-db.ts
```

Erwartung: 1096 Zeilen. Body von `initTicketsSchema` enthält ~15 `pool.query(...)`-Blöcke (Tabellen), ~25 Indexes, 5 partial-unique Constraints, ~10 Legacy `ALTER TABLE IF NOT EXISTS`-Patches.

### Step 2: Tabellen-Modul-Verzeichnis anlegen

```bash
cd /tmp/wt-s1-frozen-paydown
mkdir -p website/src/lib/tickets/tables
```

### Step 3: `tickets/tables/tickets.ts` extrahieren (≈ 250 LOC)

```bash
# Tickets-Core (tickets.tickets, ticket_links, ticket_activity, ticket_comments) aus
# Original-Zeilen 32-400 in neue Datei extrahieren. Jeder DDL-Block wird in eine
# dedizierte Funktion verpackt, die die query-Strings als Strings exportiert
# (oder direkt ausführt — siehe Hinweis).
# 
# Konkret: jede `await pool.query(\`...\`)` in eine `export const TICKETS_DDL = \`...\``
# Konstante (oder eine async-Funktion) verpacken, je nach Stil der bestehenden
# Sibling-Module unter tickets/.
cat > /tmp/wt-s1-frozen-paydown/website/src/lib/tickets/tables/tickets.ts <<'TS'
// website/src/lib/tickets/tables/tickets.ts
// DDL for tickets.tickets, ticket_links, ticket_activity, ticket_comments.
// Extracted from tickets-db.ts (Batch 2 split — T001155).
import { pool } from '../../website-db';

export async function applyTicketsCoreSchema(): Promise<void> {
  // TODO: copy CREATE TABLE/INDEX blocks for tickets.tickets, ticket_links,
  // ticket_activity, ticket_comments from original tickets-db.ts lines 32-400.
  // Pattern: each block becomes `await pool.query(\`...\`)` inside this function.
  void pool;
}
TS
```

> **Manuelle Migration:** Die genauen DDL-Blöcke aus dem Original-Script (Zeilen 32-400 für `tickets.tickets`, gefolgt von `ticket_links`/`ticket_activity`/`ticket_comments`) müssen in `applyTicketsCoreSchema()` (oder als exportierte String-Konstanten) eingefügt werden. **Kein Stub-Commit** — der Import in tickets-db.ts würde sonst zur Laufzeit einen leeren Schema-Init ausführen.

### Step 4: `tickets/tables/factory-control.ts` extrahieren (≈ 200 LOC)

```bash
cat > /tmp/wt-s1-frozen-paydown/website/src/lib/tickets/tables/factory-control.ts <<'TS'
// website/src/lib/tickets/tables/factory-control.ts
// DDL for factory_control + pipeline_* tables. Extracted from tickets-db.ts (T001155).
import { pool } from '../../website-db';

export async function applyFactoryControlSchema(): Promise<void> {
  // TODO: copy factory_control + pipeline_* DDL from original tickets-db.ts
  void pool;
}
TS
```

### Step 5: `tickets/tables/systemtest-linkback.ts` extrahieren (≈ 150 LOC)

```bash
cat > /tmp/wt-s1-frozen-paydown/website/src/lib/tickets/tables/systemtest-linkback.ts <<'TS'
// website/src/lib/tickets/tables/systemtest-linkback.ts
// ALTER TABLE … ADD COLUMN IF NOT EXISTS source_test_* (linkback to systemtest).
// Extracted from tickets-db.ts (T001155). Parallel to systemtest/db.ts pattern.
import { pool } from '../../website-db';

export async function applySystemtestLinkback(): Promise<void> {
  // TODO: copy source_test_* ALTER TABLE blocks from original tickets-db.ts
  void pool;
}
TS
```

### Step 6: `tickets/migrations.ts` extrahieren (≈ 200 LOC)

```bash
cat > /tmp/wt-s1-frozen-paydown/website/src/lib/tickets/migrations.ts <<'TS'
// website/src/lib/tickets/migrations.ts
// Legacy ALTER TABLE patches (idempotent column adds for older schema versions).
// Extracted from original tickets-db.ts lines 87-112, 222-230 etc. (T001155).
import { pool } from '../website-db';

export async function applyLegacyMigrations(): Promise<void> {
  // TODO: copy legacy ALTER TABLE IF NOT EXISTS blocks from original tickets-db.ts
  void pool;
}
TS
```

### Step 7: `tickets-db.ts` durch Re-Export-Index ersetzen (≤ 200 LOC)

```bash
cat > /tmp/wt-s1-frozen-paydown/website/src/lib/tickets-db.ts <<'TS'
// website/src/lib/tickets-db.ts
// Re-export compat layer — content split into tickets/tables/* + tickets/migrations
// (G-RH01 Batch 2, T001155). No API break: existing `import { initTicketsSchema }`
// continues to work via the re-export below.
import { pool, ensureSchemaOnce } from './website-db';
import { MixedEmbeddingModelError } from './knowledge-db';
import type { EmbeddingModel } from './embeddings';
import { initProviderConfigSchema } from './schema/provider-config-schema';
import { ensureCockpitViews } from './tickets/cockpit-schema';
import { applyTicketsCoreSchema } from './tickets/tables/tickets';
import { applyFactoryControlSchema } from './tickets/tables/factory-control';
import { applySystemtestLinkback } from './tickets/tables/systemtest-linkback';
import { applyLegacyMigrations } from './tickets/migrations';

export { MixedEmbeddingModelError };

export function ticketEmbeddingModel(): EmbeddingModel {
  return process.env.LLM_ENABLED === 'true' ? 'bge-m3' : 'voyage-multilingual-2';
}

let schemaReady = false;

export async function initTicketsSchema(): Promise<void> {
  if (schemaReady) return;
  return ensureSchemaOnce('tickets', async () => {
    const client = await pool.connect();
    try {
      await client.query(`SELECT pg_advisory_lock(hashtext('init:tickets'))`);
      try {
        await pool.query(`CREATE SCHEMA IF NOT EXISTS tickets AUTHORIZATION website`);
        await applyTicketsCoreSchema();
        await applyFactoryControlSchema();
        await applySystemtestLinkback();
        await applyLegacyMigrations();
        await initProviderConfigSchema();
        await ensureCockpitViews();
      } finally {
        await client.query(`SELECT pg_advisory_unlock(hashtext('init:tickets'))`);
      }
    } finally {
      client.release();
    }
  });
}

export function isFeatureEnabled(): boolean {
  return process.env.FEATURE_FLAG === 'true';
}
TS
```

### Step 8: Zeilenlimits verifizieren

```bash
cd /tmp/wt-s1-frozen-paydown
wc -l website/src/lib/tickets-db.ts \
       website/src/lib/tickets/tables/tickets.ts \
       website/src/lib/tickets/tables/factory-control.ts \
       website/src/lib/tickets/tables/systemtest-linkback.ts \
       website/src/lib/tickets/migrations.ts
```

Erwartung:
- `tickets-db.ts` ≤ 200 LOC (Re-Export-Index)
- Kein anderes Modul über 600 LOC (S1-Limit `.ts`)

### Step 9: TypeScript-Check + vitest

```bash
cd /tmp/wt-s1-frozen-paydown/website
pnpm run check 2>&1 | grep -iE "error|tickets" | head -20
cd /tmp/wt-s1-frozen-paydown
npm --prefix website test 2>&1 | tail -30
```

Erwartung: TypeScript 0 Fehler, vitest grün.

### Step 10: Qualitäts-Check + Tests + Commit

```bash
cd /tmp/wt-s1-frozen-paydown
task quality:check
task test:changed
git add website/src/lib/tickets-db.ts website/src/lib/tickets/
git commit -m "refactor(website): tickets-db.ts split (1096→<200 Re-Export-Index + 4 Sibling-Module) [T001155]"
```

---

## Task 3: CI-Guard Härtung — `Taskfile.yml` Phase 3 (`freshness:check` blockt neue Baseline-Keys ohne PR-Tag)

**Files:**
- Create: `scripts/code-quality/baseline-key-count-assertion.mjs` (extrahierte Assertion-Logik)
- Modify: `Taskfile.yml` (Phase 3 von `freshness:check` umbauen)

### Step 1: Aktuellen Phase-3-Code lesen (Taskfile.yml:937-965)

```bash
cd /tmp/wt-s1-frozen-paydown
sed -n '933,965p' Taskfile.yml
```

Erwartung: 33 Zeilen YAML-Literal mit `pr_count`, `main_count`, `delta`, `main_blocking` Variablen.

### Step 2: Assertion-Modul extrahieren

```bash
cat > /tmp/wt-s1-frozen-paydown/scripts/code-quality/baseline-key-count-assertion.mjs <<'JS'
#!/usr/bin/env node
// scripts/code-quality/baseline-key-count-assertion.mjs
// Extracted from Taskfile.yml Phase 3 (T001155) — hardened baseline key-count guard.
// Blocks new baseline.json keys unless PR body contains [baseline-allow:<reason>].
//
// Exit codes:
//   0 — pass (no new keys OR new keys have explicit allow tag)
//   1 — fail (new keys without allow tag, or baseline grew beyond frozen main violations)
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const REPO_ROOT = process.cwd();
const BASELINE_PATH = path.join(REPO_ROOT, 'docs/code-quality/baseline.json');

function readMainBaseline() {
  try {
    const raw = execSync('git show origin/main:docs/code-quality/baseline.json', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function readPrBody() {
  // In CI, gh-axi / gh pr view provides the body. Locally, fall back to
  // $PR_BODY env var (set by the calling Taskfile step).
  if (process.env.PR_BODY) return process.env.PR_BODY;
  try {
    return execSync('gh pr view --json body -q .body', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return '';
  }
}

function main() {
  const current = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
  const mainBase = readMainBaseline();
  const currentKeys = new Set(Object.keys(current));
  const mainKeys = new Set(Object.keys(mainBase));

  const newKeys = [...currentKeys].filter((k) => !mainKeys.has(k));
  const prBody = readPrBody();
  const hasAllowTag = /\[baseline-allow:[^\]]+\]/i.test(prBody);

  if (newKeys.length === 0) {
    console.log(`✓ baseline.json has no new keys vs origin/main (${currentKeys.size} total)`);
    return 0;
  }

  if (hasAllowTag) {
    const match = prBody.match(/\[baseline-allow:([^\]]+)\]/i);
    console.log(`✓ ${newKeys.length} new baseline key(s) allowed via [baseline-allow:${match[1]}]: ${newKeys.join(', ')}`);
    return 0;
  }

  console.error(
    `ERROR: ${newKeys.length} new baseline key(s) require [baseline-allow:<reason>] tag in PR body:`
  );
  for (const k of newKeys) console.error(`  - ${k}`);
  console.error(`Add the tag to the PR description (e.g. [baseline-allow:vendor-exclude]).`);
  return 1;
}

process.exit(main());
JS
chmod +x /tmp/wt-s1-frozen-paydown/scripts/code-quality/baseline-key-count-assertion.mjs
```

### Step 3: Phase 3 in `Taskfile.yml` patchen (Zeilen 935-965 ersetzen)

```bash
cd /tmp/wt-s1-frozen-paydown
# Vorher: lange Inline-Bash-Logik mit main_blocking-Erkennung.
# Nachher: Aufruf des extrahierten Assertion-Moduls.
# 
# Diese Änderung muss per Edit (nicht cat >) gemacht werden, da der umgebende
# Phase-1b/Phase-4-Kontext erhalten bleiben muss. Der exakte Patch:
```

Manuelle Patch-Anweisung (siehe Spec §A3):

**Vorher** (Zeilen 935-965):
```yaml
      # --- Phase 3: baseline count assertion ---
      - |
        pr_count=$(jq 'keys | length' docs/code-quality/baseline.json)
        main_count=$(git show origin/main:docs/code-quality/baseline.json 2>/dev/null | jq 'keys | length' || echo "$pr_count")
        echo "PR baseline keys: ${pr_count}, main baseline keys: ${main_count}"
        if (( pr_count > main_count )); then
          # ... 24 lines of main_blocking detection ...
        else
          echo "✓ baseline key-count is stable or shrinking (${main_count} → ${pr_count})"
        fi
```

**Nachher:**
```yaml
      # --- Phase 3: baseline count assertion (hardened, T001155) ---
      # Blocks new baseline.json keys unless PR body contains [baseline-allow:<reason>].
      - |
        if ! node scripts/code-quality/baseline-key-count-assertion.mjs; then
          echo "ERROR: baseline.json guard failed. See scripts/code-quality/baseline-key-count-assertion.mjs"
          exit 1
        fi
```

> **Migration:** Die bestehende `main_blocking`-Logik (Erlaubnis, Baseline-Wachstum als „Fix" für pre-existing main violations zu werten) wird im neuen Modul **bewusst nicht** portiert. Stattdessen muss jeder neue Baseline-Key explizit per `[baseline-allow:<reason>]`-Tag im PR-Body begründet werden — das ist der eigentliche Härtungs-Punkt.

### Step 4: Test der Härtung (manueller Sanity-Check)

```bash
cd /tmp/wt-s1-frozen-paydown
# Test 1: keine neuen Keys → exit 0
PR_BODY="some PR body" node scripts/code-quality/baseline-key-count-assertion.mjs

# Test 2: 1 neuer Key, kein Tag → exit 1
PR_BODY="some PR body" jq '. + {"S1:fake-new-violation.ts": {"path":"fake.ts","metric":1}}' \
  docs/code-quality/baseline.json > /tmp/baseline-test.json
mv /tmp/baseline-test.json docs/code-quality/baseline.json
PR_BODY="some PR body" node scripts/code-quality/baseline-key-count-assertion.mjs; echo "exit=$?"
# Erwartung: exit=1
git checkout docs/code-quality/baseline.json  # restore original

# Test 3: 1 neuer Key + [baseline-allow:vendor] im PR-Body → exit 0
PR_BODY="Fix [baseline-allow:vendor-exclude]" \
  jq '. + {"S1:fake.ts": {"path":"fake.ts","metric":1}}' \
  docs/code-quality/baseline.json > /tmp/baseline-test.json
mv /tmp/baseline-test.json docs/code-quality/baseline.json
PR_BODY="Fix [baseline-allow:vendor-exclude]" node scripts/code-quality/baseline-key-count-assertion.mjs
# Erwartung: exit=0
git checkout docs/code-quality/baseline.json
```

### Step 5: Phase 3 in der Pipeline verifizieren

```bash
cd /tmp/wt-s1-frozen-paydown
# Lokal: pr_body über $PR_BODY simulieren (in CI: gh pr view)
PR_BODY="$(git log -1 --format=%B)" task freshness:check 2>&1 | tail -20
```

Erwartung: Exit 0, „✓ baseline.json has no new keys vs origin/main".

### Step 6: Commit

```bash
cd /tmp/wt-s1-frozen-paydown
git add scripts/code-quality/baseline-key-count-assertion.mjs Taskfile.yml
git commit -m "ci(quality): harden baseline-key-count-assertion — block new keys without [baseline-allow:<reason>] [T001155]"
```

---

## Task 4: `task quality:baseline:refresh` + finaler Stand + Tests

**Files:**
- Modify: `docs/code-quality/baseline.json` (refresh nach Refactor → ≤ 30 Einträge)

### Step 1: Baseline-Refresh ausführen

```bash
cd /tmp/wt-s1-frozen-paydown
task quality:baseline:refresh
jq -r '[keys[] | select(startswith("S1:"))] | length' docs/code-quality/baseline.json
```

Erwartung: ≤ 30 S1-Einträge. Wenn höher: Top-Verbleibende analysieren.

### Step 2: Bestehende Tests

```bash
cd /tmp/wt-s1-frozen-paydown
task test:changed
npm --prefix website test 2>&1 | tail -10
```

Erwartung: BATS + vitest exit 0.

### Step 3: Falls Verbleibende > 30, Top-Täter anschauen

```bash
cd /tmp/wt-s1-frozen-paydown
jq -r 'to_entries | sort_by(-.value.metric) | .[] | "\(.value.metric)  \(.value.path)"' \
  docs/code-quality/baseline.json | head -15
```

Falls die Top-Verbleibenden weitere Sibling-Extract-Kandidaten sind, plane einen Folge-Ticket. Wenn nicht: ≥ 30 erreicht → PR ist bereit.

### Step 4: BATS-Tests müssen GRÜN sein

```bash
cd /tmp/wt-s1-frozen-paydown
bats tests/spec/s1-violations-batch2.bats
bats tests/spec/s1-violations.bats
```

Erwartung: alle 7 Tests grün (5 aus batch2 + 2 aus batch1).

### Step 5: Commit (falls baseline.json sich geändert hat)

```bash
cd /tmp/wt-s1-frozen-paydown
git add docs/code-quality/baseline.json
git diff --cached --quiet || git commit -m "chore(quality): baseline-refresh nach batch2-Refactor (70→≤30) [T001155]"
```

---

## Task 5: Finaler Verifikations-Task (CI-Äquivalent)

**Files:** (keine — reines Quality-Gate)

### Step 1: Vollständiger Quality-Check

```bash
cd /tmp/wt-s1-frozen-paydown
task workspace:validate
```

### Step 2: Tests (BATS + vitest) — **Pflicht-Step**

```bash
cd /tmp/wt-s1-frozen-paydown
task test:changed
```

Erwartung: exit 0. BATS-Suite für backup-restore unverändert grün, vitest für website grün.

### Step 3: Freshness-Artifacts regenerieren — **Pflicht-Step**

```bash
cd /tmp/wt-s1-frozen-paydown
task freshness:regenerate
```

Erwartung: alle generierten Artefakte (test-inventory, repo-index, route-manifest, learning-assets, quality-index) aktualisiert.

### Step 4: Freshness-Check (CI-Äquivalent) — **Pflicht-Step**

```bash
cd /tmp/wt-s1-frozen-paydown
task freshness:check
```

Erwartung: alle Phasen grün:
- Phase 1: generated artifacts fresh
- Phase 1b: LAD graph freshness
- Phase 2: code-quality gate (S1–S4 Ratchet)
- Phase 3: hardened baseline-assertion (exit 0)
- Phase 4: route-manifest invariants

### Step 5: BATS-Regression komplett

```bash
cd /tmp/wt-s1-frozen-paydown
bats tests/spec/s1-violations.bats
bats tests/spec/s1-violations-batch2.bats
```

Erwartung: alle 7 Tests grün (batch1: 2, batch2: 5).

### Step 6: PR-Titel Preflight

```bash
cd /tmp/wt-s1-frozen-paydown
bash scripts/preflight-pr-scope.sh "chore(quality): s1-violations-batch2 (70→≤30) [T001155]" || { echo "preflight failed"; exit 1; }
```

### Step 7: Push + PR + Auto-Merge

```bash
cd /tmp/wt-s1-frozen-paydown
git push -u origin feature/s1-frozen-paydown
gh pr create \
  --title "chore(quality): s1-violations-batch2 (70→≤30) [T001155]" \
  --base main \
  --body "Closes T001155. backup-restore.sh + tickets-db.ts split + CI-Guard hardening. G-RH01 erreicht: baseline.json 70→≤30. Refs s1-violations-batch1 (#2083)."
gh pr merge --auto --squash --delete-branch
```

### Step 8: Ticket abschließen

```bash
cd /tmp/wt-s1-frozen-paydown
PR_NUM=$(gh pr view --json number -q '.number')
./scripts/ticket.sh add-pr-link --id T001155 --pr "$PR_NUM"
./scripts/ticket.sh update-status --id T001155 --status qa_review
./scripts/ticket.sh add-comment --id T001155 --body "PR #${PR_NUM} merged. baseline.json: 70→≤30. G-RH01 erreicht."
```

---

## Final Verification (CI-Äquivalent)

```bash
cd /tmp/wt-s1-frozen-paydown
task workspace:validate
task test:changed
task freshness:regenerate
task freshness:check
bats tests/spec/s1-violations.bats
bats tests/spec/s1-violations-batch2.bats
```

Alle müssen grün sein, bevor der PR erstellt wird. Erwartung:
- `baseline.json` ≤ 30 S1-Einträge
- `tickets-db.ts` ≤ 200 LOC
- `backup-restore.sh` ≤ 200 LOC Dispatcher
- 7 BATS-Tests grün
- freshness:check exit 0 (alle 4 Phasen)
