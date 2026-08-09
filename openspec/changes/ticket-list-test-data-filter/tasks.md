---
title: "ticket-list-test-data-filter — Implementation Plan"
ticket_id: T002781
domains: [factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# ticket-list-test-data-filter — Implementation Plan

## File Structure

| Datei | Art | Zeilen jetzt | Wirksame Schwelle | Restbudget | Anmerkung |
|---|---|---|---|---|---|
| `tests/spec/ticket-system/list-test-data-filter.bats` | vorhanden (RED) | 95 | — | — | `.bats` ungated; liegt bereits im Branch |
| `scripts/vda/ticket/list.sh` | ändern | 62 | 800 | 738 | Zuwachs ~6 Zeilen |
| `tests/lib/factory-test-fixtures.sh` | ändern | 64 | 800 | 736 | Zuwachs ~6 Zeilen |
| `scripts/ticket-mcp/go/internal/tools/list.go` | ändern | 192 | — | — | `.go` ungated und unbaselined → S1 nicht anwendbar |

Alle Budgets sind weit; kein Verkleinerungsschritt nötig. Das leere Feld bei der `.go`-Datei
bedeutet „nicht anwendbar", nicht „ungemessen durchgefallen": die Schwelle ist 0 ohne
Baseline-Eintrag. Positiv-Kontrolle desselben Aufrufs an einem gemessenen Shell-Skript
liefert einen Zahlenwert, der Messpfad funktioniert also.

## Partials

| # | Rolle | Zieldateien |
|---|---|---|
| 1 | Gesamt (Fix, ein Vorgang) | alle oben gelisteten |

## Tasks

### 1. RED bestätigen — der failing Test liegt bereits vor

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ticket-system/list-test-data-filter.bats
```

expected: FAIL — und zwar an zwei unterschiedlichen Stellen, das ist der Punkt:

- Test 1 („Positiv-Anker") scheitert an `[ "$status" -eq 0 ]`, weil `--include-test-data`
  noch unbekannt ist und `list.sh` mit `Unknown list option` und Exit 2 abbricht. Der Seed
  davor ist durchgelaufen — `[ -n "$seeded" ]` hat gehalten.
- Test 2 scheitert an der **inhaltlichen** Aussage: der Aufruf liefert Exit 0 und gültiges
  JSON, und die gesäte Testdaten-Zeile steht darin. Das ist der Defekt selbst, nicht bloß
  ein fehlendes Flag.

Sieht man einen anderen Fehlschlagpunkt — insbesondere ein Scheitern schon am Seed —, stimmt
die Annahme nicht mehr. Häufigste Ursache: `TICKET_TEST_DB_OK=1` fehlt, dann zeigt
`_ticket-core.sh` unter BATS auf den Sentinel-Kontext `bats-no-cluster-t002224`.

### 2. Filter und Opt-out in `scripts/vda/ticket/list.sh`

- Neue lokale Variable `include_test_data=false` neben den bestehenden Defaults in `main()`.
- Neuer Zweig im `case`-Block: `--include-test-data) include_test_data=true; shift ;;` —
  ohne Argument, wie `--missing-id` daneben.
- WHERE-Aufbau: unmittelbar nach `local where="brand = :'brand'"` ergänzen
  `[[ "$include_test_data" == "true" ]] || where+=" AND is_test_data = false"`.
  Dadurch greift der Filter für **jede** Filterkombination, nicht nur für den Aufruf ohne
  Statusfilter.
- Kein `COALESCE`: die Spalte ist `boolean NOT NULL DEFAULT false` und trägt in 2112 Zeilen
  keinen einzigen NULL-Wert (gemessen am 2026-08-09). Wer das später ändert, muss den Filter
  mit ändern — deshalb gehört diese Begründung als Kommentar an die Stelle.
- `_exec_sql` braucht keinen neuen `-v`-Parameter: der Filter ist ein statisches Prädikat
  ohne Nutzereingabe.

### 3. Flag im ticket-mcp-Wrapper durchreichen

In `scripts/ticket-mcp/go/internal/tools/list.go`:

- Neue Tool-Property `include_test_data` (Boolean) neben `status`, `type` und
  `attention_mode`, mit einer Beschreibung, die den Default benennt: Testdaten sind
  standardmäßig ausgeblendet.
- Ist sie gesetzt, wird `--include-test-data` an die `ticket.sh list`-Argumentliste
  angehängt. Ist sie nicht gesetzt oder `false`, wird **nichts** angehängt — der Default
  entsteht im Shell-Skript, nicht im Wrapper. Zwei Stellen mit derselben Default-Regel wären
  genau die Doppelung, die in T002783 gerade auseinandergelaufen ist.

### 4. Namespace-Auflösung in `tests/lib/factory-test-fixtures.sh` korrigieren

`purge_factory_test_data` bildet `k3d-*`- und `*-dev`-Kontexte auf `workspace-dev` bzw.
`workspace-korczewski-dev` ab. Im k3d-Dev-Cluster existiert dieser Namespace nicht; der Pod
liegt in `workspace`. Belegt durch Ausführen:

```bash
kubectl --context k3d-mentolder-dev get ns -o name          # kein workspace-dev
kubectl get pod -n workspace --context k3d-mentolder-dev \
  -l 'app in (shared-db,shared-db-dev)' -o name             # shared-db-… vorhanden
```

- Die `-dev`-Anhängung darf den Namespace nur dann umschreiben, wenn es ihn gibt. Die
  robuste Form ist, den Pod in den in Frage kommenden Namespaces zu suchen und den ersten
  Treffer zu nehmen, statt die Zuordnung aus dem Kontextnamen zu raten. `seed_test_feature`
  im selben Modul geht bereits über `scripts/ticket.sh` und dessen eigene Auflösung — die
  Fehlerquelle ist allein diese zweite, hartkodierte Abbildung.
- Der Fehlerpfad bleibt `return 1`, aber die Meldung muss Namespace **und** Kontext nennen,
  damit ein `|| true` beim Aufrufer nicht wieder unbemerkt bleibt.
- Aufrufer, die `purge_factory_test_data … || true` schreiben, sind davon unberührt; dieser
  Plan ändert sie nicht. Der Test dieses Changes ruft ohne `|| true` auf und belegt damit,
  dass der Purge wirkt.

### 5. Liegengebliebene Testdaten abräumen

Nach Task 4 einmalig ausführen und das Ergebnis prüfen:

```bash
BRAND=mentolder bash -c 'source tests/lib/factory-test-fixtures.sh; purge_factory_test_data mentolder'
```

Danach darf keine Zeile mit `is_test_data = true` mehr offen sein. Betroffen sind T002761
(triage), T002762 (backlog) und die Fixture-Zeilen der Testläufe dieses Changes. Das ist
kein Datenverlust: es sind ausschließlich vom Fixture-Modul erzeugte SF-TEST-Zeilen.

### 6. Verifikation

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/ticket-system*
cd scripts/ticket-mcp/go && go build ./... && cd -
task test:spec:changed
task test:changed
task freshness:regenerate
task freshness:check
```

Der erste Befehl erfasst bewusst **beide** Formen der BATS-Konvention (Sammeldatei und
Verzeichnis, T002696). Erwartung: die zwei Tests aus Task 1 sind grün.

Zusätzlich der Nachweis, dass der teardown wirklich abräumt — er ist der Grund, warum Task 4
in diesem Change liegt:

```bash
BRAND=mentolder bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql' <<'SQL'
SELECT count(*) FROM tickets.tickets WHERE is_test_data = true;
SQL
```

Erwartung: 0 nach einem vollständigen Testlauf. Ein Wert > 0 bedeutet, dass der Purge
weiterhin ins Leere greift — dann ist Task 4 nicht erledigt, unabhängig davon, ob die
BATS-Tests grün sind.
