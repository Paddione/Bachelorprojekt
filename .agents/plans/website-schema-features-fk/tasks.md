---
title: "website-schema-features-fk — Implementation Plan"
ticket_id: T901103
domains: [database, infra, test]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# website-schema-features-fk — Implementation Plan

`ensure-bachelorprojekt-schema.sh` legt `bachelorprojekt.software_events` mit einem Foreign Key auf
`bachelorprojekt.features(pr_number)` an. `pr_number` ist weder UNIQUE noch PK, Postgres lehnt den FK
ab (`there is no unique constraint matching given keys for referenced table "features"`), und das
Skript bricht ab. Seit dem 2026-05-18 (#827) fehlen deshalb auf Prod und Staging `software_events`
samt Indizes, `v_software_stack`, `v_software_history` und `bachelorprojekt.components` (genutzt von
`components/website/src/lib/components-db.ts`). Versteckt war das durch `|| true` im shared-db-Hook,
sichtbar seit T900806.

_Ticket: T901103_

## Befund (Symptom vs. Ursache)

- Symptom: `shared-db postStart: ensure-bachelorprojekt-schema.sh failed (exit 3) [T900806]` im Pod-Log von `workspace-staging`.
- Ursache, per Rollback-Probe auf Prod und Staging belegt (Befehl im Ticket T901103): der FK in `k3d/website-schema.yaml` Zeile 1707.
- `bachelorprojekt.features` ist auf beiden Umgebungen leer (0 Zeilen, keine doppelten `pr_number`), ein UNIQUE-Constraint kollidiert mit keinen Daten.

## Entscheidung

Idempotenter `DO $$`-Block vor `CREATE TABLE … software_events`, nach dem Muster von
`collections_brand_fkey` in derselben Datei: `features_pr_number_key UNIQUE (pr_number)` anlegen, falls
er fehlt. Eine Feature-Zeile pro PR ist die Annahme, die der FK schon trifft, mehrere `NULL` bleiben
erlaubt. Verworfen: FK streichen (verliert `ON DELETE CASCADE`), FK auf `features(id)` umstellen
(Klassifizierer schreiben PR-Nummern).

## File Structure

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `k3d/website-schema.yaml` | 1916 | n/a (S1-ungated) |
| `tests/spec/website-schema/fk-targets-unique.bats` | 0 (neu) | n/a (S1-ungated) |

`.yaml` und `.bats` haben kein S1-Limit (`yq '.s1.limits' docs/code-quality/gates.yaml`), keine Datei
ist gebaselined. Keine neuen Manifeste oder Skripte, kein S4-Risiko.

<!-- vitest: kein neuer Test nötig, weil keine Datei unter components/website/src geändert wird -->

## Task 1: Roter Test

Der Test ist mit dem Plan committet:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/website-schema/fk-targets-unique.bats
# expected: FAIL — "features(pr_number) wird referenziert, hat aber keinen UNIQUE-Constraint"
```

## Task 2: UNIQUE-Constraint vor software_events

In `k3d/website-schema.yaml`, Schlüssel `ensure-bachelorprojekt-schema.sh`, direkt vor der Zeile
`      CREATE TABLE IF NOT EXISTS bachelorprojekt.software_events (` einfügen (6 Leerzeichen Einrückung
wie die Umgebung):

```sql
      -- software_events.pr_number referenziert features(pr_number); ohne UNIQUE lehnt
      -- Postgres den FK ab und das Skript bricht hier ab [T901103].
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'features_pr_number_key') THEN
          ALTER TABLE bachelorprojekt.features ADD CONSTRAINT features_pr_number_key UNIQUE (pr_number);
        END IF;
      END $$;

```

`DO $$` bleibt einfach geschrieben wie beim bestehenden `collections_brand_fkey`-Block: die ConfigMap
kommt unverändert im Cluster an (geprüft: der Live-Block in `workspace-staging` enthält `DO $$`).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/website-schema/fk-targets-unique.bats   # ok
```

## Task 3: Rollback-Probe vor dem Merge

Das geänderte Ensure-SQL in einer Transaktion mit `ROLLBACK` gegen Staging laufen lassen. Erwartet:
kein `ERROR`, und innerhalb der Transaktion existieren `software_events` und `components`.

```bash
S=$(mktemp)
awk '$0=="  ensure-bachelorprojekt-schema.sh: |"{f=1;next} f&&/^  [A-Za-z0-9_.-]+: [|]/{exit} f' k3d/website-schema.yaml \
  | awk '/<<-.EOSQL./{f=1;next} /^ *EOSQL/{f=0} f' > "$S"
P=$(kubectl --context fleet -n workspace-staging get pods -l app=shared-db -o name | head -1)
{ echo 'BEGIN;'; cat "$S"; echo "RESET ROLE; SELECT to_regclass('bachelorprojekt.software_events') IS NOT NULL, to_regclass('bachelorprojekt.components') IS NOT NULL;"; echo 'ROLLBACK;'; } \
  | kubectl --context fleet -n workspace-staging exec -i "$P" -c postgres -- psql -U postgres -d website -v ON_ERROR_STOP=1 -qAt
# erwartet: t|t, kein ERROR
```

## Task 4: Live nach dem Merge

Nachdem Flux die ConfigMap ausgerollt hat (`kubectl --context fleet -n workspace-staging get configmap website-schema -o json | jq -r '.data["ensure-bachelorprojekt-schema.sh"]' | grep -c features_pr_number_key` → 1), das Ensure-Skript zuerst auf Staging, dann auf Prod ausführen:

```bash
for ns in workspace-staging workspace; do
  P=$(kubectl --context fleet -n $ns get pods -l app=shared-db -o name | head -1)
  kubectl --context fleet -n $ns exec "$P" -c postgres -- bash /scripts/ensure-bachelorprojekt-schema.sh
  kubectl --context fleet -n $ns exec "$P" -c postgres -- psql -U postgres -d website -Atc \
    "select to_regclass('bachelorprojekt.software_events') is not null, to_regclass('bachelorprojekt.v_software_stack') is not null, to_regclass('bachelorprojekt.v_software_history') is not null, to_regclass('bachelorprojekt.components') is not null"
  # erwartet: t|t|t|t
done
```

Erst Prod ausführen, wenn Staging `t|t|t|t` liefert.

## Task 5: Verifikation

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/website-schema/fk-targets-unique.bats
task workspace:validate
task test:changed
task freshness:regenerate
task freshness:check
```
