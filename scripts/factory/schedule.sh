#!/usr/bin/env bash
# scripts/factory/schedule.sh — poll the queue for a brand, run the best-effort
# brand-aware conflict gate on KNOWN touched_files, claim a slot per
# non-conflicting feature up to the per-brand pool AND a global concurrency cap
# (summed across both brands), and emit the launch plan as JSON:
#   [{ "brand": "...", "external_id": "...", "slot": N }]
#
#   BRAND=<brand> FACTORY_GLOBAL_CAP=3 bash scripts/factory/schedule.sh
#
# The AUTHORITATIVE conflict gate is pipeline.js' Plan phase (③). This is a
# pre-filter on already-known touched_files; a fresh feature (NULL touched_files,
# conflict-check exits 2 = "no known conflict") schedules and self-corrects if
# the pipeline's own gate later blocks it.
set -euo pipefail
HERE="$(dirname "${BASH_SOURCE[0]}")"
source "$HERE/lib.sh"
BRAND="${BRAND:-}"
factory_resolve
[[ -n "${FACTORY_DRY_RESOLVE:-}" ]] && { echo "resolved: ctx=${FACTORY_CTX} ns=${FACTORY_NS}"; exit 0; }

GLOBAL_CAP="${FACTORY_GLOBAL_CAP:-3}"

# Global concurrency = occupied slots across BOTH brands (separate DBs).
global_used=0
for b in mentolder korczewski; do
  # [T002386] Fehler NICHT still als 0 werten. Bis dahin verschluckte
  # `2>/dev/null || echo 0` jeden Ausfall einer Brand und rechnete sie als leer.
  # Genau so blieb unbemerkt, dass korczewski wegen eines toten shared-db-Pods
  # ueber Stunden gar nicht erreichbar war: keine Meldung, keine Warnung, nur
  # eine Kapazitaetsrechnung, die zu viel Platz auswies.
  # Fail-open bleibt bewusst (ein Brand-Ausfall darf die andere nicht blockieren),
  # aber er ist jetzt sichtbar.
  if ! n=$(BRAND="$b" FACTORY_CTX="$FACTORY_CTX" bash "$HERE/slots.sh" count 2>&1); then
    echo "schedule: WARN slot count for brand '$b' failed, counting it as 0 — capacity may be overstated: ${n}" >&2
    n=0
  fi
  case "$n" in (''|*[!0-9]*) n=0 ;; esac
  global_used=$((global_used + n))
done

plan='[]'
mapfile -t candidates < <(BRAND="$BRAND" FACTORY_CTX="$FACTORY_CTX" bash "$HERE/queue.sh" | jq -c '.[]')
for c in "${candidates[@]}"; do
  [[ -z "$c" ]] && continue
  [[ "$global_used" -ge "$GLOBAL_CAP" ]] && break
  ext_id=$(echo "$c" | jq -r '.external_id')

  # Dependency blocker gate (TDR-2): skip tickets whose depends_on predecessors
  # are not all done. Queries the DB directly via factory_psql.
  # [T005306] Die Query referenzierte d.external_id, aber das Subquery-Alias d
  # liefert nur dep_id (unnest(depends_on)) — die Query scheiterte still (stderr
  # verworfen, set +e) und der Gate fiel fail-open: Tickets mit offenen Blockern
  # wurden geplant. Korrektur: d.dep_id. Zusaetzlich war der COALESCE-Fallback
  # wirkungslos (json_build_object ist nie NULL): bei 0 Zeilen (keine depends_on)
  # kam {'blocked': true, 'blockers': null} heraus — Kandidaten ohne Abhaengigkeit
  # wurden faelschlich geblockt. bool_or/FILTER liefern immer ein belastbares
  # Ergebnis. Fehler-Sichtbarkeit wie T002386/T002610: stderr wird mitgefasst,
  # und ein Query-Fehler skippt den Kandidaten sichtbar (fail-closed) statt den
  # Gate lautlos zu ueberspringen.
  set +e
  blocker_out=$(cat <<SQL | BRAND="$BRAND" FACTORY_CTX="$FACTORY_CTX" factory_psql 2>&1
SELECT json_build_object(
  'blocked', COALESCE(bool_or(t.status IS DISTINCT FROM 'done'), false),
  'blockers', COALESCE(json_agg(d.dep_id) FILTER (WHERE t.status IS DISTINCT FROM 'done'), '[]'::json)
)
FROM (
  SELECT unnest(depends_on) AS dep_id
  FROM tickets.tickets WHERE external_id = '${ext_id}'
) d
LEFT JOIN tickets.tickets t ON t.external_id = d.dep_id
SQL
)
  blocker_rc=$?
  set -e
  if [[ "$blocker_rc" -ne 0 ]] || ! echo "$blocker_out" | jq -e 'has("blocked")' >/dev/null 2>&1; then
    echo "schedule: ERROR dependency-blocker query failed for ${ext_id} — skipping candidate fail-closed [T005306]: ${blocker_out}" >&2
    continue
  fi
  if echo "$blocker_out" | jq -e '.blocked == true' >/dev/null 2>&1; then
    blockers=$(echo "$blocker_out" | jq -r '.blockers | join(", ")')
    continue
  fi

  # Conflict gate on known touched_files. rc 0 = no conflict, rc 1 = conflict (skip),
  # rc 2 = error/null touched_files.
  #
  # [T002418] rc 2 bleibt schedulable, wird aber nicht mehr stillschweigend geschluckt.
  # Die Spalte touched_files wurde bis T002418 nie befuellt (pipeline.mjs verwarf
  # scout.touched_files nach dem unmittelbaren Check), weshalb dieser Aufruf hier
  # praktisch IMMER rc 2 lieferte und das Gate faktisch wirkungslos war — so liefen am
  # 2026-07-28 T002341/T002373/T002374 gleichzeitig auf scripts/agent-lock.sh.
  # Seit dem Scout-Write ist rc 2 der Ausnahmefall und damit ein Befund: sichtbar auf
  # stderr, damit man merkt, wenn das Gate wieder blind laeuft. Fail-open bleibt es
  # bewusst — ein nicht erreichbarer DB-Pod darf den Dispatch nicht komplett anhalten.
  set +e
  BRAND="$BRAND" FACTORY_CTX="$FACTORY_CTX" bash "$HERE/conflict-check.sh" "$ext_id" >/dev/null 2>&1
  rc=$?
  set -e
  [[ "$rc" -eq 1 ]] && continue
  if [[ "$rc" -eq 2 ]]; then
    echo "WARN: conflict-check rc 2 fuer $ext_id (keine touched_files oder Fehler) — schedule ungeprueft [T002418]" >&2
  fi

  # Gang-Bedarf des Kandidaten (Design §3): slot_count wird von stage-plan
  # --partials gesetzt; Default 1 = Single-Slot wie bisher.
  needed=$(printf '%s' "SELECT COALESCE(slot_count,1) FROM tickets.tickets WHERE external_id = :'ext_id';" \
    | BRAND="$BRAND" FACTORY_CTX="$FACTORY_CTX" factory_psql -v ext_id="$ext_id")
  needed="${needed:-1}"

  used=$(BRAND="$BRAND" FACTORY_CTX="$FACTORY_CTX" bash "$HERE/slots.sh" count)
  free=$(( ${FACTORY_SLOTS_PER_BRAND:-3} - ${used:-0} ))

  # head-of-line blocking: nur bei erschöpfter Kapazität (free == 0) breaken,
  # nicht bei unzureichendem Slot-Bedarf (T002082: dependency-basiertes Scheduling).
  if [[ "$free" -lt 1 || $(( global_used + 1 )) -gt "$GLOBAL_CAP" ]]; then
    break
  fi
  want=$(( needed < free ? needed : free ))
  (( global_used + want > GLOBAL_CAP )) && want=$(( GLOBAL_CAP - global_used ))
  # [T002610] Der Claim lief bis hier mit `>/dev/null 2>&1` und verwarf damit
  # Fehlermeldung UND Exit-Code. Ein Ticket, das wegen eines verwaisten
  # pipeline_slot nie claimbar ist, stand deshalb bei jedem Tick in der Queue,
  # wurde uebersprungen und erzeugte nirgends ein Signal — so fiel T002482 aus
  # der Factory. Fail-open bleibt bewusst (nur dieser Kandidat faellt aus), aber
  # sichtbar; dasselbe Muster wie oben bei T002386 und T002418.
  #
  # Reihenfolge `2>&1 >/dev/null` ist wesentlich: sie leitet stderr in die
  # Kommandosubstitution und stdout ins Nichts. Umgekehrt notiert landet beides
  # im Nichts — genau der behobene Defekt.
  #
  # Der Aufruf bleibt bewusst EINZEILIG: tests/unit/factory-blocked.bats:40
  # prueft `grep -q "slots.sh.*claim"`, matcht also zeilenweise. Ein
  # Zeilenumbruch vor `claim-gang` faellt beim Lesen nicht auf, macht diesen
  # Bestandstest aber rot.
  set +e
  claim_err=$(BRAND="$BRAND" FACTORY_CTX="$FACTORY_CTX" bash "$HERE/slots.sh" claim-gang "$ext_id" "$want" 1 2>&1 >/dev/null)
  claim_rc=$?
  set -e
  if [[ "$claim_rc" -eq 0 ]]; then
    plan=$(echo "$plan" | jq -c --arg b "$BRAND" --arg e "$ext_id" --argjson s "$want" '. + [{brand:$b, external_id:$e, slot:$s}]')
    global_used=$((global_used + want))
  else
    echo "schedule: WARN slot claim failed for ${ext_id} — skipping candidate: ${claim_err}" >&2
  fi
done
echo "$plan"
