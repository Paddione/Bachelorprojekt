# P1: FA-SF-26-Tests von vakuos auf echte Eskalations-Pruefung umstellen

> **Agent:** factory (deepseek-Flash) | **Files:** `tests/spec/software-factory/scheduling.bats` | **Steps:** 3
> **Verify:** `tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/scheduling.bats -f "FA-SF-26: a stale in_progress feature"` (gruen) + `task test:changed` + `task freshness:check`
>
> **NICHT tun:** keine Exploration, keine Annahmen, keine Aenderung an `watchdog.sh`
> oder anderen Dateien — nur die beiden Test-Bloecke unten ersetzen. Die Live-Tests
> brauchen einen erreichbaren Dev-Cluster (`FACTORY_CTX`); ohne ihn skippen sie und
> der Lauf ist trotzdem gruen. Die Diagnose (Schritt 1) ist deshalb zwingend, sonst
> wird der Fix nicht belegt.

## Kontext (kurz)

Der Trigger `tickets.fn_lifecycle_ts` (`website/src/lib/tickets/tables/tickets.ts:338`)
setzt bei JEDEM UPDATE unbedingt `NEW.updated_at := now()` (Zeile 352). Ein
`SET updated_at = now() - interval '40 minutes'` wird im selben Statement wieder
ueberschrieben → die Stale-Liste des Watchdogs bleibt leer, der Eskalationspfad wird
nie ausgefuehrt, die Tests pruefen nichts. Fix: Alterung ueber den Schwellwert
(`FACTORY_STALE_MIN=0`) + Positiv-Anker (ext_id im JSON-Array). Vorlage:
`tests/spec/software-factory/orphan-slot-reap.bats` (T002610).

## Step 1 — Diagnose (RED): Backdating wirkungslos + Bestandstest rot

**1a. SQL-Probe gegen den Dev-Cluster** — belegt, dass der Trigger das Backdating
ueberschreibt (die Messung aus dem Ticket, nachvollzogen):

```bash
# Dev-Cluster-Kontext (Rezept T002610 Task 4): kubeconfig-Alias ohne k3d-/-dev-
# Namensmerkmale, FACTORY_NS auf den shared-db-Namespace, nie gegen 'fleet'.
export FACTORY_CTX=devlocal-t002620 FACTORY_NS=workspace TICKET_CTX=devlocal-t002620
export TEST_BRAND=mentolder TICKET_TEST_DB_OK=1
ext=$(env BRAND=mentolder TICKET_CTX=devlocal-t002620 bash scripts/ticket.sh create \
  --type feature --brand mentolder --title "SF-TEST-wd-diag-$$" \
  --description "diag" --priority mittel --status backlog --is-test-data | cut -d'|' -f1)
pod=$(kubectl get pod -n workspace --context "$FACTORY_CTX" \
  -l 'app in (shared-db, shared-db-dev)' --field-selector status.phase=Running -o name | head -1)
kubectl exec -i "$pod" -n workspace --context "$FACTORY_CTX" -c postgres -- \
  psql -U website -d website -qtAc \
  "UPDATE tickets.tickets SET updated_at = now() - interval '40 minutes' WHERE external_id='$ext'; \
   SELECT now() - updated_at FROM tickets.tickets WHERE external_id='$ext';"
# expected: FAIL — 00:00:0X statt 00:40:00: der Trigger hat ueberschrieben (T002620)
```

**1b. Bestandstest ausfuehren** — er scheitert aus dem falschen Grund: die
Stale-Liste ist leer, der Status bleibt `in_progress`:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/scheduling.bats \
  -f "FA-SF-26: a stale in_progress feature"
# expected: FAIL (RED) — Ausgabe zeigt ein leeres JSON-Array [] und status=in_progress
```

## Step 2 — Fix (GREEN): beide FA-SF-26-Tests umschreiben

In `tests/spec/software-factory/scheduling.bats` die beiden Tests im Block
`# ── FA-SF-26-watchdog ──` (Zeilen 160–199) VOLLSTAENDIG durch folgende Fassungen
ersetzen. Aenderungen gegenueber dem Bestand: `slots.sh claim` → direktes UPDATE
(Zustand, nicht T002619-Falle), Backdating-Block entfernt,
`FACTORY_STALE_MIN=30` → `FACTORY_STALE_MIN=0 FACTORY_ORPHAN_SLOT_MIN=999`,
Test 1 zusaetzlich Slot-Freigabe-Assertion. Positiv-Anker bleiben/werden gestaerkt.

```bash
@test "FA-SF-26: a stale in_progress feature is returned to triage and its slot freed" {
  [ -n "${FACTORY_CTX:-}" ] || skip "no dev cluster context set"
  local brand="${TEST_BRAND:-korczewski}"
  ext=$(seed_test_feature "$brand" "tests/fixtures/sf-test-wd-$$-a.txt")
  # Zustand direkt setzen statt `slots.sh claim`: dessen Subkommando schreibt
  # pipeline_slot_meta, eine Spalte, die in prod fehlt (T002619) — der Claim
  # scheiterte dort mit Exit 3, bevor der Test begann.
  local ns; case "$brand" in mentolder) ns=workspace ;; korczewski) ns=workspace-korczewski ;; esac
  pod=$(kubectl get pod -n "$ns" --context "$FACTORY_CTX" -l 'app in (shared-db, shared-db-dev)' --field-selector status.phase=Running -o name | head -1)
  kubectl exec -i "$pod" -n "$ns" --context "$FACTORY_CTX" -c postgres -- \
    psql -U website -d website -qtAc "UPDATE tickets.tickets SET pipeline_slot=1, status='in_progress' WHERE external_id='$ext';"
  # Alterung ueber den Schwellwert statt ueber den Zeitstempel [T002620]:
  # fn_lifecycle_ts ueberschreibt `updated_at := now()` bei JEDEM Update, ein
  # Backdating bliebe wirkungslos und die Stale-Liste leer — dann liefe der
  # Watchdog ohne Arbeit durch und der Test bestuende vakuos. ORPHAN_MIN=999
  # blendet den Waisen-Sweep aus (Isolation, Spiegel von orphan-slot-reap.bats).
  run env BRAND="$brand" FACTORY_STALE_MIN=0 FACTORY_ORPHAN_SLOT_MIN=999 \
    bash scripts/factory/watchdog.sh
  [ "$status" -eq 0 ]
  # POSITIV-ANKER [T002356-M1]: belegt, dass die Stale-Liste NICHT leer war.
  echo "$output" | jq -e --arg e "$ext" 'any(.[]; . == $e)'
  # Confirm status=triage and pipeline_slot cleared.
  st=$(BRAND="$brand" TICKET_CTX="$FACTORY_CTX" bash scripts/ticket.sh get --id "$ext" | jq -r '.status')
  [ "$st" = "triage" ]
  # Slot-Freigabe nachpruefen — nicht nur den Status (der Testtitel verspricht beides).
  slot=$(kubectl exec -i "$pod" -n "$ns" --context "$FACTORY_CTX" -c postgres -- \
    psql -U website -d website -qtAc "SELECT COALESCE(pipeline_slot::text,'NULL') FROM tickets.tickets WHERE external_id='$ext';")
  [ "$slot" = "NULL" ]
}

@test "FA-SF-26: a stale in_progress feature WITH a staged plan (FACTORY-PLAN-REF) is returned to backlog, not triage [T001850]" {
  # [T002427] Aus tests/local/FA-SF-26-watchdog.bats uebernommen. Gegenstueck zum Test
  # darueber: liegt bereits ein Plan vor, darf der Watchdog diese Arbeit nicht wegwerfen,
  # indem er nach triage zuruecksetzt — das erzwingt einen vollen Scout/Design/Plan-Neustart.
  [ -n "${FACTORY_CTX:-}" ] || skip "no dev cluster context set"
  local brand="${TEST_BRAND:-korczewski}"
  ext=$(seed_test_feature "$brand" "tests/fixtures/sf-test-wd-$$-b.txt")
  # Zustand direkt setzen statt `slots.sh claim` (T002619) — siehe Test oben.
  local ns; case "$brand" in mentolder) ns=workspace ;; korczewski) ns=workspace-korczewski ;; esac
  pod=$(kubectl get pod -n "$ns" --context "$FACTORY_CTX" -l 'app in (shared-db, shared-db-dev)' --field-selector status.phase=Running -o name | head -1)
  kubectl exec -i "$pod" -n "$ns" --context "$FACTORY_CTX" -c postgres -- \
    psql -U website -d website -qtAc "UPDATE tickets.tickets SET pipeline_slot=1, status='in_progress' WHERE external_id='$ext';"
  # Simuliert, dass dev-flow-plan fuer dieses Ticket bereits einen Plan gestaged hat.
  BRAND="$brand" TICKET_CTX="$FACTORY_CTX" bash scripts/ticket.sh add-comment --id "$ext" \
    --body "FACTORY-PLAN-REF branch=feature/sf-test-wd-$$ plan=openspec/changes/sf-test-wd-$$/tasks.md" >/dev/null
  # Schwellwert 0 statt Zurueckdatieren [T002620] — siehe Test oben.
  run env BRAND="$brand" FACTORY_STALE_MIN=0 FACTORY_ORPHAN_SLOT_MIN=999 \
    bash scripts/factory/watchdog.sh
  [ "$status" -eq 0 ]
  # POSITIV-ANKER [T002356-M1]: belegt, dass die Stale-Liste NICHT leer war.
  echo "$output" | jq -e --arg e "$ext" 'any(.[]; . == $e)'
  st=$(BRAND="$brand" TICKET_CTX="$FACTORY_CTX" bash scripts/ticket.sh get --id "$ext" | jq -r '.status')
  [ "$st" = "backlog" ]
}
```

**Erwartung nach dem Umbau (live, Dev-Cluster):**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/scheduling.bats \
  -f "FA-SF-26: a stale in_progress feature"
# erwartet: beide gruen — das JSON-Array enthaelt die ext_id, Status triage/backlog,
# Test 1 zusaetzlich pipeline_slot=NULL
```

## Step 3 — Verifikation (offline, CI-Gates)

```bash
task test:changed     # gruen — die Live-Tests skippen ohne FACTORY_CTX
task freshness:check  # gruen — keine generierten Artefakte betroffen
```

**Hinweise fuer den Ausfuehrenden:**
- Factory-Live-Testdateien gegen den Dev-Cluster **sequenziell** laufen lassen, nie
  `--jobs` ueber Dateien hinweg — `FACTORY_STALE_MIN=0` raeumt jedes
  `in_progress`-Ticket der Brand (auch fremde Fixtures paralleler Dateien).
- Kein `slots.sh claim` in den Tests verwenden (T002619: `pipeline_slot_meta` fehlt
  in prod; der Claim bricht dort mit Exit 3 ab).
- `seed_test_feature` verweigert den Lauf gegen `fleet` von sich aus (Exit 3).
