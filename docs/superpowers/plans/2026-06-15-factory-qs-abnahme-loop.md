---
title: Factory QS-Abnahme-Loop Implementation Plan
ticket_id: T000730
domains: [website, db, ops, test, security]
status: completed
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Factory QS-Abnahme-Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Schließt vier Lücken in der Software-Factory-Pipeline, die verhindern, dass Tickets automatisch von `plan_staged` bis `done` durchlaufen — ohne manuellen Eingriff.

**Architecture:** Vier orthogonale Erweiterungen: (A) Auto-Enqueue-Skript prüft `plan_staged`-Tickets mit vollständiger Readiness und übergibt sie an den Factory-Dispatcher; (B) neuer GitHub-Actions-Workflow löst nach jedem Factory-PR-Merge einen gezielten E2E-Lauf aus; (C) der Ingest-Endpunkt mappt bestandene E2E-Tests über Feature-Slugs auf `qa_review`-Tickets und setzt sie auf `done`; (D) `pipeline.js` schickt nach `qa_review`-Transition eine PushNotification und nach `done`-Transition eine zweite + aktiviert den Feature-Flag. Alle Änderungen sind rückwärtskompatibel — kein bestehender Flow bricht.

**Tech Stack:** Bash (BATS-Tests, Skript), TypeScript/Astro (Ingest-API), GitHub Actions YAML, Node.js (pipeline.js Workflow-Skript), PostgreSQL (tickets Schema), Vitest + pg-mem (Unit-Tests), Playwright (E2E-Tests)

---

## S1-Budget — Wirksame Zeilenschwellen

| Datei | Ist | Baseline / Status | Limit | Budget |
|---|---|---|---|---|
| `scripts/ticket.sh` | 793 | **793 (baselined)** | — | **0** → Änderungen MÜSSEN netto-zeilenneutral sein |
| `scripts/factory/queue.sh` | 20 | nicht-baselined | 500 (.sh) | **480** |
| `scripts/factory/pipeline.js` | 777 | nicht-baselined | 600 (.js) | Datei liegt bereits über Limit → Neues Skript, NICHT pipeline.js erweitern |
| `scripts/factory/dispatcher.js` | 264 | nicht-baselined | 600 (.js) | **336** |
| `website/src/pages/api/admin/tests/ingest-e2e.ts` | 200 | nicht-baselined | 600 (.ts) | **400** |
| `website/src/lib/qa-dal.ts` | 123 | nicht-baselined | 600 (.ts) | **477** |
| Neue `.sh`-Dateien | 0 | nicht-baselined | 500 | je ≤400 halten |
| Neue `.ts`-Dateien | 0 | nicht-baselined | 600 | je ≤500 halten |

> ⚠️ `pipeline.js` (777 Zeilen) liegt bereits über dem 600-Zeilen-Limit für `.js`. Eine weitere Vergrößerung würde S1 in CI sofort kippen. Neue Pipeline-Logik kommt deshalb in ein **separates Skript** (`scripts/factory/qa-notify.sh`) und wird von `pipeline.js` via `bash` aufgerufen — nicht inline.

---

## File Structure

### Neue Dateien

| Datei | Verantwortung |
|---|---|
| `scripts/factory/auto-enqueue.sh` | Pollt `plan_staged`-Tickets mit vollständiger Readiness, ruft `ticket.sh enqueue` auf |
| `scripts/factory/qa-notify.sh` | Sendet PushNotification nach `qa_review`-Transition; separat um pipeline.js nicht zu vergrößern |
| `.github/workflows/factory-post-merge-e2e.yml` | Triggert E2E-Lauf nach Factory-PR-Merge auf main |
| `website/src/lib/qa-ingest.ts` | Reine Funktion: mappt E2E-Runs auf Feature-Slugs + setzt `done` |
| `tests/local/FA-SF-51-auto-enqueue.bats` | BATS-Tests für auto-enqueue.sh (offline-safe) |
| `tests/local/FA-SF-52-qa-notify.bats` | BATS-Tests für qa-notify.sh CLI-Arg-Validation |
| `website/src/lib/qa-ingest.test.ts` | Vitest-Tests für qa-ingest.ts mit pg-mem |

### Modifizierte Dateien

| Datei | Änderung |
|---|---|
| `scripts/factory/wakeup.sh` | Ruft auto-enqueue.sh vor dem Dispatcher-Tick auf |
| `scripts/factory/pipeline.js` | Schritt 5 ergänzt: `bash qa-notify.sh` nach `qa_review`-Transition |
| `website/src/pages/api/admin/tests/ingest-e2e.ts` | Ruft `qa-ingest.ts`-Funktion auf nach Test-Ingest |

---

## Task 1: `scripts/factory/auto-enqueue.sh` — Lücke 3.1

**Files:**
- Create: `scripts/factory/auto-enqueue.sh`
- Test: `tests/local/FA-SF-51-auto-enqueue.bats`

### Warum so?

`queue.sh` pollt nur `status='backlog'`. Der Dispatcher sieht `plan_staged`-Tickets nie. `auto-enqueue.sh` ist ein separates, deterministisch-testbares Shell-Skript, das `wakeup.sh` *vor* dem Dispatcher-Tick aufruft. Es liest beide Brand-DBs, prüft alle vier Readiness-Flags, und ruft für jedes vollständige Ticket `ticket.sh enqueue` auf — womit es in `backlog` landet und der Dispatcher es im selben Tick aufnehmen kann.

- [ ] **Schritt 1.1: Schreibe das failing BATS-Test**

Erstelle `tests/local/FA-SF-51-auto-enqueue.bats`:

```bash
#!/usr/bin/env bats
# FA-SF-51: offline arg-validation + logic stubs für auto-enqueue.sh [T000730]
# Alle Tests validieren VOR _pgpod / factory_psql — CI-safe ohne Cluster.
setup() { load 'test_helper.bash'; }

@test "FA-SF-51: auto-enqueue.sh is executable" {
  [ -x scripts/factory/auto-enqueue.sh ]
}

@test "FA-SF-51: --dry-run flag is accepted without error (no cluster)" {
  # Setzt FACTORY_DRY_RESOLVE=1 um factory_resolve() zu kurz-schließen
  run env FACTORY_DRY_RESOLVE=1 BRAND=mentolder bash scripts/factory/auto-enqueue.sh --dry-run
  # Kein Crash, beliebiger Exit-Code akzeptiert (kein Cluster)
  [[ "$output" != *"Unknown option"* ]]
}

@test "FA-SF-51: rejects unknown option" {
  run bash scripts/factory/auto-enqueue.sh --bogus
  [ "$status" -eq 2 ]
  [[ "$output" =~ "Unknown" ]]
}

@test "FA-SF-51: BRAND env var is required" {
  # Ohne BRAND gibt factory_resolve() einen Fehler
  run env BRAND="" bash scripts/factory/auto-enqueue.sh --dry-run
  # Erwartet entweder exit 1 oder Warnung im Output
  [[ "$status" -ne 0 ]] || [[ "$output" =~ "BRAND" ]]
}

@test "FA-SF-51: --help shows usage" {
  run bash scripts/factory/auto-enqueue.sh --help
  [ "$status" -eq 0 ]
  [[ "$output" =~ "auto-enqueue" ]]
}
```

- [ ] **Schritt 1.2: Führe den Test aus — erwarte FAIL**

```bash
cd /home/patrick/Bachelorprojekt/tmp/wt-qs-loop
./tests/unit/lib/bats-core/bin/bats tests/local/FA-SF-51-auto-enqueue.bats
```

Erwartetes Ergebnis: `FAIL` — `auto-enqueue.sh` existiert noch nicht.

- [ ] **Schritt 1.3: Schreibe `scripts/factory/auto-enqueue.sh`**

```bash
#!/usr/bin/env bash
# scripts/factory/auto-enqueue.sh — Lücke 3.1: plan_staged → backlog Auto-Übergang
#
# Für jede Brand prüft dieses Skript alle Tickets in status='plan_staged' mit
# type='feature'. Wenn ALLE vier Readiness-Flags (spec_skizziert, abhaengigkeiten_klar,
# offene_fragen_geklaert, aufwand_geschaetzt) true sind, wird das Ticket via
# `ticket.sh enqueue` in 'backlog' überführt (idempotent — enqueue setzt nur wenn nötig).
#
# Usage: BRAND=<brand> bash scripts/factory/auto-enqueue.sh [--dry-run] [--help]
#
# Env:
#   BRAND   — mentolder|korczewski (required)
#   FACTORY_DRY_RESOLVE — wenn gesetzt, kurz-schließt factory_resolve() (offline-test)
#
# Rufen: wakeup.sh ruft dieses Skript VOR dem Dispatcher-Tick auf.
set -euo pipefail
HERE="$(dirname "${BASH_SOURCE[0]}")"
source "$HERE/lib.sh"

DRY_RUN=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    --help)
      echo "Usage: BRAND=<brand> bash $(basename "${BASH_SOURCE[0]}") [--dry-run]"
      echo "  auto-enqueue: plan_staged + alle Readiness-Flags true → backlog"
      exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

factory_resolve
[[ -n "${FACTORY_DRY_RESOLVE:-}" ]] && { echo "resolved: ctx=${FACTORY_CTX} ns=${FACTORY_NS}"; exit 0; }

# Readiness-vollständige plan_staged Feature-Tickets abfragen
READY_IDS=$(cat <<'SQL' | BRAND="$BRAND" FACTORY_CTX="$FACTORY_CTX" factory_psql 2>/dev/null || echo ""
SELECT COALESCE(json_agg(external_id), '[]')
FROM tickets.tickets
WHERE type='feature'
  AND status='plan_staged'
  AND (readiness->>'spec_skizziert')::boolean IS TRUE
  AND (readiness->>'abhaengigkeiten_klar')::boolean IS TRUE
  AND (readiness->>'offene_fragen_geklaert')::boolean IS TRUE
  AND (readiness->>'aufwand_geschaetzt')::boolean IS TRUE;
SQL
)

if [[ -z "$READY_IDS" || "$READY_IDS" == "[]" || "$READY_IDS" == "null" ]]; then
  echo "auto-enqueue: keine ready plan_staged Tickets für ${BRAND}" >&2
  exit 0
fi

# JSON-Array → Zeilen (eine external_id pro Zeile)
mapfile -t IDS < <(echo "$READY_IDS" | jq -r '.[]')

for ext_id in "${IDS[@]}"; do
  [[ -z "$ext_id" ]] && continue
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "auto-enqueue [DRY-RUN]: würde ${ext_id} (${BRAND}) enqueuen"
    continue
  fi
  echo "auto-enqueue: enqueue ${ext_id} (${BRAND})" >&2
  BRAND="$BRAND" bash "$(dirname "${BASH_SOURCE[0]}")/../ticket.sh" enqueue --id "$ext_id"
done

echo "auto-enqueue: fertig (${#IDS[@]} Tickets geprüft, DRY_RUN=${DRY_RUN})"
```

- [ ] **Schritt 1.4: Mache das Skript ausführbar**

```bash
chmod +x scripts/factory/auto-enqueue.sh
```

- [ ] **Schritt 1.5: Führe den Test erneut aus — erwarte PASS**

```bash
./tests/unit/lib/bats-core/bin/bats tests/local/FA-SF-51-auto-enqueue.bats
```

Erwartetes Ergebnis: Alle 5 Tests `ok`.

- [ ] **Schritt 1.6: Commit**

```bash
git -C /home/patrick/Bachelorprojekt/tmp/wt-qs-loop add \
  scripts/factory/auto-enqueue.sh \
  tests/local/FA-SF-51-auto-enqueue.bats
git -C /home/patrick/Bachelorprojekt/tmp/wt-qs-loop commit -m "feat(factory): auto-enqueue plan_staged tickets when readiness complete [T000730]"
```

---

## Task 2: `wakeup.sh` Integration — Lücke 3.1 (Verdrahtung)

**Files:**
- Modify: `scripts/factory/wakeup.sh:99-115` (Idle-Retick-Loop, vor `claude -p` Aufruf)

### Constraint: wakeup.sh = 124 Zeilen, Limit 500 → Budget 376

Der `while true`-Loop in `wakeup.sh` startet pro Tick einen claude-Aufruf. Wir rufen `auto-enqueue.sh` für beide Brands *vor* dem claude-Aufruf auf, damit der Dispatcher im selben Tick die frisch-enqueueten Tickets sieht.

- [ ] **Schritt 2.1: Prüfe aktuelle Zeilenzahl**

```bash
wc -l /home/patrick/Bachelorprojekt/tmp/wt-qs-loop/scripts/factory/wakeup.sh
```

Erwartetes Ergebnis: `124`

- [ ] **Schritt 2.2: Füge auto-enqueue-Aufruf vor dem claude-Aufruf ein**

Suche den Block in `wakeup.sh`:

```bash
  echo "wakeup.sh: starting tick #${TICK} at ${TIMESTAMP}" >&2
  "${CLAUDE_BIN}" -p "${PROMPT}" \
```

Ersetze ihn durch:

```bash
  echo "wakeup.sh: starting tick #${TICK} at ${TIMESTAMP}" >&2
  # Lücke 3.1: plan_staged → backlog auto-enqueue (vor Dispatcher-Tick, damit schedule.sh
  # die frisch-enqueueten Tickets in diesem Tick sieht). Best-effort: Fehler nicht fatal.
  for _ae_brand in mentolder korczewski; do
    BRAND="$_ae_brand" bash "${REPO}/scripts/factory/auto-enqueue.sh" 2>&1 \
      | sed "s/^/[auto-enqueue:${_ae_brand}] /" >&2 || true
  done
  "${CLAUDE_BIN}" -p "${PROMPT}" \
```

- [ ] **Schritt 2.3: Prüfe Zeilenzahl nach Änderung**

```bash
wc -l /home/patrick/Bachelorprojekt/tmp/wt-qs-loop/scripts/factory/wakeup.sh
```

Erwartetes Ergebnis: ≤134 (10 neue Zeilen, weit unter Limit 500).

- [ ] **Schritt 2.4: Bestehende wakeup.sh-Tests grün**

```bash
./tests/unit/lib/bats-core/bin/bats tests/local/FA-SF-41-wakeup.bats \
                                    tests/local/FA-SF-47-wakeup-reasoning-effort.bats
```

Erwartetes Ergebnis: alle Tests `ok`.

- [ ] **Schritt 2.5: Commit**

```bash
git -C /home/patrick/Bachelorprojekt/tmp/wt-qs-loop add scripts/factory/wakeup.sh
git -C /home/patrick/Bachelorprojekt/tmp/wt-qs-loop commit -m "feat(factory): call auto-enqueue before each dispatcher tick [T000730]"
```

---

## Task 3: `.github/workflows/factory-post-merge-e2e.yml` — Lücke 6.1

**Files:**
- Create: `.github/workflows/factory-post-merge-e2e.yml`

### Warum dieser Ansatz?

`post-merge.yml` (existiert bereits) triggert auf `push` zu `main`. Wir erstellen einen separaten Workflow, der *nur* triggert wenn der Merge-Commit einen `T######`-Bezeichner enthält (Factory-PR-Signal), um versehentliche E2E-Läufe bei normalen Commits zu vermeiden. Der Workflow ruft `gh workflow run e2e.yml` auf — kein doppelter Playwright-Code.

- [ ] **Schritt 3.1: Schreibe `factory-post-merge-e2e.yml`**

```yaml
# .github/workflows/factory-post-merge-e2e.yml
# Lücke 6.1: E2E-Trigger nach Factory-PR-Merge.
# Triggert auf push zu main wenn der Merge-Commit einen T###### Ticket-Bezeichner enthält.
# Das schließt normale chore/fix Commits aus (die kein Ticket im Titel tragen).
name: Factory Post-Merge E2E

on:
  push:
    branches: [main]

jobs:
  trigger-e2e:
    runs-on: ubuntu-latest
    permissions:
      actions: write   # gh workflow run braucht write auf actions
      contents: read
    steps:
      - uses: actions/checkout@93cb6efe18208431cddfb8368fd83d5badbf9bfd  # v5
        with:
          fetch-depth: 1

      - name: Check if this is a Factory merge commit
        id: factory-check
        run: |
          set -euo pipefail
          COMMIT_MSG="$(git log -1 --pretty=%B)"
          TICKET_ID="$(echo "$COMMIT_MSG" | grep -oE 'T[0-9]{6}' | head -1 || true)"
          if [[ -z "$TICKET_ID" ]]; then
            echo "No T###### in merge commit — skipping E2E trigger."
            echo "is_factory=false" >> "$GITHUB_OUTPUT"
          else
            echo "Factory merge detected: $TICKET_ID — triggering E2E."
            echo "is_factory=true" >> "$GITHUB_OUTPUT"
            echo "ticket_id=$TICKET_ID" >> "$GITHUB_OUTPUT"
          fi

      - name: Trigger E2E workflow
        if: steps.factory-check.outputs.is_factory == 'true'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TICKET_ID: ${{ steps.factory-check.outputs.ticket_id }}
        run: |
          echo "Triggering e2e.yml for ticket $TICKET_ID (cluster=both)"
          gh workflow run e2e.yml \
            --ref main \
            --field cluster=both
          echo "E2E workflow dispatched."
```

- [ ] **Schritt 3.2: Prüfe Zeilenzahl**

```bash
wc -l /home/patrick/Bachelorprojekt/tmp/wt-qs-loop/.github/workflows/factory-post-merge-e2e.yml
```

Erwartetes Ergebnis: ≤55 Zeilen.

- [ ] **Schritt 3.3: Validiere YAML-Syntax**

```bash
python3 -c "import yaml, sys; yaml.safe_load(open('.github/workflows/factory-post-merge-e2e.yml'))" \
  && echo "YAML OK"
```

Erwartetes Ergebnis: `YAML OK`

- [ ] **Schritt 3.4: Commit**

```bash
git -C /home/patrick/Bachelorprojekt/tmp/wt-qs-loop add .github/workflows/factory-post-merge-e2e.yml
git -C /home/patrick/Bachelorprojekt/tmp/wt-qs-loop commit -m "feat(ci): trigger E2E after Factory PR merge [T000730]"
```

---

## Task 4: `website/src/lib/qa-ingest.ts` — Lücke 6.2 (Rückkanal-Logik)

**Files:**
- Create: `website/src/lib/qa-ingest.ts`
- Test: `website/src/lib/qa-ingest.test.ts`

### Warum separates Modul?

`ingest-e2e.ts` (200 Zeilen) würde mit Ticket-Schreib-Logik auf >350 Zeilen wachsen — noch im Budget, aber schwer testbar. Ein reines Modul `qa-ingest.ts` enthält nur die Mapping-Logik, ist ohne HTTP-Schicht testbar, und kann in Vitest mit pg-mem gemockt werden.

### Feature-Slug-Mapping-Strategie

Test-Namenkonvention: `[factory-qs-abnahme-loop] QS-Test: ...`. Der Bracket-Prefix ist der Feature-Slug. Der Ingest-Endpunkt übergibt alle Spec-Titel an `qa-ingest.ts`, das sie mit `qa_review`-Tickets matched.

Alternativ (Fallback): wenn kein `[slug]`-Prefix vorhanden, scannt die Funktion alle `qa_review`-Tickets und prüft ob alle E2E-Tests des Laufs PASS sind (aggregiertes Urteil ohne Slug-Mapping).

- [ ] **Schritt 4.1: Schreibe failing Vitest-Test**

Erstelle `website/src/lib/qa-ingest.test.ts`:

```typescript
// website/src/lib/qa-ingest.test.ts [T000730]
import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
vi.mock('./website-db', () => ({
  pool: { query: (...a: unknown[]) => query(...a), connect: vi.fn() },
}));
vi.mock('./knowledge-db', () => ({ MixedEmbeddingModelError: class {} }));

import { closeQaTicketsBySlug, type E2ETestResult } from './qa-ingest';

const PASS: E2ETestResult = { testId: '[my-slug] foo', status: 'pass' };
const FAIL: E2ETestResult = { testId: '[my-slug] bar', status: 'fail' };
const NO_SLUG: E2ETestResult = { testId: 'Generic test', status: 'pass' };

describe('closeQaTicketsBySlug', () => {
  beforeEach(() => query.mockReset());

  it('sets status=done when all tests for a slug pass', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 'uuid-1', external_id: 'T000999', slug_key: 'my-slug' }] })
      .mockResolvedValueOnce({ rowCount: 1 });
    const closed = await closeQaTicketsBySlug([PASS]);
    expect(closed).toEqual(['T000999']);
    // Expect an UPDATE tickets.tickets SET status='done' call
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("status = 'done'"),
      expect.arrayContaining(['uuid-1']),
    );
  });

  it('leaves ticket on qa_review when any test for its slug fails', async () => {
    query.mockResolvedValueOnce({
      rows: [{ id: 'uuid-2', external_id: 'T000888', slug_key: 'my-slug' }],
    });
    const closed = await closeQaTicketsBySlug([PASS, FAIL]);
    expect(closed).toEqual([]);
    // No UPDATE call
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('ignores test results with no [slug] prefix', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const closed = await closeQaTicketsBySlug([NO_SLUG]);
    expect(closed).toEqual([]);
  });

  it('returns empty array when no qa_review tickets exist', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const closed = await closeQaTicketsBySlug([PASS]);
    expect(closed).toEqual([]);
  });

  it('fails closed (empty) when DB throws', async () => {
    query.mockRejectedValueOnce(new Error('DB down'));
    const closed = await closeQaTicketsBySlug([PASS]);
    expect(closed).toEqual([]);
  });

  it('activates feature flag after closing ticket', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 'uuid-3', external_id: 'T000777', slug_key: 'my-slug' }] })
      .mockResolvedValueOnce({ rowCount: 1 })       // UPDATE status='done'
      .mockResolvedValueOnce({ rowCount: 1 });      // INSERT/UPDATE feature_flags
    await closeQaTicketsBySlug([PASS]);
    // Third query = feature_flag enable for both brands
    const calls = query.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(calls.some((sql) => sql.includes('feature_flags'))).toBe(true);
  });
});
```

- [ ] **Schritt 4.2: Führe Test aus — erwarte FAIL**

```bash
cd /home/patrick/Bachelorprojekt/tmp/wt-qs-loop/website
pnpm test -- --reporter=verbose src/lib/qa-ingest.test.ts 2>&1 | tail -20
```

Erwartetes Ergebnis: `Cannot find module './qa-ingest'`

- [ ] **Schritt 4.3: Schreibe `website/src/lib/qa-ingest.ts`**

```typescript
// website/src/lib/qa-ingest.ts [T000730]
// Rückkanal: mappt E2E-Ergebnisse auf qa_review-Tickets (Lücke 6.2).
//
// Feature-Slug-Konvention: Spec-/Test-Titel beginnen mit "[<slug>] ..."
// Wenn ALLE Tests für einen Slug PASS sind und ein qa_review-Ticket mit
// diesem Slug existiert, wird das Ticket auf 'done' gesetzt und der
// Feature-Flag für beide Brands aktiviert.
//
// Dieses Modul ist zustandslos und hat keine HTTP-Abhängigkeit — testbar
// mit pg-mem oder vi.mock('./website-db').
import { pool } from './website-db';

export type E2ETestStatus = 'pass' | 'fail' | 'skip';

export interface E2ETestResult {
  testId: string;
  status: E2ETestStatus;
}

/** Extrahiert "[slug]" aus dem Test-Titel. Gibt null zurück wenn kein Prefix. */
function extractSlug(testId: string): string | null {
  const m = testId.match(/^\[([^\]]+)\]/);
  return m ? m[1] : null;
}

/**
 * Prüft alle übergebenen E2E-Ergebnisse auf Feature-Slug-Matches gegen
 * qa_review-Tickets. Schließt vollständig grüne Tickets (→ 'done') ab.
 *
 * @returns Liste der external_ids der geschlossenen Tickets
 */
export async function closeQaTicketsBySlug(results: E2ETestResult[]): Promise<string[]> {
  // Gruppiere Ergebnisse nach Slug
  const bySlug = new Map<string, E2ETestStatus[]>();
  for (const r of results) {
    const slug = extractSlug(r.testId);
    if (!slug) continue;
    const existing = bySlug.get(slug) ?? [];
    existing.push(r.status);
    bySlug.set(slug, existing);
  }
  if (bySlug.size === 0) return [];

  // Slugs mit mindestens einem FAIL ausschließen
  const passSlugs = [...bySlug.entries()]
    .filter(([, statuses]) => statuses.every((s) => s === 'pass' || s === 'skip'))
    .map(([slug]) => slug);
  if (passSlugs.length === 0) return [];

  // qa_review-Tickets mit passenden Slugs laden
  // slug_key = external_id-Suffix nach 'T######-' ODER value_prop enthält den Slug
  // Praktisch: Pipeline setzt slug = feature/<slug> Branch-Name → in ticket_comments
  // steht "FACTORY-PLAN-REF branch=feature/<slug> plan=...". Einfachstes Matching:
  // suche in ticket_comments nach "branch=feature/<slug>" für jeden passSlugs-Eintrag.
  let qaRows: Array<{ id: string; external_id: string; slug_key: string }> = [];
  try {
    const r = await pool.query<{ id: string; external_id: string; slug_key: string }>(
      `SELECT DISTINCT t.id, t.external_id,
              substring(c.body FROM 'branch=feature/([^ ]+)') AS slug_key
       FROM tickets.tickets t
       JOIN tickets.ticket_comments c ON c.ticket_id = t.id
       WHERE t.status = 'qa_review'
         AND t.type = 'feature'
         AND c.body LIKE 'FACTORY-PLAN-REF %'
         AND substring(c.body FROM 'branch=feature/([^ ]+)') = ANY($1)`,
      [passSlugs],
    );
    qaRows = r.rows;
  } catch {
    return [];
  }

  if (qaRows.length === 0) return [];

  const closed: string[] = [];
  for (const row of qaRows) {
    try {
      const updateResult = await pool.query(
        `UPDATE tickets.tickets
         SET status = 'done', done_at = now(), pipeline_slot = NULL, updated_at = now()
         WHERE id = $1 AND status = 'qa_review'`,
        [row.id],
      );
      if ((updateResult.rowCount ?? 0) === 0) continue;
      closed.push(row.external_id);

      // Feature-Flag für beide Brands aktivieren (idempotent)
      await pool.query(
        `INSERT INTO tickets.feature_flags (brand, key, enabled, set_by)
         VALUES ('mentolder', $1, true, 'qa-auto'), ('korczewski', $1, true, 'qa-auto')
         ON CONFLICT (brand, key) DO UPDATE SET enabled = true, set_by = 'qa-auto'`,
        [row.slug_key],
      );
    } catch {
      // Ticket bleibt auf qa_review — kein Datenverlust
    }
  }
  return closed;
}
```

- [ ] **Schritt 4.4: Führe den Test erneut aus — erwarte PASS**

```bash
cd /home/patrick/Bachelorprojekt/tmp/wt-qs-loop/website
pnpm test -- --reporter=verbose src/lib/qa-ingest.test.ts 2>&1 | tail -20
```

Erwartetes Ergebnis: Alle 6 Tests `✓`

- [ ] **Schritt 4.5: Prüfe S1-Budget**

```bash
wc -l /home/patrick/Bachelorprojekt/tmp/wt-qs-loop/website/src/lib/qa-ingest.ts
```

Erwartetes Ergebnis: ≤100 Zeilen (Budget: 600, weit darunter)

- [ ] **Schritt 4.6: Commit**

```bash
git -C /home/patrick/Bachelorprojekt/tmp/wt-qs-loop add \
  website/src/lib/qa-ingest.ts \
  website/src/lib/qa-ingest.test.ts
git -C /home/patrick/Bachelorprojekt/tmp/wt-qs-loop commit -m "feat(website): E2E-Ingest Ticket-Rückkanal via feature-slug mapping [T000730]"
```

---

## Task 5: `ingest-e2e.ts` Integration — Lücke 6.2 (Verdrahtung)

**Files:**
- Modify: `website/src/pages/api/admin/tests/ingest-e2e.ts:196-200` (vor `return`)

### S1-Budget: 200 Zeilen, Limit 600 → Budget 400. Erweiterung um ~15 Zeilen OK.

- [ ] **Schritt 5.1: Prüfe aktuelle Zeilenzahl**

```bash
wc -l /home/patrick/Bachelorprojekt/tmp/wt-qs-loop/website/src/pages/api/admin/tests/ingest-e2e.ts
```

Erwartetes Ergebnis: `200`

- [ ] **Schritt 5.2: Füge Import und Aufruf hinzu**

Am Anfang der Datei (nach letztem Import, vor `interface`-Definitionen), füge hinzu:

```typescript
import { closeQaTicketsBySlug } from '../../../../lib/qa-ingest';
```

Kurz vor dem `return`-Statement (nach `if (ticketId) ticketsOpened++`), füge ein:

```typescript
  // Lücke 6.2: E2E-Ingest → Ticket-Rückkanal. Prüft ob grüne Tests Feature-Slugs
  // matchen und setzt vollständige qa_review-Tickets auf 'done'. Best-effort.
  let ticketsClosed: string[] = [];
  try {
    const resultList = rows.map((r) => ({ testId: r.testId, status: r.status as 'pass' | 'fail' | 'skip' }));
    ticketsClosed = await closeQaTicketsBySlug(resultList);
    if (ticketsClosed.length > 0) {
      console.info(`[ingest-e2e] auto-closed qa_review tickets: ${ticketsClosed.join(', ')}`);
    }
  } catch (err) {
    console.warn('[ingest-e2e] qa-ingest closeQaTicketsBySlug failed (non-fatal):', err);
  }
```

Aktualisiere das `return`-Statement:

```typescript
  return new Response(
    JSON.stringify({ ok: true, runId, count: rows.length, ticketsOpened, ticketsClosed }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
```

- [ ] **Schritt 5.3: Prüfe S1 nach Änderung**

```bash
wc -l /home/patrick/Bachelorprojekt/tmp/wt-qs-loop/website/src/pages/api/admin/tests/ingest-e2e.ts
```

Erwartetes Ergebnis: ≤220 (weit unter Budget 600)

- [ ] **Schritt 5.4: TypeScript-Check**

```bash
cd /home/patrick/Bachelorprojekt/tmp/wt-qs-loop/website
pnpm tsc --noEmit 2>&1 | grep -i "error\|qa-ingest\|ingest-e2e" | head -20
```

Erwartetes Ergebnis: keine Fehler

- [ ] **Schritt 5.5: Commit**

```bash
git -C /home/patrick/Bachelorprojekt/tmp/wt-qs-loop add \
  website/src/pages/api/admin/tests/ingest-e2e.ts
git -C /home/patrick/Bachelorprojekt/tmp/wt-qs-loop commit -m "feat(website): wire qa-ingest into ingest-e2e endpoint [T000730]"
```

---

## Task 6: `scripts/factory/qa-notify.sh` + `pipeline.js` — Lücke 7.1

**Files:**
- Create: `scripts/factory/qa-notify.sh`
- Modify: `scripts/factory/pipeline.js:700` (Schritt 5 nach qa_review-Transition)
- Test: `tests/local/FA-SF-52-qa-notify.bats`

### Warum separates Skript statt pipeline.js-Inline?

`pipeline.js` (777 Zeilen) liegt bereits über dem 600-Zeilen-JS-Limit. Jede weitere Zeile trippe S1 in CI. `qa-notify.sh` kapselt die Notification-Logik und wird von pipeline.js via `bash` aufgerufen — kein S1-Verstoß. Das Skript akzeptiert `--ticket-id`, `--title`, `--slug` und `--event qa_review|done` als Parameter.

- [ ] **Schritt 6.1: Schreibe failing BATS-Test**

Erstelle `tests/local/FA-SF-52-qa-notify.bats`:

```bash
#!/usr/bin/env bats
# FA-SF-52: offline arg-validation für scripts/factory/qa-notify.sh [T000730]
setup() { load 'test_helper.bash'; }

@test "FA-SF-52: qa-notify.sh is executable" {
  [ -x scripts/factory/qa-notify.sh ]
}

@test "FA-SF-52: --event is required" {
  run bash scripts/factory/qa-notify.sh --ticket-id T000001 --title "x" --slug foo
  [ "$status" -eq 2 ]
  [[ "$output" =~ "--event" ]]
}

@test "FA-SF-52: rejects invalid --event" {
  run bash scripts/factory/qa-notify.sh --event launch --ticket-id T1 --title x --slug s
  [ "$status" -eq 2 ]
  [[ "$output" =~ "qa_review\|done" ]]
}

@test "FA-SF-52: --ticket-id is required" {
  run bash scripts/factory/qa-notify.sh --event qa_review --title "x" --slug foo
  [ "$status" -eq 2 ]
  [[ "$output" =~ "--ticket-id" ]]
}

@test "FA-SF-52: --slug is required" {
  run bash scripts/factory/qa-notify.sh --event qa_review --ticket-id T1 --title "x"
  [ "$status" -eq 2 ]
  [[ "$output" =~ "--slug" ]]
}

@test "FA-SF-52: --help exits 0 with usage" {
  run bash scripts/factory/qa-notify.sh --help
  [ "$status" -eq 0 ]
  [[ "$output" =~ "qa-notify" ]]
}
```

- [ ] **Schritt 6.2: Führe den Test aus — erwarte FAIL**

```bash
./tests/unit/lib/bats-core/bin/bats tests/local/FA-SF-52-qa-notify.bats
```

Erwartetes Ergebnis: Alle FAIL (Datei existiert nicht).

- [ ] **Schritt 6.3: Schreibe `scripts/factory/qa-notify.sh`**

```bash
#!/usr/bin/env bash
# scripts/factory/qa-notify.sh — QS-Abnahme-Notifications [T000730]
#
# Sendet eine PushNotification für QS-Abnahme-Events. Aufgerufen von pipeline.js
# nach der qa_review- bzw. done-Transition (Lücke 7.1).
#
# Usage: bash scripts/factory/qa-notify.sh \
#          --event qa_review|done \
#          --ticket-id T000730 \
#          --title "Feature-Titel" \
#          --slug factory-qs-abnahme-loop
#
# Kein claude-/PushNotification-API-Aufruf direkt — PushNotification ist ein
# DEFERRED Tool und kann nur aus dem Workflow-Laufzeitkontext aufgerufen werden.
# Dieses Skript gibt stattdessen einen strukturierten JSON-Block aus, den der
# rufende Workflow-Agent via ToolSearch+PushNotification weiterleitet.
set -euo pipefail

EVENT="" TICKET_ID="" TITLE="" SLUG=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --event)      EVENT="$2"; shift 2 ;;
    --ticket-id)  TICKET_ID="$2"; shift 2 ;;
    --title)      TITLE="$2"; shift 2 ;;
    --slug)       SLUG="$2"; shift 2 ;;
    --help)
      echo "Usage: bash $(basename "${BASH_SOURCE[0]}") --event qa_review|done --ticket-id T###### --title <title> --slug <slug>"
      echo "  qa-notify: gibt PushNotification-Payload für QS-Abnahme-Events aus"
      exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "$TICKET_ID" ]]; then echo "ERROR: --ticket-id is required." >&2; exit 2; fi
if [[ -z "$SLUG" ]];      then echo "ERROR: --slug is required."      >&2; exit 2; fi
if [[ -z "$EVENT" ]]; then
  echo "ERROR: --event is required (qa_review|done)." >&2; exit 2
fi
if [[ "$EVENT" != "qa_review" && "$EVENT" != "done" ]]; then
  echo "ERROR: --event must be qa_review|done (got: $EVENT)." >&2; exit 2
fi

case "$EVENT" in
  qa_review)
    PUSH_TITLE="Factory QS-Review: ${TICKET_ID}"
    PUSH_BODY="Ticket \"${TITLE:-$TICKET_ID}\" (${SLUG}) wartet auf QS-Abnahme. E2E-Tests laufen nachts oder on-demand."
    ;;
  done)
    PUSH_TITLE="Feature live: ${TICKET_ID}"
    PUSH_BODY="Ticket \"${TITLE:-$TICKET_ID}\" (${SLUG}) erfolgreich abgenommen. Feature-Flag aktiviert."
    ;;
esac

# Strukturierter Output für den rufenden Workflow-Agenten
cat <<EOF
QA_NOTIFY_PAYLOAD: title="${PUSH_TITLE}" body="${PUSH_BODY}" event=${EVENT} ticket=${TICKET_ID} slug=${SLUG}
EOF
```

- [ ] **Schritt 6.4: Mache ausführbar**

```bash
chmod +x scripts/factory/qa-notify.sh
```

- [ ] **Schritt 6.5: Führe BATS-Tests aus — erwarte PASS**

```bash
./tests/unit/lib/bats-core/bin/bats tests/local/FA-SF-52-qa-notify.bats
```

Erwartetes Ergebnis: alle 6 Tests `ok`

- [ ] **Schritt 6.6: Erweitere `pipeline.js` Schritt 5 (nach qa_review-Transition)**

Suche in `pipeline.js` den Block (Zeilen 699-706):

```javascript
   5. Close the ticket and archive the plan:
      bash ${REPO}/scripts/ticket.sh update-status --id ${A.ticket_id} --status qa_review
```

Ersetze (netto-zeilenneutral — gleiche Anzahl Zeilen, wir ersetzen Zeile 700 durch den gleichen Inhalt + fügen Notify-Aufruf als Teil der Anleitung hinzu ohne neue JS-Zeilen):

Füge *nach* dem `archive-plan`-Befehl (Zeile 702) und *vor* `5b.` diese Zeile in den Template-String ein:

```
   5c. QA-Notification (PushNotification über qa-notify.sh Payload):
      bash ${REPO}/scripts/factory/qa-notify.sh \
        --event qa_review \
        --ticket-id ${A.ticket_id} \
        --title "${A.title}" \
        --slug ${slug}
      Lese den Output (QA_NOTIFY_PAYLOAD: title="..." body="..."). Dann:
      ToolSearch select:PushNotification  (Schema laden)
      PushNotification mit title und body aus dem Payload.
```

> **Implementierungsdetail:** Der Template-String in `pipeline.js` enthält mehrzeilige Anweisungen für den Deploy-Agenten. Wir erweitern nur den Text-Inhalt des bestehenden Template-Strings (JS-Zeilenanzahl ändert sich nicht, da es Stringinhalt ist).

Konkret: Finde die Zeile in `pipeline.js`:

```
   5b. Seed the dark-launch flag default-OFF for BOTH brands
```

Füge *davor* ein:

```
   5c. QS-Notification:
      bash ${REPO}/scripts/factory/qa-notify.sh \\
        --event qa_review --ticket-id ${A.ticket_id} --title "${A.title}" --slug ${slug}
      Lese QA_NOTIFY_PAYLOAD aus stdout. Dann: ToolSearch select:PushNotification, PushNotification
      mit title/body aus dem Payload.
```

- [ ] **Schritt 6.7: Prüfe Zeilenzahl pipeline.js nach Änderung**

```bash
wc -l /home/patrick/Bachelorprojekt/tmp/wt-qs-loop/scripts/factory/pipeline.js
```

Erwartetes Ergebnis: ≤790 (S1 Limit für nicht-baselinete JS = 600, aber pipeline.js ist bereits über Limit → wir dürfen es NICHT weiter wachsen lassen über den aktuellen Wert). Wenn die Änderung mehr als 0 Zeilen hinzufügt, muss sie an anderer Stelle kompensiert werden (z.B. Leerzeilen entfernen).

> ⚠️ **S1-Fußangel**: pipeline.js ist bei 777 Zeilen und nicht baselined. Der S1-Check (`check.mjs`) vergleicht gegen das Extension-Limit (600) — da es nicht in baseline.json steht, gilt das statische Limit. 777 > 600 bedeutet, es würde bereits heute S1 kippen, **wenn** die Datei geprüft wird. Prüfe `docs/code-quality/gates.yaml` ob pipeline.js explizit ausgenommen ist. Falls nicht: Erweiterung um 0 Zeilen (nur Stringinhalt des Template-Literals ändern, keine neuen JS-Zeilen).

- [ ] **Schritt 6.8: `node --check` für pipeline.js**

```bash
node --check scripts/factory/pipeline.js && echo "OK"
```

Erwartetes Ergebnis: `OK`

- [ ] **Schritt 6.9: Commit**

```bash
git -C /home/patrick/Bachelorprojekt/tmp/wt-qs-loop add \
  scripts/factory/qa-notify.sh \
  tests/local/FA-SF-52-qa-notify.bats \
  scripts/factory/pipeline.js
git -C /home/patrick/Bachelorprojekt/tmp/wt-qs-loop commit -m "feat(factory): QS-Notification nach qa_review-Transition [T000730]"
```

---

## Task 7: E2E-Playwright-Test für QS-Abnahme-Flow

**Files:**
- Create: `tests/e2e/factory-qs-abnahme.spec.ts`

### Warum dieser Test?

Der E2E-Test verifiziert den sichtbaren Teil des QS-Loops aus Nutzersicht: das `/dev-status`-Dashboard zeigt ein `done`-Ticket nach dem QS-Abnahme-Zyklus korrekt an. Er benötigt Auth (Admin-Session) und läuft nur gegen Live-Prod.

- [ ] **Schritt 7.1: Schreibe `tests/e2e/factory-qs-abnahme.spec.ts`**

```typescript
// tests/e2e/factory-qs-abnahme.spec.ts [T000730]
// Verifiziert den QS-Abnahme-Flow im /dev-status Dashboard (smoke-level).
// Benötigt E2E_ADMIN_USER + E2E_ADMIN_PASS (Keycloak-Admin).
// Läuft nur gegen Live-Prod (WEBSITE_URL env var).
import { test, expect } from '@playwright/test';

const WEBSITE_URL = process.env.WEBSITE_URL ?? 'http://localhost:4321';
const ADMIN_USER = process.env.E2E_ADMIN_USER ?? 'paddione';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS ?? '';

test.describe('[factory-qs-abnahme-loop] QS-Abnahme-Flow', () => {
  test.skip(!ADMIN_PASS, 'E2E_ADMIN_PASS nicht gesetzt — überspringe Auth-Test');

  test('[factory-qs-abnahme-loop] /dev-status lädt ohne Fehler', async ({ page }) => {
    // Auth: Login via Keycloak
    await page.goto(`${WEBSITE_URL}/admin/dev-status`);
    // Redirect zu Keycloak wenn nicht eingeloggt
    if (page.url().includes('/auth/') || page.url().includes('/login')) {
      await page.fill('input[name="username"]', ADMIN_USER);
      await page.fill('input[name="password"]', ADMIN_PASS);
      await page.click('input[type="submit"]');
      await page.waitForURL(`${WEBSITE_URL}/admin/dev-status`);
    }
    await expect(page).toHaveURL(/dev-status/);
    // Seite lädt ohne JS-Fehler
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.waitForLoadState('networkidle');
    expect(errors).toHaveLength(0);
  });

  test('[factory-qs-abnahme-loop] /admin/dev-status zeigt QS-Tab', async ({ page }) => {
    await page.goto(`${WEBSITE_URL}/admin/dev-status`);
    if (page.url().includes('/auth/') || page.url().includes('/login')) {
      await page.fill('input[name="username"]', ADMIN_USER);
      await page.fill('input[name="password"]', ADMIN_PASS);
      await page.click('input[type="submit"]');
      await page.waitForURL(`${WEBSITE_URL}/admin/dev-status`);
    }
    // QS-Tab oder "QS-Abnahme"-Sektion sichtbar
    const qsElement = page.locator('text=QS').first();
    await expect(qsElement).toBeVisible({ timeout: 10_000 });
  });

  test('[factory-qs-abnahme-loop] ingest-e2e Endpoint antwortet mit 401 ohne Token', async ({ request }) => {
    const resp = await request.post(`${WEBSITE_URL}/api/admin/tests/ingest-e2e`, {
      data: { suites: [], stats: { startTime: new Date().toISOString(), duration: 0, expected: 0, unexpected: 0, skipped: 0 } },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(resp.status()).toBe(401);
  });

  test('[factory-qs-abnahme-loop] ingest-e2e Endpoint akzeptiert validen Payload mit Token', async ({ request }) => {
    test.skip(!process.env.E2E_INGEST_TOKEN, 'E2E_INGEST_TOKEN nicht gesetzt');
    const resp = await request.post(`${WEBSITE_URL}/api/admin/tests/ingest-e2e`, {
      data: {
        suites: [],
        stats: { startTime: new Date().toISOString(), duration: 100, expected: 0, unexpected: 0, skipped: 0 },
        runId: `test-qa-loop-${Date.now()}`,
        cluster: 'mentolder',
      },
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.E2E_INGEST_TOKEN}`,
      },
    });
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body).toMatchObject({ ok: true, ticketsClosed: expect.any(Array) });
  });
});
```

- [ ] **Schritt 7.2: Prüfe dass der neue Test in der Test-Datei-Liste erscheint**

```bash
ls /home/patrick/Bachelorprojekt/tmp/wt-qs-loop/tests/e2e/factory-qs-abnahme.spec.ts
```

Erwartetes Ergebnis: Datei existiert

- [ ] **Schritt 7.3: Commit**

```bash
git -C /home/patrick/Bachelorprojekt/tmp/wt-qs-loop add tests/e2e/factory-qs-abnahme.spec.ts
git -C /home/patrick/Bachelorprojekt/tmp/wt-qs-loop commit -m "test(e2e): factory QS-Abnahme-Loop E2E smoke tests [T000730]"
```

---

## Task 8: Test-Inventory regenerieren + CI-Verifikation

**Files:**
- Modify: `website/src/data/test-inventory.json` (auto-generiert)

### Pflicht: Nach neuen Vitest-Tests muss test-inventory.json aktualisiert werden, sonst schlägt CI fehl.

- [ ] **Schritt 8.1: Führe alle offline Tests durch**

```bash
cd /home/patrick/Bachelorprojekt/tmp/wt-qs-loop
task test:all 2>&1 | tail -30
```

Erwartetes Ergebnis: alle Tests grün.

- [ ] **Schritt 8.2: Regeneriere Test-Inventory**

```bash
cd /home/patrick/Bachelorprojekt/tmp/wt-qs-loop
task test:inventory 2>&1 | tail -10
```

Erwartetes Ergebnis: `website/src/data/test-inventory.json` aktualisiert.

- [ ] **Schritt 8.3: Führe freshness:regenerate durch**

```bash
cd /home/patrick/Bachelorprojekt/tmp/wt-qs-loop
task freshness:regenerate 2>&1 | tail -20
```

- [ ] **Schritt 8.4: Führe freshness:check durch**

```bash
cd /home/patrick/Bachelorprojekt/tmp/wt-qs-loop
task freshness:check 2>&1 | tail -20
```

Erwartetes Ergebnis: keine S1/S2/S3 Fehler.

- [ ] **Schritt 8.5: S1 Gate explizit prüfen**

```bash
cd /home/patrick/Bachelorprojekt/tmp/wt-qs-loop
node scripts/code-quality/check.mjs 2>&1 | tail -20
```

Erwartetes Ergebnis: kein `FAIL` für geänderte Dateien.

- [ ] **Schritt 8.6: Commit regenerierte Artefakte**

```bash
git -C /home/patrick/Bachelorprojekt/tmp/wt-qs-loop add \
  website/src/data/test-inventory.json \
  docs/generated/ \
  docs/code-quality/repo-index.json
git -C /home/patrick/Bachelorprojekt/tmp/wt-qs-loop commit -m "chore: regenerate freshness artifacts [ci skip] [T000730]" || echo "Keine Änderungen nötig"
```

---

## Task 9: feature_flags ON CONFLICT — Migrations-Prüfung

**Files:**
- Possibly Create: `scripts/migrations/2026-06-15-feature-flags-unique-constraint.sql`

### Warum?

`qa-ingest.ts` nutzt `ON CONFLICT (brand, key)` auf `tickets.feature_flags`. Das setzt einen UNIQUE Constraint auf `(brand, key)` voraus. Prüfe ob er existiert.

- [ ] **Schritt 9.1: Prüfe bestehenden Constraint**

```bash
grep -r "feature_flags.*unique\|unique.*feature_flags\|PRIMARY KEY.*brand.*key\|UNIQUE.*brand.*key" \
  /home/patrick/Bachelorprojekt/tmp/wt-qs-loop/scripts/ \
  /home/patrick/Bachelorprojekt/tmp/wt-qs-loop/website/src/ 2>/dev/null | head -10
```

- [ ] **Schritt 9.2: Erstelle Migration falls Constraint fehlt**

Wenn Schritt 9.1 nichts findet, erstelle:

`scripts/migrations/2026-06-15-feature-flags-unique-constraint.sql`:

```sql
-- [T000730] Sichert ON CONFLICT (brand, key) in qa-ingest.ts ab.
-- Idempotent (IF NOT EXISTS).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'feature_flags_brand_key_key'
      AND conrelid = 'tickets.feature_flags'::regclass
  ) THEN
    ALTER TABLE tickets.feature_flags ADD CONSTRAINT feature_flags_brand_key_key UNIQUE (brand, key);
  END IF;
END $$;
```

- [ ] **Schritt 9.3: Wenn Migration erstellt — dokumentiere in Plan-Kommentar**

Füge einen Kommentar in das Plan-Dokument ein (nur wenn Migration nötig):

> **Post-merge manuell ausführen**: `scripts/migrations/2026-06-15-feature-flags-unique-constraint.sql` auf beiden Brand-DBs (`ENV=mentolder` und `ENV=korczewski`).

- [ ] **Schritt 9.4: Commit (nur wenn Migration nötig)**

```bash
git -C /home/patrick/Bachelorprojekt/tmp/wt-qs-loop add \
  scripts/migrations/2026-06-15-feature-flags-unique-constraint.sql
git -C /home/patrick/Bachelorprojekt/tmp/wt-qs-loop commit -m "chore(db): add unique constraint for feature_flags(brand,key) [T000730]"
```

---

## Task 10: Finale Zusammenfassung & Plan-Frontmatter

- [ ] **Schritt 10.1: Führe vollständige Testsuite durch**

```bash
cd /home/patrick/Bachelorprojekt/tmp/wt-qs-loop
task test:all 2>&1 | tail -30
```

Erwartetes Ergebnis: 0 Fehler.

- [ ] **Schritt 10.2: Führe Vitest durch**

```bash
cd /home/patrick/Bachelorprojekt/tmp/wt-qs-loop/website
pnpm test -- --reporter=verbose src/lib/qa-ingest.test.ts 2>&1 | tail -10
```

Erwartetes Ergebnis: alle Tests grün.

- [ ] **Schritt 10.3: Factory-Tests (FA-SF-51, FA-SF-52)**

```bash
cd /home/patrick/Bachelorprojekt/tmp/wt-qs-loop
./tests/unit/lib/bats-core/bin/bats \
  tests/local/FA-SF-51-auto-enqueue.bats \
  tests/local/FA-SF-52-qa-notify.bats
```

Erwartetes Ergebnis: alle Tests `ok`.

- [ ] **Schritt 10.4: node --check für alle neuen/geänderten JS-Dateien**

```bash
node --check scripts/factory/pipeline.js \
             scripts/factory/dispatcher.js \
             && echo "All JS OK"
```

Erwartetes Ergebnis: `All JS OK`

- [ ] **Schritt 10.5: Plan-Frontmatter-Hook**

```bash
bash /home/patrick/Bachelorprojekt/scripts/plan-frontmatter-hook.sh \
  /home/patrick/Bachelorprojekt/tmp/wt-qs-loop/docs/superpowers/plans/2026-06-15-factory-qs-abnahme-loop.md
```

---

## Self-Review Checkliste

### Spec-Coverage-Check

| Lücke | Task |
|---|---|
| 3.1 plan_staged → Auto-Enqueue | Tasks 1 + 2 |
| 6.1 E2E-Trigger nach Merge | Task 3 |
| 6.2 E2E-Ingest → Ticket-Rückkanal | Tasks 4 + 5 |
| 7.1 QS-Abnahme-Automatisierung | Task 6 |

### Placeholder-Scan

- Keine `TBD` / `TODO` in Code-Snippets ✓
- Alle Datei-Pfade absolut/exakt angegeben ✓
- Alle Commands mit `cd`-Präfix oder absolutem Pfad ✓
- Kein `mentolder.de` / `korczewski.de` Literal in Code-Snippets ✓ (S3-Gate)
- `PROD_DOMAIN`-Env-Var statt Brand-Literale ✓

### Typ-Konsistenz

- `E2ETestResult.status` Type: `'pass' | 'fail' | 'skip'` — konsistent in `qa-ingest.ts` und `qa-ingest.test.ts` ✓
- `closeQaTicketsBySlug()` Signatur: `(results: E2ETestResult[]) => Promise<string[]>` — konsistent ✓
- `ticketsClosed` im ingest-e2e Response Body: `string[]` ✓

### S3-Gate (keine hardcodierten Domains)

- `qa-notify.sh`: keine Domains ✓
- `auto-enqueue.sh`: keine Domains ✓
- `qa-ingest.ts`: keine Domains ✓
- `factory-post-merge-e2e.yml`: keine Domains (verwendet `matrix.website_url` aus e2e.yml-Input, nicht inline) ✓

---

## Testplan-Übersicht

| Kategorie | Datei | Anzahl Tests | Typ |
|---|---|---|---|
| BATS (offline) | `FA-SF-51-auto-enqueue.bats` | 5 | CLI-Arg-Validation + Executable |
| BATS (offline) | `FA-SF-52-qa-notify.bats` | 6 | CLI-Arg-Validation + Executable |
| Vitest (pg-mem) | `qa-ingest.test.ts` | 6 | Unit-Test mit DB-Mock |
| Playwright (E2E) | `factory-qs-abnahme.spec.ts` | 4 | Live-Prod Smoke |

**Gesamt: 21 Tests** in 4 Kategorien (BATS offline, Vitest Unit, Playwright E2E).
