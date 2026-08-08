# Partial p3 — Tests: BATS-Suite (Live-Quellen, Guard, Suspend)

> **Agent:** deepseek-* | **Files:** tests/spec/llm-pipeline/knowledge-ingest-live-sources.bats (neu) | **Steps:** 5
> **Rolle:** tests (letztes Partial, trägt den STRUCT2-Failing-Test-Step)
> **Verify:** Neue Suite grün; bestehende knowledge-ingest-Suiten grün; `task test:changed` + `task freshness:check` + `task workspace:validate`

## Task List

### 1. BATS-Suite anlegen

- [ ] **1.1** Datei `tests/spec/llm-pipeline/knowledge-ingest-live-sources.bats` anlegen, Struktur analog `tests/unit/knowledge-ingest-*.bats` (`load test_helper`, `setup_file` mit `kubectl kustomize`):

```bash
#!/usr/bin/env bats
# tests/spec/llm-pipeline/knowledge-ingest-live-sources.bats
# SSOT: openspec/specs/llm-pipeline.md (fix-knowledge-ingest-zero-items-T002605)
# Stellt sicher, dass die Knowledge-Ingest-CronJobs aus dem lebenden
# Ticket-Store lesen (tickets.tickets / tickets.ticket_links) statt aus
# leeren Legacy-Tabellen, den Zero-Item-Guard tragen und der Markdown-
# CronJob suspendiert ist.
load test_helper

setup_file() {
  export MANIFESTS_DIR="${PROJECT_DIR}/k3d"
  export RENDERED="${BATS_FILE_TMPDIR}/rendered-knowledge-live-sources.yaml"
  kubectl kustomize "${MANIFESTS_DIR}" --load-restrictor=LoadRestrictionsNone > "$RENDERED" 2>&1
}

@test "ingest-bug-tickets.mjs (ConfigMap) liest tickets.tickets, nicht bugs.bug_tickets" {
  run grep -A 20 "ingest-bug-tickets.mjs" "$RENDERED"
  assert_success
  assert_output --partial "FROM tickets.tickets"
  refute_output --partial "FROM bugs.bug_tickets"
}

@test "ingest-prs.mjs (ConfigMap) liest tickets.ticket_links, nicht bachelorprojekt.features" {
  run grep -A 20 "ingest-prs.mjs" "$RENDERED"
  assert_success
  assert_output --partial "FROM tickets.ticket_links"
  refute_output --partial "bachelorprojekt.features"
}

@test "Zero-Item-Guard vorhanden (stille-grüne Fehlerklasse)" {
  run grep -A 20 "ingest-bug-tickets.mjs" "$RENDERED"
  assert_success
  assert_output --partial "live store"
}

@test "knowledge-ingest-markdown CronJob ist suspendiert" {
  run grep -B 2 -A 8 "name: knowledge-ingest-markdown" "$RENDERED"
  assert_success
  assert_output --partial "suspend: true"
}

@test "Lokale Kopie ingest-bug-tickets.mjs liest ebenfalls tickets.tickets" {
  run grep -A 20 "FROM tickets.tickets" "${PROJECT_DIR}/scripts/knowledge/ingest-bug-tickets.mjs"
  assert_success
}

@test "Lokale Kopie ingest-prs.mjs liest ebenfalls tickets.ticket_links" {
  run grep -A 20 "FROM tickets.ticket_links" "${PROJECT_DIR}/scripts/knowledge/ingest-prs.mjs"
  assert_success
}
```

### 2. RED-Zustand dokumentieren

- [ ] **2.1** Gegen den p1-Stand (ohne p2) liefen die ersten vier Tests rot:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/llm-pipeline/knowledge-ingest-live-sources.bats
# expected: FAIL (red — die Scripts lesen noch die leeren Legacy-Tabellen)
```

### 3. GREEN verifizieren

- [ ] **3.1** Nach p2 laufen alle Tests grün:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/llm-pipeline/knowledge-ingest-live-sources.bats
# expected: PASS (green — alle 6 Tests)
```

### 4. Bestehende BATS-Suiten grün halten

- [ ] **4.1** `tests/unit/knowledge-ingest-manifest.bats`, `tests/unit/knowledge-ingest-schema.bats`, `tests/unit/knowledge-ingest-bugs-schema.bats` — keine Regression durch die neuen SELECTs (insb. keine nicht-existenten Spalten `body`, `labels`, `id`, `title` in den ConfigMap-SELECTs).

### 5. CI-Gates

- [ ] **5.1** `task test:changed`
- [ ] **5.2** `task freshness:regenerate && task freshness:check`
- [ ] **5.3** `task workspace:validate`

## Verification

- Neue Suite grün (alle 6 Tests)
- Bestehende knowledge-ingest-Suiten grün
- `task test:changed` + `task freshness:check` + `task workspace:validate` ohne Fehler
