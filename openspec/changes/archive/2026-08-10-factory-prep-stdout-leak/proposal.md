# Proposal: factory-prep-stdout-leak

## Why

Die Software Factory hat seit 2026-07-22 keine Pipeline mehr gestartet. Der Backlog
war weder leer noch blockiert — zerstoert war der **Launch-Plan**: die Prep-Datei,
die `wakeup.sh` an `dispatcher-bridge.sh` uebergibt, enthielt bei jedem Tick `null`.

Die Kette: `schedule.sh` claimt einen Slot (Ticket wird `in_progress`), der
Worktree-Pre-Create in `factory-prep.sh` scheitert an einem anderswo ausgecheckten
Branch, der SKIP-Pfad ruft `ticket.sh release-slot` — dessen Erfolgsmeldung geht auf
**stdout**, mitten in den JSON-Stream, den `run_prep` am Ende per `jq -n` erzeugt.
`wakeup.sh` pipet dieses stdout in `jq -c .`, der Parse-Fehler loest den
`|| echo 'null'`-Fallback aus, `dispatcher-bridge.sh` liest `.launch | length` aus
`null` und meldet `0 feature(s) scheduled`.

Zwei Verstaerker machten daraus einen wochenlangen Stillstand statt einer Panne:

1. Die Prep-Datei traegt den Launch-Plan **aller** Tickets eines Ticks. Ein einziges
   Ticket mit belegtem Branch verhindert den Start jedes anderen, an sich
   startbaren Tickets desselben Ticks.
2. Der `jq`-Fehler wurde durch `2>/dev/null` verschluckt. Es gab kein Signal —
   weder im Journal noch sonstwo.

Zusaetzlich strandeten die betroffenen Tickets: `release-slot` setzt
`pipeline_slot = NULL`, laesst `status` aber auf `in_progress`. `queue.sh` liest
ausschliesslich `backlog`/`plan_staged` — ein so hinterlassenes Ticket ist dauerhaft
unsichtbar und nie wieder schedulebar.

## What

- **D1 — stdout-Leck.** Beide `release-slot`-Aufrufe in `scripts/vda/factory-prep.sh`
  laufen ueber einen neuen Helfer `release_slot_and_restore`, der beide Schreibwege
  (`>/dev/null 2>&1`) verschliesst. `run_prep` erzeugt auf stdout nur noch sein
  Abschluss-JSON.
- **D1b — Stille beseitigt.** `scripts/factory/wakeup.sh` verschluckt den
  `jq`-Parse-Fehler nicht mehr. Der `null`-Fallback bleibt (ein kaputter PREP darf
  den Tick nicht abbrechen), aber Fehlerursache und der Kopf des unlesbaren Streams
  gehen auf stderr und damit ins Journal.
- **D2 — gestrandete Tickets.** Der Slot-Release im SKIP-Pfad stellt den Vorzustand
  wieder her (`plan_staged` bei vorhandenem `plan_ref`, sonst `backlog`), statt das
  Ticket auf `in_progress` ohne Slot zu hinterlassen.

Nicht Teil dieses Changes: die ausloesende Bedingung selbst — der Pre-Create
scheitert weiterhin, wenn der Branch anderswo ausgecheckt ist. Das ist als
**T003270** abgetrennt und mit T003269 verlinkt.

_Ticket: T003269_
