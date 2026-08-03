---
title: "factory-orphan-slot-reap — Implementation Plan"
ticket_id: T002610
domains: [bachelorprojekt-test, bachelorprojekt-ops]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# factory-orphan-slot-reap — Implementation Plan

Behebt T002610 (verwaister `pipeline_slot` blockiert den Claim still) und T002618
(`watchdog.sh` bricht bei jedem stale Ticket ab). Entwurf und Begründung:
[`design.md`](design.md), [`proposal.md`](proposal.md).

_Ticket: T002610 · mitbehoben: T002618_

## File Structure

| Datei | Ist-Zeilen | S1-Budget | Art |
|---|---|---|---|
| `scripts/factory/watchdog.sh` | 199 → 239 | 601 | geändert (Waisen-Sweep + `local`-Korrektur) |
| `scripts/factory/schedule.sh` | 111 → 128 | 689 | geändert (Claim-Fehlschlag melden) |
| `tests/spec/software-factory/orphan-slot-reap.bats` | 276 | — | neu (RED → GREEN) |
| `website/src/data/test-inventory.json` | — | — | generiert via `task test:inventory` |

Beide Shell-Dateien sind **nicht gebaselined**; die wirksame Schwelle ist damit das
statische `.sh`-Limit von 800 aus `docs/code-quality/gates.yaml`. Für `.bats` führt
`gates.yaml` kein Limit, deshalb steht dort kein Budget. Kein Split nötig — alle Dateien
bleiben nach der Änderung deutlich unter 80 % ihrer Schwelle.

## Task 1 — T002618: Watchdog wieder bis ans Ende laufen lassen

Zuerst, weil alle folgenden Tasks davon abhängen: solange `watchdog.sh` bei jedem stale
Ticket abbricht, wird der in Task 2 ergänzte Sweep nie erreicht.

- [x] **Failing-Test-Step (RED)** — in der Planungssitzung bereits erbracht, vor der
      Änderung erneut ausführen:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/orphan-slot-reap.bats \
  -f "uses no 'local' outside a function"
# expected: FAIL — Schritt 4 des Tests findet scripts/factory/watchdog.sh:160
```

Der Test führt seine Prämissen aus, statt sie zu behaupten: `local` in einer Funktion
läuft (Exit 0), `local` auf Top-Level bricht ab (Exit ≠ 0), und der awk-Detektor findet in
einer Fixture mit bekanntem Treffer genau einen Fund. Erst danach folgt die Aussage über
`watchdog.sh`.

- [x] **Fix-Step (GREEN).** In `scripts/factory/watchdog.sh:160` `local tier_name="flash"`
      durch `tier_name="flash"` ersetzen. Die Variable wird ausschließlich im selben
      Schleifendurchlauf gelesen und zu dessen Beginn neu gesetzt — die Funktions-Lokalität
      trug keine Semantik. Danach derselbe Befehl, jetzt PASS.

## Task 2 — T002610: Waisen-Sweep in `watchdog.sh`

- [x] Neuer Block am Ende von `scripts/factory/watchdog.sh`, unmittelbar vor
      `echo "$escalated"`. Strukturell dem `awaiting_deploy`-Sweep (Zeile 187-197)
      nachgebildet: eigener Schwellwert, `mapfile`-Abfrage, Schleife, Eintrag ins
      `escalated`-Array.

```bash
# ── orphaned pipeline_slot (T002610) ──────────────────────────────────────
# Ein Slot auf einem Ticket, das nicht in_progress ist, blockiert jeden kuenftigen
# Claim (slots.sh claim-gang setzt WHERE pipeline_slot IS NULL) und belegt zugleich
# keine Kapazitaet (slots.sh count filtert status='in_progress') — rein blockierend
# und unsichtbar. Eigene Karenzzeit statt FACTORY_STALE_MIN: ein Waise ist ein
# anderer Zustand als eine haengende Pipeline und darf schneller geraeumt werden.
ORPHAN_MIN="${FACTORY_ORPHAN_SLOT_MIN:-10}"
mapfile -t orphan_slots < <(printf "SELECT external_id FROM tickets.tickets WHERE pipeline_slot IS NOT NULL AND status <> 'in_progress' AND updated_at < now() - make_interval(mins => %s);" "$ORPHAN_MIN" | factory_psql)

for ext_id in "${orphan_slots[@]}"; do
  [[ -z "$ext_id" ]] && continue
  # Status NICHT anfassen: bei einem Waisen ist er bereits korrekt, nur der Slot
  # ist falsch. Das unterscheidet diesen Sweep vom Stale-Sweep oben.
  BRAND="$BRAND" TICKET_CTX="$FACTORY_CTX" bash "$HERE/../ticket.sh" add-comment --id "$ext_id" \
    --body "Watchdog: verwaister pipeline_slot (Status != in_progress, > ${ORPHAN_MIN}min unberuehrt) — Slot freigegeben, Status unveraendert. [T002610]" >/dev/null || true
  BRAND="$BRAND" TICKET_CTX="$FACTORY_CTX" bash "$HERE/../ticket.sh" release-slot --id "$ext_id" >/dev/null || true
  escalated=$(echo "$escalated" | jq -c --arg e "$ext_id" '. + [$e]')
done
```

**Zwei gleichnamige Skripte auseinanderhalten:** Die Freigabe läuft über
`scripts/ticket.sh release-slot` (ruft intern `slots.sh release` auf) — derselbe Pfad wie
in `watchdog.sh:149` und `:180`. Das Skript `scripts/factory/release-slot.sh` ist trotz des
identischen Namens **nicht** zuständig: es dekrementiert `active_agents` in
`tickets.provider_health`, also LLM-Provider-Kapazität, und hat mit `pipeline_slot` nichts
zu tun.

Die `|| true` an beiden `ticket.sh`-Aufrufen halten den Sweep fail-open, analog zum
Zombie-Worktree-Cleanup: ein einzelnes nicht räumbares Ticket darf den Watchdog-Lauf nicht
abbrechen.

- [x] Offline-Gegenprobe, dass der neue Block das Skript nicht bricht:

```bash
bash -n scripts/factory/watchdog.sh
env BRAND=mentolder FACTORY_DRY_RESOLVE=1 bash scripts/factory/watchdog.sh
# Exit 0 — dry-resolve bleibt gruen
```

## Task 3 — T002610: Claim-Fehlschlag in `schedule.sh` melden

- [x] In `scripts/factory/schedule.sh:106` verschluckt der `claim-gang`-Aufruf per
      `>/dev/null 2>&1` sowohl Diagnose als auch Exit-Code. Künftig wird stderr
      aufgefangen und bei Fehlschlag als `WARN` ausgegeben:

```bash
  set +e
  claim_err=$(BRAND="$BRAND" FACTORY_CTX="$FACTORY_CTX" bash "$HERE/slots.sh" \
    claim-gang "$ext_id" "$want" 1 2>&1 >/dev/null)
  claim_rc=$?
  set -e
  if [[ "$claim_rc" -eq 0 ]]; then
    plan=$(echo "$plan" | jq -c --arg b "$BRAND" --arg e "$ext_id" --argjson s "$want" '. + [{brand:$b, external_id:$e, slot:$s}]')
    global_used=$((global_used + want))
  else
    # [T002610] Bis hierher wurde der Fehlschlag komplett verschluckt: ein Ticket mit
    # verwaistem pipeline_slot stand bei jedem Tick in der Queue, wurde uebersprungen
    # und erzeugte nirgends ein Signal. Fail-open bleibt (nur dieser Kandidat faellt
    # aus), aber sichtbar — wie schon bei T002386 und T002418 in diesem Skript.
    echo "schedule: WARN slot claim failed for ${ext_id} — skipping candidate: ${claim_err}" >&2
  fi
```

Die Reihenfolge `2>&1 >/dev/null` ist wesentlich: sie leitet stderr in die
Kommandosubstitution und stdout nach `/dev/null`. Umgekehrt notiert (`>/dev/null 2>&1`)
landet beides im Nichts — genau der bestehende Defekt.

Das JSON auf stdout bleibt unberührt, weil die Meldung auf stderr geht.

- [x] Gegenprobe:

```bash
bash -n scripts/factory/schedule.sh
env BRAND=mentolder FACTORY_DRY_RESOLVE=1 bash scripts/factory/schedule.sh
# Exit 0 — dry-resolve bleibt gruen
```

## Task 4 — Live-Tests gegen einen Dev-Cluster rot→grün fahren ✅

Durchgeführt. Der Weg dorthin ist hier festgehalten, weil er nicht offensichtlich ist und
für jede künftige Live-Verifikation von Factory-Skripten wieder gebraucht wird.

- [x] **Dev-Cluster mit Ticket-Schema.** `k3d-korczewski-dev` hat einen `shared-db`-Pod
      (in Namespace `workspace`, **nicht** im brand-abgeleiteten Namespace), dessen `website`-DB
      aber nur `public` kannte. Es gibt kein Bootstrap-Skript für das `tickets`-Schema — es ist
      über Einzelmigrationen gewachsen. Weg: reiner Schema-Dump von prod (lesend) in die Dev-DB.

```bash
kubectl --context fleet -n workspace exec <shared-db-pod> -c postgres -- \
  pg_dump -U postgres -d website --schema-only --schema=tickets --no-owner --no-privileges \
  > tickets-schema.sql
kubectl --context k3d-korczewski-dev -n workspace exec -i <dev-pod> -c postgres -- \
  psql -U postgres -d website < tickets-schema.sql
# 7 Fehler auf public-Abhaengigkeiten (Fremdschluessel/Trigger auf Tabellen, die im Dev
# fehlen) sind erwartbar und unschaedlich; 26 Tabellen inkl. der Lifecycle-Trigger landen.
kubectl … psql -U postgres -d website -qtAc \
  "GRANT USAGE ON SCHEMA tickets TO website; GRANT ALL ON ALL TABLES IN SCHEMA tickets TO website; …"
```

- [x] **Kontext-Alias statt Repo-Änderung.** `scripts/ticket.sh` leitet den Namespace hart aus
      der Brand ab und hängt bei Kontexten mit `k3d-`-Präfix oder `-dev`-Suffix ein `-dev` an —
      der Pod liegt aber in `workspace`. Ein kubeconfig-Alias ohne diese Namensmerkmale umgeht
      das, ohne Produktionscode für Testzwecke zu biegen:

```bash
kubectl config set-context devlocal-t002610 --cluster=k3d-korczewski --user=admin@k3d-korczewski --namespace=workspace
```

- [x] **Rot vor, grün nach der Änderung** — beides ausgeführt:

```bash
env FACTORY_CTX=devlocal-t002610 FACTORY_NS=workspace TICKET_CTX=devlocal-t002610 \
    TEST_BRAND=mentolder TICKET_TEST_DB_OK=1 \
  tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/orphan-slot-reap.bats
# vor der Aenderung:  7 von 9 rot (die zwei dry-resolve-Tests gruen)
# nach der Aenderung: 9 von 9 gruen
```

`TICKET_TEST_DB_OK=1` ist das dokumentierte Opt-in aus T002224: ohne diese Variable biegt
`scripts/vda/ticket/_ticket-core.sh` den Kontext unter BATS auf einen Sentinel um, damit
Tests keine echten Tickets schreiben. Der Lauf darf **niemals** gegen `fleet` gehen;
`seed_test_feature` verweigert das von sich aus mit Exit 3.

### Drei Befunde aus diesem Task — je ein eigenes Ticket

| Ticket | Befund |
|---|---|
| **T002619** | `migrations/20260802-pipeline-slot-meta.sql` ist in prod nicht angewandt. `slots.sh claim` scheitert daran; `slot-id` (Produktivpfad, `pipeline.mjs:88`) fällt still auf `null` zurück. |
| **T002620** | FA-SF-26 in `scheduling.bats:170/193` datiert `updated_at` zurück, um ein stale Ticket zu erzeugen. Der Trigger `fn_lifecycle_ts` überschreibt das sofort — die Tests bestehen vakuos. Genau deshalb fand FA-SF-26 den T002618-Defekt nicht, obwohl er in dem Pfad liegt, den der Test abdeckt. |
| — | Konsequenz für diesen Vorgang: die Alterung läuft hier über den **Schwellwert** (`FACTORY_ORPHAN_SLOT_MIN=0` / `FACTORY_STALE_MIN=0`), nicht über den Zeitstempel. Jeder Live-Test trägt zusätzlich einen Positiv-Anker, der belegt, dass die geprüfte Liste nicht leer war. |

## Task 5 — Verifikation

- [x] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

- [x] Ergänzend:

```bash
task test:inventory   # neue Testdatei ins Inventar aufnehmen
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/orphan-slot-reap.bats
```

`website/src/data/test-inventory.json` mit committen — CI vergleicht die Datei gegen den
frisch generierten Stand und schlägt sonst fehl.
