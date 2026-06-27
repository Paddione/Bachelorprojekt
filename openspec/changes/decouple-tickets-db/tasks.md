---
title: "Decouple tickets-db from website-db (G-CQ07 cycle #1)"
ticket_id: T001172
domains: [website, quality]
status: active
file_locks: [website/src/lib/tickets-db.ts, website/src/lib/website-db.ts, docs/code-quality/gates.yaml]
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Tasks: decouple-tickets-db (T001172)

- [ ] Task 0: Failing-Test schreiben (RED) — BATS-Test gegen G-CQ07-Zyklus #1
- [ ] Task 1: Neues Modul `tickets-schema.ts` anlegen
- [ ] Task 2: `tickets-db.ts` auf Fassaden-Reduktion zurückschneiden
- [ ] Task 3: `website-db.ts` Import auf `tickets-schema` umverdrahten
- [ ] Task 4: Sechs `vi.mock`-Pfade + zwei readFileSync-Quellen in den Tests nachziehen
- [ ] Task 5: `s1.ignore` um `tickets-schema.ts` erweitern
- [ ] Task 6: Failing-Test re-runnen (GREEN) + Workspace-Validierung + Commit + PR

---

# G-CQ07 Cycle #1 — Decouple `tickets-db.ts` from `website-db.ts` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans

**Goal:** Den einzigen statischen Import-Zyklus zwischen `tickets-db.ts` und
`website-db.ts` (G-CQ07 Zyklus #1) auflösen, sodass
`npx --yes madge --circular --extensions ts,tsx website/src` ihn nicht mehr
meldet. Die übrigen drei Zyklen (#2, #3, #4) bleiben für separate PRs.

**Architecture:** Extraktion der `pool`-nutzenden Funktionen
(`initTicketsSchema`, `isFeatureEnabled`) und des `MixedEmbeddingModelError`
-Re-Exports aus `tickets-db.ts` in ein neues Geschwister-Modul
`tickets-schema.ts`. `tickets-db.ts` wird zur dünnen Fassade, die alle vier
Top-Level-Exports aus dem neuen Modul re-exportiert — damit können
`tickets/admin.ts`, `tickets-embed.ts`, `systemtest/*` und die sieben
Test-Files ihre `import { … } from './tickets-db'`-Zeilen unverändert lassen.
`website-db.ts` zieht seinen einzigen `initTicketsSchema`-Import auf
`tickets-schema` um. Das neue Modul landet in `s1.ignore`, weil es ~1080
DDL-Zeilen akkumuliert (analog zu `website-db.ts`).

**Tech Stack:** TypeScript, Node.js, `pg`, `npx madge`, BATS, vitest.

## Global Constraints

- **Keine** Änderung an Public-API-Signaturen (siehe Spec §
  „Public API of `tickets-db.ts` is preserved").
- **Keine** Änderungen außerhalb der in der File-Structure unten genannten
  Dateien (drei Refactor-Dateien + 1 Gate-YAML + 7 Test-Anpassungen).
- Keine Modifikation der Sub-Module `tickets/transition.ts`,
  `tickets/reporter-link.ts`, `invoice-pdf.ts`, `native-billing.ts`.
- Bestehende Tests bleiben grün — die `vi.mock`-Pfad-Updates sind die einzige
  Test-Änderung.
- `s1.ignore`-Eintrag für `tickets-schema.ts` muss einen Begründungstext
  analog zu `website-db.ts` haben.
- DDL-Body wandert 1:1 von `tickets-db.ts` nach `tickets-schema.ts` — kein
  Funktions-Refactor, keine SQL-Änderung.

## File Structure

```
website/src/lib/tickets-schema.ts                          ← NEU: Schema-Init + isFeatureEnabled
website/src/lib/tickets-db.ts                              ← MODIFY: schrumpfen zur Fassade
website/src/lib/website-db.ts                              ← MODIFY: 1-Zeilen-Import-Umverdrahtung
website/src/lib/factory-floor.test.ts                      ← MODIFY: vi.mock-Pfad → tickets-schema
website/src/lib/factory-metrics.test.ts                    ← MODIFY: vi.mock-Pfad → tickets-schema
website/src/lib/platform-db.ensure.test.ts                 ← MODIFY: vi.mock-Pfad → tickets-schema
website/src/lib/questionnaire-db.ensure.test.ts            ← MODIFY: vi.mock-Pfad → tickets-schema
website/src/lib/tickets-db.providerrouting.test.ts         ← MODIFY: vi.mock-Pfad + readFileSync-Pfad → tickets-schema
website/src/lib/website-db-init-hotpath.test.ts            ← MODIFY: vi.mock-Pfad → tickets-schema
website/src/lib/tickets-db.test.ts                        ← MODIFY: readFileSync-Pfad → tickets-schema
docs/code-quality/gates.yaml                               ← MODIFY: s1.ignore um tickets-schema.ts erweitern
tests/spec/s2-cycles-g-cq07.bats                           ← NEU: BATS-Failing-Test (RED) für Zyklus #1
```

## S1-Budget-Tabelle

| Datei | Ist | Wirksame Schwelle | Budget |
|---|---|---|---|
| `website/src/lib/tickets-db.ts` | 1096 | 1096 (baselined, `8b581ebe`) | 0 |
| `website/src/lib/website-db.ts` | 4485 | unendlich (s1.ignore) | unendlich |
| `website/src/lib/tickets-schema.ts` (NEU) | 0 → ~1080 | 600 (statisches Limit) | 0 nach Anlegen |
| `docs/code-quality/gates.yaml` | 114 | 500 (stat. Limit) | 386 |
| `website/src/lib/factory-floor.test.ts` | 399 | 600 (stat. Limit) | 201 |
| `website/src/lib/factory-metrics.test.ts` | 79 | 600 (stat. Limit) | 521 |
| `website/src/lib/platform-db.ensure.test.ts` | 77 | 600 (stat. Limit) | 523 |
| `website/src/lib/questionnaire-db.ensure.test.ts` | 92 | 600 (stat. Limit) | 508 |
| `website/src/lib/tickets-db.providerrouting.test.ts` | 122 | 600 (stat. Limit) | 478 |
| `website/src/lib/website-db-init-hotpath.test.ts` | 161 | 600 (stat. Limit) | 439 |
| `website/src/lib/tickets-db.test.ts` | 28 | 600 (stat. Limit) | 572 |

Hinweis Budget 0: `tickets-db.ts` schrumpft (Task 2) und `tickets-schema.ts`
wird per `s1.ignore` von der Schwelle befreit (Task 5). Der Plan enthält
echte Shrink-/Extract-Schritte — das deckt die plan-lint B1b-Warnung ab.

---

## Task 0: Failing-Test schreiben (RED)

**Files:**
- Create: `tests/spec/s2-cycles-g-cq07.bats`

### Step 1: BATS-Datei anlegen

```bash
cat > /tmp/wt-decouple-tickets-db/tests/spec/s2-cycles-g-cq07.bats <<'BATS'
#!/usr/bin/env bats
# SSOT: openspec/changes/decouple-tickets-db/proposal.md
# G-CQ07: Zyklus #1 (lib/tickets-db.ts > lib/website-db.ts) ist RED bis
# die Extraktion in tasks-schema.ts gelandet ist.
#
# Wir nutzen bewusst einen dedizierten BATS-Spec statt einer bestehenden
# bats-Datei, weil der bestehende S2-Linter-Lauf ad-hoc erfolgt (kein
# verankertes bats-File) — siehe openspec/specs/code-quality.md.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
}

@test "G-CQ07 cycle #1: lib/tickets-db.ts > lib/website-db.ts ist entfernt" {
  output=$(npx --yes madge --circular --extensions ts,tsx "$REPO_ROOT/website/src" 2>&1 || true)
  if echo "$output" | grep -F "lib/tickets-db.ts > lib/website-db.ts" >/dev/null; then
    echo "madge-Output:"
    echo "$output"
    return 1
  fi
}

@test "G-CQ07: die übrigen drei Zyklen bleiben während dieses PRs unangetastet" {
  # Sanity-Check: wir dürfen mit diesem PR nur Zyklus #1 entfernen.
  # Die anderen drei Zyklen müssen weiterhin im Report auftauchen —
  # sonst wurden versehentlich Folge-PRs mit-erledigt.
  output=$(npx --yes madge --circular --extensions ts,tsx "$REPO_ROOT/website/src" 2>&1 || true)
  echo "$output" | grep -F "lib/website-db.ts > lib/tickets/transition.ts" >/dev/null
  echo "$output" | grep -F "lib/invoice-pdf.ts > lib/native-billing.ts" >/dev/null
}
BATS
```

### Step 2: Test laufen lassen — Expected fail

```bash
cd /tmp/wt-decouple-tickets-db
bats tests/spec/s2-cycles-g-cq07.bats
```

**Expected fail (RED):** Der erste Test schlägt fehl, weil `madge` den
Zyklus `lib/tickets-db.ts > lib/website-db.ts` aktuell noch meldet. Der
zweite Test passt (Sanity-Check) — er muss auch nach dem Refactor grün
bleiben.

---

## Task 1: Neues Modul `tickets-schema.ts` anlegen

**Files:**
- Create: `website/src/lib/tickets-schema.ts`

### Step 1: Body von `initTicketsSchema` und `isFeatureEnabled` 1:1 aus `tickets-db.ts` übernehmen

Quelle: `tickets-db.ts` Z. 1–8 (Imports, Re-Export), Z. 16 (`schemaReady`
-Flag), Z. 22–1080 (`initTicketsSchema`-Body), Z. 1082–1095
(`isFeatureEnabled`-Body). Der komplette SQL-DDL-Block (CREATE TABLE/INDEX/
TRIGGER/FUNCTION/SEQUENCE, ALTER TABLE, COMMENT, GRANT) wandert 1:1.

Die neue Datei beginnt mit:

```ts
// website/src/lib/tickets-schema.ts
// Schema-Initialisierung + Helper für das `tickets`-PostgreSQL-Schema.
// Ausgelagert aus tickets-db.ts (G-CQ07, Zyklus #1), um den statischen
// Import-Zyklus zwischen tickets-db.ts und website-db.ts aufzubrechen.
import { pool, ensureSchemaOnce } from './website-db';
import { MixedEmbeddingModelError } from './knowledge-db';
import { initProviderConfigSchema } from './schema/provider-config-schema';
import { ensureCockpitViews } from './tickets/cockpit-schema';

export { MixedEmbeddingModelError };

let schemaReady = false;

export async function initTicketsSchema(): Promise<void> {
  if (schemaReady) return;
  return ensureSchemaOnce('tickets', async () => {
    // … kompletter Body 1:1 aus tickets-db.ts Z. 24–1079 …
  });
}

export async function isFeatureEnabled(brand: string, key: string): Promise<boolean> {
  try {
    const { rows } = await pool.query(
      `SELECT enabled FROM tickets.feature_flags WHERE brand = $1 AND key = $2 LIMIT 1`,
      [brand, key],
    );
    return rows.length > 0 && rows[0].enabled === true;
  } catch {
    return false;
  }
}
```

**Wichtig:** Body unverändert übernehmen — keine SQL-Änderung, keine
Reformatierung, keine Logik-Anpassung. `schemaReady` bleibt Modul-lokal
(kein Export).

### Step 2: Sichtprüfung

```bash
cd /tmp/wt-decouple-tickets-db
wc -l website/src/lib/tickets-schema.ts
# Erwartung: ~1080 Zeilen
```

### Step 3: Kein Commit — weiter zu Task 2 (gemeinsamer Commit am Ende)

---

## Task 2: `tickets-db.ts` auf Fassaden-Reduktion zurückschneiden

**Files:**
- Modify: `website/src/lib/tickets-db.ts` (1096 → ~14 Zeilen)

### Step 1: Datei-Inhalt ersetzen

```bash
cd /tmp/wt-decouple-tickets-db
cat > website/src/lib/tickets-db.ts <<'TS'
// website/src/lib/tickets-db.ts
// Public-API-Fassade: re-exportiert die schema-relevanten Funktionen aus
// tickets-schema.ts, damit bestehende Aufrufer (tickets-embed.ts,
// tickets/admin.ts, systemtest/*, 7 .test.ts-Dateien) ihre Imports nicht
// anpassen müssen. Der frühere Body von initTicketsSchema/isFeatureEnabled
// lebt jetzt in tickets-schema.ts — siehe G-CQ07 (S2-Import-Zyklus #1).
import type { EmbeddingModel } from './embeddings';

export {
  initTicketsSchema,
  isFeatureEnabled,
  MixedEmbeddingModelError,
} from './tickets-schema';

/** The embedding model this environment writes/queries with. bge-m3 in prod
 *  (LLM_ENABLED=true), voyage-multilingual-2 in dev. Mirrors knowledge-db.ts. */
export function ticketEmbeddingModel(): EmbeddingModel {
  return process.env.LLM_ENABLED === 'true' ? 'bge-m3' : 'voyage-multilingual-2';
}
TS
```

### Step 2: Sichtprüfung

```bash
cd /tmp/wt-decouple-tickets-db
wc -l website/src/lib/tickets-db.ts
# Erwartung: < 20 Zeilen (deutlich unter dem Baseline-Wert 1096)
```

### Step 3: Kein Commit — weiter zu Task 3 (gemeinsamer Commit am Ende)

---

## Task 3: `website-db.ts` Import auf `tickets-schema` umverdrahten

**Files:**
- Modify: `website/src/lib/website-db.ts` (genau 1 Zeile)

### Step 1: Edit auf Z. 9

```bash
cd /tmp/wt-decouple-tickets-db
# Vorher (Z. 9):
#   import { initTicketsSchema } from './tickets-db';
# Nachher:
#   import { initTicketsSchema } from './tickets-schema';
sed -i "s|^import { initTicketsSchema } from './tickets-db';|import { initTicketsSchema } from './tickets-schema';|" \
  website/src/lib/website-db.ts
```

### Step 2: Verifizieren — nur Z. 9 geändert

```bash
cd /tmp/wt-decouple-tickets-db
git diff website/src/lib/website-db.ts
# Erwartung: 1-Zeilen-Diff auf Z. 9
```

### Step 3: Zyklus-Check (S2-Messung)

```bash
cd /tmp/wt-decouple-tickets-db
npx --yes madge --circular --extensions ts,tsx website/src 2>&1
# Erwartung: Zyklus #1 (lib/tickets-db.ts > lib/website-db.ts) ist weg.
# Zyklen #2, #3, #4 bleiben unverändert bestehen.
```

Falls der Zyklus #1 noch erscheint, ist die Extraktion aus Task 1/2
unvollständig — `initTicketsSchema` oder `isFeatureEnabled` ist noch mit
einem Top-Level-Import auf `website-db` in `tickets-db.ts` referenziert.
Zurück zu Task 1.

---

## Task 4: Sechs `vi.mock`-Pfade + zwei `readFileSync`-Quellen in den Tests nachziehen

**Files:**
- Modify: `website/src/lib/factory-floor.test.ts`
- Modify: `website/src/lib/factory-metrics.test.ts`
- Modify: `website/src/lib/platform-db.ensure.test.ts`
- Modify: `website/src/lib/questionnaire-db.ensure.test.ts`
- Modify: `website/src/lib/tickets-db.providerrouting.test.ts`
- Modify: `website/src/lib/website-db-init-hotpath.test.ts`
- Modify: `website/src/lib/tickets-db.test.ts`

### Step 1: `factory-floor.test.ts`

```bash
cd /tmp/wt-decouple-tickets-db
sed -i "s|vi.mock('./tickets-db'|vi.mock('./tickets-schema'|g" \
  website/src/lib/factory-floor.test.ts
```

### Step 2: `factory-metrics.test.ts`

```bash
cd /tmp/wt-decouple-tickets-db
sed -i "s|vi.mock('./tickets-db'|vi.mock('./tickets-schema'|g" \
  website/src/lib/factory-metrics.test.ts
```

### Step 3: `platform-db.ensure.test.ts`

```bash
cd /tmp/wt-decouple-tickets-db
sed -i "s|vi.mock('./tickets-db'|vi.mock('./tickets-schema'|g" \
  website/src/lib/platform-db.ensure.test.ts
```

### Step 4: `questionnaire-db.ensure.test.ts`

```bash
cd /tmp/wt-decouple-tickets-db
sed -i "s|vi.mock('./tickets-db'|vi.mock('./tickets-schema'|g" \
  website/src/lib/questionnaire-db.ensure.test.ts
```

### Step 5: `tickets-db.providerrouting.test.ts`

```bash
cd /tmp/wt-decouple-tickets-db
# 5a) vi.mock-Pfad
sed -i "s|vi.mock('./tickets-db'|vi.mock('./tickets-schema'|g" \
  website/src/lib/tickets-db.providerrouting.test.ts
# 5b) readFileSync-Quelle (Z. 119) — der pg_notify-Trigger lebt jetzt in
# tickets-schema.ts, nicht mehr in tickets-db.ts.
sed -i "s|new URL('./tickets-db.ts'|new URL('./tickets-schema.ts'|g" \
  website/src/lib/tickets-db.providerrouting.test.ts
```

### Step 6: `website-db-init-hotpath.test.ts`

```bash
cd /tmp/wt-decouple-tickets-db
sed -i "s|vi.mock('./tickets-db'|vi.mock('./tickets-schema'|g" \
  website/src/lib/website-db-init-hotpath.test.ts
```

### Step 7: `tickets-db.test.ts` — readFileSync-Pfad anpassen

```bash
cd /tmp/wt-decouple-tickets-db
sed -i "s|new URL('./tickets-db.ts'|new URL('./tickets-schema.ts'|g" \
  website/src/lib/tickets-db.test.ts
```

### Step 8: Verifizieren — alle Pfade migriert

```bash
cd /tmp/wt-decouple-tickets-db
# Es darf KEIN verbleibender vi.mock('./tickets-db'…) in den sieben Test-Files geben.
git diff website/src/lib/*.test.ts | grep -E "^\+.*vi.mock\('./tickets-db" || true
# Erwartung: keine Treffer (es wurden nur Hinzufügungen (-) von altem Pfad
# erwartet, da wir `sed -i` angewendet haben).
# Sicherheitscheck: kein altes readFileSync('./tickets-db.ts'…) mehr.
git grep -nE "new URL\('./tickets-db.ts'" website/src/lib/ || echo "OK: keine alten readFileSync-Pfade"
# Erwartung: "OK: keine alten readFileSync-Pfade".
```

### Step 9: Vitest-Smoke-Run (schnelle Validierung, kein vollständiger Lauf)

```bash
cd /tmp/wt-decouple-tickets-db
npm --prefix website run test:unit -- --run --reporter=basic \
  website/src/lib/factory-floor.test.ts \
  website/src/lib/factory-metrics.test.ts \
  website/src/lib/platform-db.ensure.test.ts \
  website/src/lib/questionnaire-db.ensure.test.ts \
  website/src/lib/tickets-db.providerrouting.test.ts \
  website/src/lib/website-db-init-hotpath.test.ts \
  website/src/lib/tickets-db.test.ts \
  website/src/lib/tickets-db.featureflag.test.ts \
  website/src/lib/tickets-embed.test.ts
```

**Erwartung:** alle 9 Tests grün. Falls ein Test rot wird, prüfen, ob
eine Mock- oder readFileSync-Referenz übersehen wurde.

---

## Task 5: `s1.ignore` um `tickets-schema.ts` erweitern

**Files:**
- Modify: `docs/code-quality/gates.yaml` (1 zusätzlicher Eintrag im
  `s1.ignore`-Block)

### Step 1: Edit in `gates.yaml`

```bash
cd /tmp/wt-decouple-tickets-db
python3 - <<'PY'
import pathlib
p = pathlib.Path('docs/code-quality/gates.yaml')
src = p.read_text()
old = "    - \"website/src/lib/website-db.ts\"\n"
new = (
    "    - \"website/src/lib/website-db.ts\"\n"
    "    # tickets-schema.ts akkumuliert das gesamte DDL + Helper für das\n"
    "    # `tickets`-PostgreSQL-Schema. Splitting-Grenze ist die Tabelle\n"
    "    # (Tabelle = Datei-Abschnitt), nicht die Datei — analog zu\n"
    "    # website-db.ts. Entstanden mit G-CQ07 (S2-Import-Zyklus #1).\n"
    "    - \"website/src/lib/tickets-schema.ts\"\n"
)
if old not in src:
    raise SystemExit("Anchor nicht gefunden — gates.yaml-Format geändert?")
p.write_text(src.replace(old, new, 1))
PY
```

### Step 2: Verifizieren

```bash
cd /tmp/wt-decouple-tickets-db
grep -nA1 "tickets-schema.ts" docs/code-quality/gates.yaml
# Erwartung: 5 Zeilen (Kommentarblock + Listen-Eintrag) im s1.ignore.
```

### Step 3: Quality-Check

```bash
cd /tmp/wt-decouple-tickets-db
task test:code-quality
# Erwartung: Exit 0. S1-Ratchet respektiert den neuen ignore-Eintrag.
```

Falls `test:code-quality` rot wird (z. B. weil `tickets-schema.ts` als
neue Datei > 600 Zeilen ist und der ignore-Eintrag falsch verankert ist):
YAML-Indentation prüfen (YAML-Spaces, keine Tabs).

---

## Task 6: Failing-Test re-runnen (GREEN) + Workspace-Validierung + Commit + PR

### Step 1: RED-Test auf GREEN bringen

```bash
cd /tmp/wt-decouple-tickets-db
bats tests/spec/s2-cycles-g-cq07.bats
# Erwartung: beide Tests grün. Zyklus #1 fehlt im madge-Report.
```

### Step 2: Vollständige Quality + Test Suite

```bash
cd /tmp/wt-decouple-tickets-db
task test:changed
# Erwartung: Exit 0 (S1–S4-Ratchet + Vitest-Smoke + BATS).
```

```bash
cd /tmp/wt-decouple-tickets-db
task freshness:regenerate
# Erwartung: Exit 0. Generiert frische repo-index.json + agent-guide.map
# + test-inventory.json mit dem neuen Modul tickets-schema.ts.
```

```bash
cd /tmp/wt-decouple-tickets-db
task freshness:check
# Erwartung: Exit 0 (CI-Äquivalent: freshness + quality:check + baseline).
```

```bash
cd /tmp/wt-decouple-tickets-db
bash scripts/openspec.sh validate
# Erwartung: Exit 0.
```

### Step 3: Workspace-Validierung (Manifeste unverändert, aber als Sanity)

```bash
cd /tmp/wt-decouple-tickets-db
task workspace:validate
# Erwartung: Exit 0.
```

### Step 4: Finaler Diff-Überblick

```bash
cd /tmp/wt-decouple-tickets-db
git status
# Erwartung: nur die in der File-Structure oben gelisteten Dateien sind modifiziert.
git diff --stat
# Erwartung: 11 Dateien insgesamt (3 Refactor + 1 gates.yaml + 7 Tests).
```

### Step 5: Commit

```bash
cd /tmp/wt-decouple-tickets-db
git add website/src/lib/tickets-schema.ts \
        website/src/lib/tickets-db.ts \
        website/src/lib/website-db.ts \
        website/src/lib/factory-floor.test.ts \
        website/src/lib/factory-metrics.test.ts \
        website/src/lib/platform-db.ensure.test.ts \
        website/src/lib/questionnaire-db.ensure.test.ts \
        website/src/lib/tickets-db.providerrouting.test.ts \
        website/src/lib/website-db-init-hotpath.test.ts \
        website/src/lib/tickets-db.test.ts \
        docs/code-quality/gates.yaml
git commit -m "refactor(website): decouple tickets-db from website-db (G-CQ07 cycle #1) [T001172]"
```

### Step 6: Push + PR

```bash
cd /tmp/wt-decouple-tickets-db
git push -u origin feature/decouple-tickets-db
# PR-Anlage via gh-axi (Standard-Flow):
gh-axi pr create \
  --title "refactor(website): decouple tickets-db from website-db (G-CQ07 cycle #1) [T001172]" \
  --body "Closes T001172. G-CQ07 cycle #1 (lib/tickets-db.ts ↔ lib/website-db.ts) extracted to lib/tickets-schema.ts. Public API of tickets-db.ts preserved; remaining 3 S2 cycles stay for follow-up PRs. See openspec/changes/decouple-tickets-db/{proposal.md,tasks.md} and docs/superpowers/specs/2026-06-27-decouple-tickets-db-design.md." \
  --base main
```

**Expected CI:** alle quality + test Gates grün. Der BATS-Test
`tests/spec/s2-cycles-g-cq07.bats` läuft im BATS-Suite-Pfad mit (siehe
`tests/spec/`).
