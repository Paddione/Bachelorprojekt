---
title: "partial-dependency-scheduling — Implementation Plan"
ticket_id: T002082
domains: [factory, ci]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# partial-dependency-scheduling — Implementation Plan

_Ticket: T002082 · Delta-Spec: `openspec/changes/partial-dependency-scheduling/specs/software-factory.md` · Follow-up zu T002074_

Dependency-basiertes Partial-Scheduling statt Voll-Gang-Zwang: Ein Multi-Partial-Ticket startet,
sobald 1 Slot frei ist und mindestens ein Partial ohne offene Abhängigkeiten existiert; das
Partial-Manifest bekommt eine optionale `depends_on`-Spalte; der `--partials`-Cap steigt von 3
auf 9.

## File Structure

```
scripts/factory/partial-order.cjs        (neu — depends_on-Topo-Sort, ready-Filter, done-Skip)
scripts/factory/partial-order.test.mjs   (neu — node:test Unit-Tests)
scripts/factory/pipeline-partials.cjs    (mod — 5. Manifest-Spalte depends_on parsen)
scripts/factory/pipeline-runner.js       (mod — read-partials: done-ids lesen, topologisch ordnen/filtern)
scripts/factory/schedule.sh              (mod — Teilclaim min(needed, free) ≥ 1 statt all-or-nothing)
scripts/factory/slots.sh                 (mod — claim-gang mit tatsächlich geclaimtem k ≤ n)
scripts/plan-lint.sh                     (mod — depends_on-Validierung: unbekannte IDs, Zyklen)
scripts/vda/ticket/stage-plan.sh         (mod — --partials-Cap 1..9)
.claude/skills/dev-flow-plan/SKILL.md    (mod — Decompose-Faustregel + depends_on-Doku)
tests/spec/software-factory.bats         (mod — neue @test-Blöcke, RED zuerst)
```

## S1-Budgets

| Datei | Ist | Budget |
|---|---|---|
| `scripts/factory/pipeline-partials.cjs` | 167 | 33 |
| `scripts/factory/pipeline-runner.js` | 349 | 251 |
| `scripts/factory/schedule.sh` | 87 | 413 |
| `scripts/factory/slots.sh` | 51 | 449 |
| `scripts/plan-lint.sh` | 287 | 213 |
| `scripts/vda/ticket/stage-plan.sh` | 53 | 447 |

`scripts/factory/pipeline.js` (594/600, Budget 6) wird **bewusst nicht angefasst**: die gesamte
neue Ordnungs-/Skip-Logik lebt im neuen Modul `partial-order.cjs` und wird über den bestehenden
`read-partials`-Runner-Befehl in `pipeline-runner.js` angewendet — `pipeline.js` konsumiert
weiterhin unverändert `partials.sub_features` in Schleifenreihenfolge (Z.309-333). Das neue
`.cjs`-Modul bleibt unter dem 200-Zeilen-Extension-Limit; `pipeline-partials.cjs` (Budget 33)
erhält nur das Spalten-Parsing (~4 Zeilen) — die Topo-Logik wird dorthin NICHT gelegt, sondern
in das neue Modul extrahiert (Split-Strategie wegen knappem Budget).

## Task 1: RED — Failing-Tests für Manifest-`depends_on`, Linter und Cap

Neue `@test`-Blöcke ans Ende von `tests/spec/software-factory.bats` (Konventionen des Files
übernehmen: `load`-Header, Fixture-Verzeichnis-Muster der bestehenden T002074-Tests — die
vorhandenen plan-lint-Partial-Tests dort dienen als Vorlage; Fixtures werden im Test per
Heredoc in `$BATS_TEST_TMPDIR` erzeugt, keine committeten Fixture-Dateien):

- [ ] `plan-lint akzeptiert 5-Spalten-Manifest mit gültigem depends_on`: Fixture-Change mit
      `tasks.d/` und Manifest-Zeilen `| p1 | tasks.d/p1-a.md | impl | a.sh | |` und
      `| p2 | tasks.d/p2-b.md | tests | b.bats | p1 |` → `run bash scripts/plan-lint.sh <fixture>` → Status 0.
- [ ] `plan-lint Hard-Fail bei depends_on-Zyklus`: p1→p2, p2→p1 → Status 1, Output enthält `D2`.
- [ ] `plan-lint Hard-Fail bei unbekannter depends_on-ID`: p2 hängt von `p9` ab → Status 1,
      Output enthält `D2`.
- [ ] `stage-plan --partials 5 akzeptiert, 0 und 10 abgelehnt`: `--partials 5` → kein
      `ERROR: --partials`-Text; `--partials 0` und `--partials 10` → Exit 2 (DB-Aufruf wird
      nicht erreicht — Validierung schlägt vorher zu; Test ruft das Skript mit einer nicht
      erreichbaren `FACTORY_CTX`-Umgebung auf, sodass nur der Validierungspfad getestet wird).
- [ ] `partial-order.cjs Topo-Sort/ready/done-Skip`: `node --test scripts/factory/partial-order.test.mjs` (Datei entsteht in Task 2).
- [ ] **Failing-Test-Step:** Runner ausführen —

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats
node --test scripts/factory/partial-order.test.mjs
```

      → expected: FAIL (RED — `partial-order.cjs` existiert noch nicht, plan-lint kennt
      `depends_on` noch nicht, stage-plan cappt noch auf 3).

## Task 2: Neues Modul `scripts/factory/partial-order.cjs` + Unit-Tests

- [ ] Modul mit drei Exports (CommonJS, Muster `pipeline-partials.cjs`; Ziel < 150 Zeilen,
      Extension-Limit .cjs = 200):

```js
// topoSort(manifest) -> [ids in Abhängigkeitsreihenfolge]
// wirft Error('D2: unknown depends_on id: <id>') bzw. Error('D2: dependency cycle: <a> -> <b> -> <a>')
function topoSort(manifest) { /* Kahn-Algorithmus über {id, depends_on:[]} */ }

// readyPartials(manifest, doneIds) -> Teilmenge ohne offene Abhängigkeiten, topologisch geordnet
function readyPartials(manifest, doneIds) { /* filter: alle depends_on in doneIds */ }

// orderAndFilter(manifest, doneIds) -> topologisch geordnete, noch nicht erledigte Partials
function orderAndFilter(manifest, doneIds) { /* topoSort minus doneIds */ }

module.exports = { topoSort, readyPartials, orderAndFilter }
```

- [ ] `scripts/factory/partial-order.test.mjs` (node:test, Muster `deploy-transition.test.mjs`):
      Topo-Ordnung (p3 vor p1 wenn p1 von p3 abhängt), Zyklus wirft, unbekannte ID wirft,
      `orderAndFilter` überspringt `doneIds`, leeres/undefined `depends_on` = keine Kante.
- [ ] Verify: `node --check scripts/factory/partial-order.cjs && node --test scripts/factory/partial-order.test.mjs` → grün.

## Task 3: `pipeline-partials.cjs` — 5. Spalte parsen (Budget 33!)

- [ ] In `parsePartialsManifest` (Z.20-39) die optionale 5. Zelle aufnehmen — minimaler Diff:

```js
rows.push({ id: cells[0], file: cells[1].replace(/`/g, ''), role: cells[2], target_files,
  depends_on: (cells[4] || '').split(',').map((s) => s.trim()).filter(Boolean) })
```

- [ ] `readPartials` (Z.45-66) reicht `depends_on` unverändert in die `sub_features` durch
      (`depends_on: m.depends_on`) — 4-Spalten-Manifeste ergeben `[]` (rückwärtskompatibel).
- [ ] Verify: `node --check scripts/factory/pipeline-partials.cjs`; Netto-Delta ≤ +4 Zeilen
      (Budget 33 eingehalten — `wc -l` vorher/nachher notieren).

## Task 4: `pipeline-runner.js` — `read-partials` ordnet und filtert

- [ ] Im `read-partials`-Zweig (Z.304-320) nach `P.readPartials(dir)`: erledigte Partial-IDs
      host-seitig aus `tickets.factory_phase_events` lesen (gleiches `factory_psql`-
      `execFileSync`-Muster wie der `pr-gate`-Zweig Z.330-338; `detail` ist das JSON aus
      `phaseEvent('implement','partial-done', JSON.stringify({partial, files, tests}))` —
      `tests:'pass'`-Events zählen als erledigt), dann:

```js
const { orderAndFilter } = await import('./partial-order.cjs');
res.sub_features = orderAndFilter(res.sub_features, doneIds);
```

- [ ] Wirft `orderAndFilter` (D2-Fehler aus dem Modul), greift der bestehende catch-Zweig
      (Z.318-320) und liefert `{ partials:false, error }` — die Pipeline fällt auf den
      LLM-Decompose-Pfad zurück statt zu crashen.
- [ ] `pipeline.js` bleibt unangetastet (Budget 6) — es konsumiert `sub_features` bereits in
      Array-Reihenfolge; die Topologie steckt jetzt in dieser Reihenfolge.
- [ ] Verify: `node --check scripts/factory/pipeline-runner.js`; manueller Smoke:
      `node scripts/factory/pipeline-runner.js read-partials '{"slug":"local-llm-proxy", ...}'`
      gegen den T002081-Change (4-Spalten-Manifest) liefert weiterhin 3 sub_features in
      Manifest-Reihenfolge.

## Task 5: `plan-lint.sh` — D2-Validierung für `depends_on`

- [ ] Im Partial-Modus (Z.103-151), nach dem D1-Check: aus jeder Manifest-Zeile die optionale
      5. Zelle extrahieren (gleiches awk/cut-Muster wie die bestehende Zellen-Zerlegung).
      Prüfungen, beide als `hard "D2: …"`:
      1. jede referenzierte ID existiert in der ID-Spalte des Manifests,
      2. der Abhängigkeitsgraph ist azyklisch (iteratives Kahn-Verfahren in bash: wiederholt
         Knoten ohne offene Kanten entfernen; bleiben Knoten übrig → Zyklus benennen).
- [ ] 4-Spalten-Zeilen (keine 5. Zelle) bleiben gültig — kein neuer Pflichtteil.
- [ ] Verify: die drei plan-lint-Tests aus Task 1 werden grün:
      `tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats`.

## Task 6: `slots.sh` — Teilclaim `claim-gang <ext_id> <n> [min_n]`

- [ ] `claim-gang` (Z.34-42) um optionalen dritten Parameter `min_n` (Default: `n`) erweitern —
      bestehende Aufrufer bleiben unverändert all-or-nothing. Mit `min_n < n` claimt das
      UPDATE `k = LEAST(n, SLOTS_PER_BRAND - SUM(slot_count laufender Tickets))`, sofern
      `k >= min_n`, und setzt `slot_count = k` (Semantik: slot_count = tatsächlich geclaimte
      Kapazität; der Gesamtbedarf steht weiterhin im Manifest und wird nicht in der DB
      benötigt). SQL bleibt ein einzelnes atomares UPDATE (Muster des bestehenden Statements,
      `LEAST()`/`GREATEST()` statt zweitem Roundtrip).
- [ ] `release` (Z.43-49) bleibt unverändert (`slot_count=1`-Reset deckt den Teilclaim ab).
- [ ] Verify: `bash -n scripts/factory/slots.sh`.

## Task 7: `schedule.sh` — Start ab 1 freiem Slot

- [ ] Z.74-85 umbauen: `free`-Berechnung bleibt; statt `needed > free → break` gilt

```bash
# Kein Voll-Gang-Zwang (T002082): claim min(needed, free) >= 1.
if [[ "$free" -lt 1 || $(( global_used + 1 )) -gt "$GLOBAL_CAP" ]]; then
  break   # Head-of-line nur noch bei erschöpfter Kapazität
fi
want=$(( needed < free ? needed : free ))
(( global_used + want > GLOBAL_CAP )) && want=$(( GLOBAL_CAP - global_used ))
if BRAND="$BRAND" FACTORY_CTX="$FACTORY_CTX" bash "$HERE/slots.sh" claim-gang "$ext_id" "$want" 1 >/dev/null 2>&1; then
  plan=$(echo "$plan" | jq -c --arg b "$BRAND" --arg e "$ext_id" --argjson s "$want" '. + [{brand:$b, external_id:$e, slot:$s}]')
  global_used=$((global_used + want))
fi
```

- [ ] Kommentar Z.76-78 („head-of-line blocking") entsprechend anpassen — die Aussage „passt
      der vorderste Gang-Kandidat nicht, werden KEINE nachrangigen Tickets vorgezogen" gilt
      nur noch für `free == 0`.
- [ ] Verify: `bash -n scripts/factory/schedule.sh`.

## Task 8: `stage-plan.sh` — Cap 1..9

- [ ] Z.18: `case "$partials" in 1|2|3)` → `case "$partials" in [1-9])` und Fehlertext
      `--partials must be 1..9`.
- [ ] Verify: der stage-plan-Test aus Task 1 wird grün.

## Task 9: `dev-flow-plan/SKILL.md` — Faustregel + `depends_on`-Doku

- [ ] Abschnitt „Schritt 3.7 (a) Decompose": „1–3 disjunkte Partialpläne" ersetzen durch die
      Faustregel „1 Partial je disjunktem Subsystem, Tests immer separat; mehr als 3 nur bei
      echt disjunkten Dateimengen; Obergrenze 9 (`--partials`-Cap)". Die Manifest-Tabellen-Doku
      um die optionale 5. Spalte erweitern:
      `| id | tasks.d/pX-*.md | impl|tests | <target_files> | <depends_on, optional> |`.
- [ ] Abschnitt „Schritt 4.5 Partial-Anzahl mitgeben": `1..3; Default 1` → `1..9; Default 1`;
      Hinweis ergänzen, dass Partials ohne `depends_on` sofort startbar sind (kein
      Voll-Gang-Zwang — Scheduling claimt `min(bereite Partials, freie Slots) ≥ 1`).
- [ ] Verify: `grep -c "1–3" .claude/skills/dev-flow-plan/SKILL.md` → 0 Treffer im
      Decompose-Kontext (manuell gegenlesen).

## Task 10: Finale Verifikation

- [ ] Alle Tests aus Task 1 laufen GREEN:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats
node --test scripts/factory/partial-order.test.mjs
```

- [ ] Test-Inventar regenerieren und committen:

```bash
task test:inventory
git add website/src/data/test-inventory.json
```

- [ ] OpenSpec-Gate: `task test:openspec` (bzw. `bash scripts/openspec.sh validate`) grün.
- [ ] CI-Äquivalenz (inkl. S1-Ratchet — insbesondere `pipeline-partials.cjs` ≤ 200 und
      unverändertes `pipeline.js`):

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
