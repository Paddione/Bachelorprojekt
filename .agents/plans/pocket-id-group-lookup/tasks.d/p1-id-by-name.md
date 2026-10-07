---
id: P1
role: impl
ticket: T900804
depends_on: []
target_files:
  - k3d/pocket-id-client-seed.yaml
---

# P1 — Lookup per Objekt statt per benachbarten Feldern

## Ziel

`find_client_id` und `find_group_id` finden die ID eines Eintrags anhand seines Namens, egal in welcher Reihenfolge Pocket ID die Felder liefert. Kein Verhaltenswechsel sonst: kein 409-Schlucken, keine Aenderung an Upsert, Secret-Handling oder Pagination.

## Betroffene Datei

- `k3d/pocket-id-client-seed.yaml` — nur das `seed`-Container-Skript

## Concrete-Steps

1. RED bestaetigen: `tests/unit/lib/bats-core/bin/bats tests/spec/pocket-id-client-seed-group-lookup.bats` → expected: FAIL (Test 1 und 2 `not ok`, Test 3 `ok`).
2. Direkt vor `find_client_id() {` den Helper einfuegen (Einrueckung 14 Leerzeichen wie die Nachbarfunktionen, `$$` ist das Flux-Escape fuer `$`):

   ```sh
   # T900804: Lookup ueber das JSON-Objekt, nicht ueber benachbarte Felder.
   # Pocket ID v2.14.0 liefert user-groups als id,friendlyName,name -- die
   # alte Annahme "name folgt direkt auf id" fand die Gruppe nie (409 beim
   # Neuanlegen). Split an '{' trennt Objekte; id und name stehen in jedem
   # Eintrag vor dem ersten verschachtelten Objekt (credentials, customClaims).
   id_by_name() {
     printf '%s' "$1" | tr '{' '\n' | grep "\"name\":\"$${2}\"" | head -1 | sed -nE 's/.*"id":"([^"]*)".*/\1/p'
   }
   ```

3. In `find_client_id` die Zeile `id=$(echo "$list" | grep -o "\"id\":…\"$${name}\"" | head -1 | sed …)` ersetzen durch `id=$(id_by_name "$list" "$name")`.
4. In `find_group_id` die Zeile `echo "$glist" | grep -o "\"id\":…\"$${gname}\"" | head -1 | sed …` ersetzen durch `id_by_name "$glist" "$gname"`.
5. Die Kommentarzeilen ueber `find_client_id` („matched with a plain grep/sed pair“) und ueber `ensure_group` („Same grep/sed-over-JSON approach as find_client_id“) auf den Helper verweisen lassen.
6. GREEN: `tests/unit/lib/bats-core/bin/bats tests/spec/pocket-id-client-seed-group-lookup.bats` → 3/3 ok.
7. Regression: `tests/unit/lib/bats-core/bin/bats -r tests/spec/pocket-id-client-seed*` → alle ok (Pagination-Spec erwartet weiter `pagination%5Bpage%5D` und `totalPages` in `find_client_id`).
8. `task workspace:validate` → exit 0.

## Gate

- `tests/unit/lib/bats-core/bin/bats tests/spec/pocket-id-client-seed-group-lookup.bats` → 3/3 ok
- `tests/unit/lib/bats-core/bin/bats -r tests/spec/pocket-id-client-seed*` → exit 0

## Ausserhalb des Scopes (bewusst)

`secret=$(eval "printf '%s' \"\$$env\"")` wird durch Flux zu `\$env` und liefert den Variablennamen statt des Werts; der Zweig „skip (no secret configured)“ greift deshalb nie. Nicht Teil dieses Fixes — eigenes Ticket.
