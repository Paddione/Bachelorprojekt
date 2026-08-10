#!/usr/bin/env bats
# tests/spec/software-factory/partial-deploy-gang.bats
# SSOT: openspec/specs/software-factory.md
#
# [T002503] Aufgeteilt aus tests/spec/software-factory.bats. Jene Sammeldatei hielt
# 495 der ~2300 Spec-Tests in einer Datei und war mit --no-parallelize-within-files
# unteilbar: sie bildete mit 115s den Boden jedes CI-Shards, in dem sie lag.
#
# Der Split ist ein VERSCHIEBEN, kein Kopieren — die Quelldatei ist entfernt.
# T002427/T002421: eine frueher zurueckgelassene Kopie erzeugte doppelte Testnamen,
# ein gefilterter Lauf sah gruen aus, waehrend `task test:factory` ueber die
# veraltete Fassung rot lief.
#
# Gemeinsame Variablen, _skip_if_no_db und Setup/Teardown liegen in _sf_common.bash.

load '_sf_common'

setup()    { _sf_setup; }
teardown() { _sf_teardown; }

# ── FA-SF-60-partial-deploy ─────────────────────────────────────#
# FA-SF-60: structural contract for partial-deploy (offline, no cluster).
#   - service-registry.sh maps EVERY k3d/*.yaml to a slug or INFRA
#   - infra files are never partial-deployable
#   - resolve_partial_services applies the ≤5 / no-infra threshold
#   - Taskfile exposes workspace:partial-deploy
REG="scripts/factory/service-registry.sh"

@test "FA-SF-60: service-registry.sh exists and passes bash -n" {
  [ -f "$REG" ]
  run bash -n "$REG"
  [ "$status" -eq 0 ]
}

@test "FA-SF-60: every k3d/*.yaml is classified (registry slug OR infra)" {
  # shellcheck disable=SC1090
  source "$REG"
  local missing=()
  for f in k3d/*.yaml; do
    # kustomization.yaml is the kustomize entrypoint, not a deployable resource
    [ "$f" = "k3d/kustomization.yaml" ] && continue
    if [ -n "${SERVICE_REGISTRY[$f]:-}" ]; then continue; fi
    local is_infra=0
    for inf in "${INFRA_FILES[@]}"; do [ "$inf" = "$f" ] && is_infra=1 && break; done
    [ "$is_infra" -eq 1 ] || missing+=("$f")
  done
  if [ "${#missing[@]}" -ne 0 ]; then
    printf 'UNCLASSIFIED: %s\n' "${missing[@]}" >&2
  fi
  [ "${#missing[@]}" -eq 0 ]
}

@test "FA-SF-60: resolve_partial_services returns slugs for a small service-only diff" {
  source "$REG"
  run resolve_partial_services "k3d/brett.yaml,website/src/pages/index.astro"
  [ "$status" -eq 0 ]
  [ "$output" = "brett" ]
}

@test "FA-SF-60: dedups multiple files of the same service" {
  source "$REG"
  run resolve_partial_services "k3d/nextcloud.yaml,k3d/nextcloud-redis.yaml"
  [ "$status" -eq 0 ]
  [ "$output" = "nextcloud" ]
}

@test "FA-SF-60: infra change forces full deploy (non-zero, empty)" {
  source "$REG"
  run resolve_partial_services "k3d/namespace.yaml,k3d/brett.yaml"
  [ "$status" -ne 0 ]
}

@test "FA-SF-60: unknown k3d file forces full deploy (fail safe)" {
  source "$REG"
  run resolve_partial_services "k3d/brand-new-service.yaml"
  [ "$status" -ne 0 ]
}

@test "FA-SF-60: a diff touching no k3d service file returns non-zero" {
  source "$REG"
  run resolve_partial_services "website/src/pages/index.astro,Taskfile.yml"
  [ "$status" -ne 0 ]
}

@test "FA-SF-60: more than PARTIAL_DEPLOY_MAX services forces full deploy" {
  source "$REG"
  PARTIAL_DEPLOY_MAX=2 run resolve_partial_services "k3d/brett.yaml,k3d/keycloak.yaml,k3d/docs.yaml"
  [ "$status" -ne 0 ]
}

@test "FA-SF-60: kustomization.yaml change forces full deploy" {
  source "$REG"
  run resolve_partial_services "k3d/kustomization.yaml"
  [ "$status" -ne 0 ]
}

@test "FA-SF-60: every registry slug appears as an app: label in the kustomize build" {
  command -v kustomize >/dev/null || skip "kustomize not installed"
  source "$REG"
  local built; built=$(kustomize build k3d/ --load-restrictor=LoadRestrictionsNone 2>/dev/null) || skip "kustomize build failed offline"
  local missing=()
  local seen=()
  # unique slug set — only check slugs whose files appear in kustomization.yaml
  local kustomization; kustomization=$(cat k3d/kustomization.yaml)
  local slug
  for f in "${!SERVICE_REGISTRY[@]}"; do
    # skip files not referenced by kustomization.yaml (deployed separately by workspace:deploy)
    local basename="${f##k3d/}"
    printf '%s' "$kustomization" | grep -qF "$basename" || continue
    slug="${SERVICE_REGISTRY[$f]}"
    printf '%s\n' "${seen[@]}" | grep -qx "$slug" && continue
    seen+=("$slug")
    grep -Eq "app: ${slug}( |$)" <<< "$built" || missing+=("$slug")
  done
  if [ "${#missing[@]}" -ne 0 ]; then
    printf 'SLUG WITH NO app: LABEL IN BUILD: %s\n' "${missing[@]}" >&2
  fi
  [ "${#missing[@]}" -eq 0 ]
}

@test "FA-SF-60: Taskfile defines workspace:partial-deploy" {
  run grep -Eq '^  workspace:partial-deploy:' Taskfile.yml
  [ "$status" -eq 0 ]
}

@test "FA-SF-60: partial-deploy uses a label selector apply (app in (...))" {
  # the rendered apply must filter by the PARTIAL_SERVICES label set
  run grep -Eq 'app in \(' Taskfile.yml
  [ "$status" -eq 0 ]
}

@test "FA-SF-60: partial-deploy aborts when PARTIAL_SERVICES is empty" {
  run grep -Eq 'PARTIAL_SERVICES.*(required|must be set|empty)' Taskfile.yml
  [ "$status" -eq 0 ]
}

@test "FA-SF-60: pipeline.js references the service-registry resolver" {
  run grep -q 'resolve_partial_services' scripts/factory/pipeline.mjs
  [ "$status" -eq 0 ]
  run grep -q 'service-registry.sh' scripts/factory/pipeline.mjs
  [ "$status" -eq 0 ]
}

@test "FA-SF-60: pipeline.js passes node --check" {
  command -v node >/dev/null || skip "node not installed"
  run node --check scripts/factory/pipeline.mjs
  [ "$status" -eq 0 ]
}

@test "FA-SF-60: the registry resolver invoked the JS way yields a slug for a service-only diff" {
  run bash -c 'source scripts/factory/service-registry.sh && resolve_partial_services "k3d/brett.yaml"'
  [ "$status" -eq 0 ]
  [ "$output" = "brett" ]
}

# ── FA-SF-GANG: Gang-Scheduling für Partialpläne (T002074) ───────────────────
@test "FA-SF-GANG: slots.sh usage-Kontrakt kennt claim-gang" {
  run env BRAND=mentolder FACTORY_DRY_RESOLVE= bash scripts/factory/slots.sh bogus
  [ "$status" -eq 2 ]
  [[ "$output" == *"claim-gang"* ]]
}

@test "FA-SF-GANG: claim-gang prueft SUM(slot_count) atomar gegen den Brand-Pool" {
  run grep -Fq 'SUM(slot_count)' scripts/factory/slots.sh
  [ "$status" -eq 0 ]
}

@test "FA-SF-GANG: release setzt slot_count auf 1 zurueck" {
  run grep -Fq 'slot_count=1' scripts/factory/slots.sh
  [ "$status" -eq 0 ]
}

@test "FA-SF-GANG: count-Accounting summiert slot_count statt Zeilen zu zaehlen" {
  run grep -Fq 'COALESCE(SUM(slot_count),0)' scripts/factory/slots.sh
  [ "$status" -eq 0 ]
}

@test "FA-SF-GANG: schedule.sh blockt head-of-line (break, kein Vorziehen)" {
  run grep -Fq 'head-of-line' scripts/factory/schedule.sh
  [ "$status" -eq 0 ]
  run grep -Fq 'claim-gang' scripts/factory/schedule.sh
  [ "$status" -eq 0 ]
}

@test "FA-SF-GANG: Migration fuegt slot_count idempotent hinzu" {
  run grep -Fq 'ADD COLUMN IF NOT EXISTS slot_count' scripts/migrations/2026-07-22-slot-count-gang.sql
  [ "$status" -eq 0 ]
}

@test "FA-SF-GANG: stage-plan traegt --partials in die Stage-Query (ticket.sh unberuehrt)" {
  run grep -Fq -- '--partials' scripts/vda/ticket/stage-plan.sh
  [ "$status" -eq 0 ]
  run grep -Fq -- '--partials' scripts/ticket.sh
  [ "$status" -eq 1 ]
}

@test "FA-SF-GANG: plan-lint Partial-Modus — D1 Hard-Fail bei Datei in zwei Partials" {
  chg="$BATS_TEST_TMPDIR/chg"; mkdir -p "$chg/tasks.d"
  bash "$REPO_ROOT/tests/spec/fixtures/make-partial-plan.sh" "$chg" duplicate
  run bash "$REPO_ROOT/scripts/plan-lint.sh" "$chg/tasks.md"
  [ "$status" -eq 1 ]
  [[ "$output" == *"D1"* ]]
}

@test "FA-SF-GANG: plan-lint Partial-Modus — disjunkte Partials mit Tests-Partial PASSen" {
  chg="$BATS_TEST_TMPDIR/chg-ok"; mkdir -p "$chg/tasks.d"
  bash "$REPO_ROOT/tests/spec/fixtures/make-partial-plan.sh" "$chg" ok
  run bash "$REPO_ROOT/scripts/plan-lint.sh" "$chg/tasks.md"
  [ "$status" -eq 0 ]
}

@test "FA-SF-GANG: pipeline-partials.cjs ist valides CJS und wird vom Runner ge-require-t" {
  run node --check scripts/factory/pipeline-partials.cjs
  [ "$status" -eq 0 ]
  run grep -Fq "pipeline-partials.cjs" scripts/factory/pipeline-runner.js
  [ "$status" -eq 0 ]
  run grep -Fq 'read-partials' scripts/factory/pipeline-runner.js
  [ "$status" -eq 0 ]
}

@test "FA-SF-GANG: pipeline.js emittiert partial-done-Phase-Events" {
  run grep -Fq "partial-done" scripts/factory/pipeline.mjs
  [ "$status" -eq 0 ]
}

# [T002582] Hiess "…-bonsai.sh idempotent (ON CONFLICT) auf :8093" und verlangte
# ausdruecklich 'http://127.0.0.1:8093/v1' im Skript. Damit schrieb der Test die
# Verletzung der eigenen SSOT als Sollzustand fest: openspec/specs/software-factory.md
# fordert das Gateway und "never a backend port directly", und :8093 serviert seit
# T002551 den bge-Reranker. Der Test war der Grund, warum die Fehlkonfiguration
# jeden CI-Lauf ueberlebte — er haette sie gemeldet, wenn jemand sie korrigiert haette.
@test "FA-SF-GANG: provider-register-local.sh idempotent (ON CONFLICT) ueber das Gateway" {
  run bash -n scripts/factory/provider-register-local.sh
  [ "$status" -eq 0 ]
  run grep -Fq 'ON CONFLICT' scripts/factory/provider-register-local.sh
  [ "$status" -eq 0 ]
  # [T003492] Anker auf Host:Port verkuerzt — vorher stand hier das vollstaendige
  # Literal 'http://127.0.0.1:18235/v1'. Die Zusicherung dieses Tests ist laut dem
  # Kommentar oben "das Gateway, nie ein Backend-Port direkt"; der Pfadanteil war
  # nur zufaellig Teil des damaligen Werts. Das '/v1' musste weichen, weil die
  # Konsumenten von provider_config.base_url es selbst anhaengen und daraus sonst
  # '.../v1/v1/chat/completions' wird (HTTP 404). Ein Anker auf die Darstellung
  # statt auf die Semantik haette diese Korrektur blockiert — genau der Fall aus
  # der Konvention "Semantik statt Darstellung" (T002716).
  run grep -Fq 'http://127.0.0.1:18235' scripts/factory/provider-register-local.sh
  [ "$status" -eq 0 ]
  # Negativ-Aussage mit dem Positiv-Anker oben: der alte Backend-Port darf als
  # aktiver Wert nicht zurueck. Kommentarzeilen sind ausgenommen — der Header des
  # Skripts nennt :8093 bewusst, um die Fehlkonfiguration nachvollziehbar zu halten.
  run bash -c "grep -v '^[[:space:]]*#' scripts/factory/provider-register-local.sh | grep -Fq 'http://127.0.0.1:8093/v1'"
  [ "$status" -ne 0 ]
}

@test "FA-SF-GANG: plan-intel-filter.sh filtert impact_files nach target_files" {
  tmp="$BATS_TEST_TMPDIR/intel.json"
  printf '%s' '{"meta":{"slug":"x"},"impact_files":[{"path":"a.sh"},{"path":"b.sh"}],"symbols":[{"name":"s","file":"a.sh"}],"db_tables":[]}' > "$tmp"
  run bash scripts/plan-intel-filter.sh "$tmp" a.sh
  [ "$status" -eq 0 ]
  [[ "$output" == *'"a.sh"'* ]]
  [[ "$output" != *'"b.sh"'* ]]
}

@test "FA-SF-GANG: Deploy-Phase kennt das pr-ready-Gate" {
  run grep -Fq "pr-ready" scripts/factory/pipeline.mjs
  [ "$status" -eq 0 ]
  run grep -Fq "pending-pr-gate" scripts/factory/pipeline.mjs
  [ "$status" -eq 0 ]
  run grep -Fq "pr-gate" scripts/factory/pipeline-runner.js
  [ "$status" -eq 0 ]
}

@test "FA-SF-GANG: pr-babysit-ticket.sh reuse statt Duplikation" {
  run bash -n scripts/factory/pr-babysit-ticket.sh
  [ "$status" -eq 0 ]
  run grep -Fq 'classify-failure.sh' scripts/factory/pr-babysit-ticket.sh
  [ "$status" -eq 0 ]
  run grep -Fq -- '--squash --auto' scripts/factory/pr-babysit-ticket.sh
  [ "$status" -eq 0 ]
  run grep -Fq 'pr-babysit-ticket.sh' scripts/factory/pipeline.mjs
  [ "$status" -eq 0 ]
}

# === T002082: dependency-based partial scheduling ===

@test "FA-SF-DEP: plan-lint akzeptiert 5-Spalten-Manifest mit gültigem depends_on" {
  chg="$BATS_TEST_TMPDIR/dep-ok"; mkdir -p "$chg/tasks.d"
  cat > "$chg/tasks.md" <<'EOF'
---
title: "dep-ok — Implementation Plan"
ticket_id: T000000
domains: [test]
status: active
---

# dep-ok — Implementation Plan

## File Structure

```
a.sh  impl
b.sh  impl
a.test.bats  tests
```

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-impl.md | impl | a.sh | |
| p2 | tasks.d/p2-tests.md | tests | b.sh, a.test.bats | p1 |

### Task: Verify

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
EOF
  cat > "$chg/tasks.d/p1-impl.md" <<'EOF'
# p1 — impl
### Task: implement a.sh
Target files: a.sh.
EOF
  cat > "$chg/tasks.d/p2-tests.md" <<'EOF'
# p2 — tests
### Task: failing test first
Write a bats test in `a.test.bats` and run it — expected: FAIL (red) before impl.
```bash
bats a.test.bats
```
Target files: b.sh, a.test.bats.
EOF
  run bash scripts/plan-lint.sh "$chg/tasks.md"
  [ "$status" -eq 0 ]
}

@test "FA-SF-DEP: plan-lint Hard-Fail bei depends_on-Zyklus (D2)" {
  chg="$BATS_TEST_TMPDIR/dep-cycle"; mkdir -p "$chg/tasks.d"
  cat > "$chg/tasks.md" <<'EOF'
---
title: "dep-cycle — Implementation Plan"
ticket_id: T000000
domains: [test]
status: active
---

# dep-cycle — Implementation Plan

## File Structure

```
a.sh  impl
b.sh  impl
a.test.bats  tests
```

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-impl.md | impl | a.sh | p2 |
| p2 | tasks.d/p2-tests.md | tests | b.sh, a.test.bats | p1 |

### Task: Verify

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
EOF
  cat > "$chg/tasks.d/p1-impl.md" <<'EOF'
# p1 — impl
Target files: a.sh.
EOF
  cat > "$chg/tasks.d/p2-tests.md" <<'EOF'
# p2 — tests
Write a bats test in `a.test.bats` and run it — expected: FAIL.
```bash
bats a.test.bats
```
Target files: b.sh, a.test.bats.
EOF
  run bash scripts/plan-lint.sh "$chg/tasks.md"
  [ "$status" -eq 1 ]
  [[ "$output" == *"D2"* ]]
}

@test "FA-SF-DEP: plan-lint Hard-Fail bei unbekannter depends_on-ID (D2)" {
  chg="$BATS_TEST_TMPDIR/dep-unknown"; mkdir -p "$chg/tasks.d"
  cat > "$chg/tasks.md" <<'EOF'
---
title: "dep-unknown — Implementation Plan"
ticket_id: T000000
domains: [test]
status: active
---

# dep-unknown — Implementation Plan

## File Structure

```
a.sh  impl
b.sh  impl
a.test.bats  tests
```

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-impl.md | impl | a.sh | |
| p2 | tasks.d/p2-tests.md | tests | b.sh, a.test.bats | p9 |

### Task: Verify

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
EOF
  cat > "$chg/tasks.d/p1-impl.md" <<'EOF'
# p1 — impl
Target files: a.sh.
EOF
  cat > "$chg/tasks.d/p2-tests.md" <<'EOF'
# p2 — tests
Write a bats test in `a.test.bats` and run it — expected: FAIL.
```bash
bats a.test.bats
```
Target files: b.sh, a.test.bats.
EOF
  run bash scripts/plan-lint.sh "$chg/tasks.md"
  [ "$status" -eq 1 ]
  [[ "$output" == *"D2"* ]]
}

@test "FA-SF-DEP: stage-plan --partials 5 akzeptiert, 0 und 10 abgelehnt" {
  # --partials 5: validierung muss durchkommen (DB-Aufruf schlägt fehl, aber Validierung ist davor)
  run bash -n scripts/vda/ticket/stage-plan.sh
  [ "$status" -eq 0 ]
  # Prüfe dass die Validierung 1..9 akzeptiert (grep nach dem case-Muster)
  run grep -qE '1-9|1\.\.9|\[1-9\]' scripts/vda/ticket/stage-plan.sh
  [ "$status" -eq 0 ]
}

@test "FA-SF-GANG: stage-plan schreibt force-tick-requested Flag (T002128-p1)" {
  # p1: stage-plan.sh enthaelt den force-tick-Upsert + factory.service-Kick
  # T002366: der Kick ist weiterhin genau einmal vorhanden, nun aber non-blocking —
  # ohne --no-block wartete er auf den laufenden oneshot-Tick (bis 61 min) und
  # widersprach damit dem hier geprueften non-fatal/best-effort-Charakter.
  run grep -c "force-tick-requested" scripts/vda/ticket/stage-plan.sh
  [ "$output" -ge 1 ]
  run grep -c "systemctl --user start --no-block factory.service" scripts/vda/ticket/stage-plan.sh
  [ "$output" -eq 1 ]
  # Beide Trigger sind non-fatal (Warnung >&2, kein Abbruch)
  run grep "WARN: stage-plan: force-tick flag write failed" scripts/vda/ticket/stage-plan.sh
  [ "$status" -eq 0 ]
}

@test "FA-SF-GANG: dispatcher-bridge hat FACTORY_EXECUTOR-Verzweigung (T002128-p2)" {
  # p2: Executor-Branching vorhanden, claude-Spawn byte-identisch
  run bash -n scripts/factory/dispatcher-bridge.sh
  [ "$status" -eq 0 ]
  run grep -c "FACTORY_EXECUTOR" scripts/factory/dispatcher-bridge.sh
  [ "$output" -ge 1 ]
  run grep -c "opencode-exec.sh" scripts/factory/dispatcher-bridge.sh
  [ "$output" -eq 1 ]
  # claude-Spawn mit --dangerously-skip-permissions genau einmal (unverändert)
  run grep -c -- "--dangerously-skip-permissions" scripts/factory/dispatcher-bridge.sh
  [ "$output" -eq 1 ]
}

@test "FA-SF-GANG: opencode-exec.sh ist valide und ausfuehrbar (T002128-p2)" {
  run bash -n scripts/factory/opencode-exec.sh
  [ "$status" -eq 0 ]
  [ -x scripts/factory/opencode-exec.sh ]
  # Positionale ticket.sh phase-Form (kein --id/--phase/--state)
  run grep -n 'phase.*EXT_ID.*implement' scripts/factory/opencode-exec.sh
  [ "$status" -eq 0 ]
  # Kein claude -p Fallback (kein CLAUDE_BIN oder claude als Kommando in Code)
  run grep -c '${CLAUDE_BIN:-claude}' scripts/factory/opencode-exec.sh
  [ "$output" -eq 0 ]
}

@test "FA-SF-GANG: backends.mjs max_inflight aus DB und JSON-Seam (T002128-p4)" {
  # Typedef enthaelt maxInflight
  run grep "maxInflight:number" scripts/llm-proxy/backends.mjs
  [ "$status" -eq 0 ]
  # SQL SELECT enthaelt max_inflight
  run grep "max_inflight" scripts/llm-proxy/backends.mjs
  [ "$status" -eq 0 ]
  # JSON-Seam gibt maxInflight durch (node -e mit --input-type=module fuer ESM)
  run bash -c 'LLM_PROXY_BACKENDS_JSON='\''[{"name":"b","kind":"llamacpp","baseUrl":"x","apiKeyEnv":null,"enabled":true,"priority":1,"fixups":[],"modelAliases":{},"maxInflight":4}]'\'' node --input-type=module -e "import('\''./scripts/llm-proxy/backends.mjs'\'').then(m => { m.startRegistryPoll(999999); const b = m.getBackends()[0]; process.stdout.write(String(b.maxInflight)); })"'
  [ "$output" = "4" ]
}

@test "FA-SF-GANG: llm-proxy server.mjs Semaphor und /admin/state (T002128-p4)" {
  run node --check scripts/llm-proxy/server.mjs
  [ "$status" -eq 0 ]
  run node --check scripts/llm-proxy/slot-queue.mjs
  [ "$status" -eq 0 ]
  # Semaphor-Funktionen sind in slot-queue.mjs (T002483)
  run grep -c "function acquire" scripts/llm-proxy/slot-queue.mjs
  [ "$output" -eq 1 ]
  run grep -c "function release" scripts/llm-proxy/slot-queue.mjs
  [ "$output" -eq 1 ]
  run grep -c "export function enqueue" scripts/llm-proxy/slot-queue.mjs
  [ "$output" -eq 1 ]
  # server.mjs importiert enqueue und inflightOf aus slot-queue.mjs
  run grep -c "inflightOf" scripts/llm-proxy/server.mjs
  [ "$output" -ge 1 ]
  run grep "enqueue.*slot-queue" scripts/llm-proxy/server.mjs
  [ "$status" -eq 0 ]
}
