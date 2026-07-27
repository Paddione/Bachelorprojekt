# Proposal: factory-reclaim-lock-respect

## Why

Ein Ticket soll normal in die Factory gestaget werden und in der Queue sichtbar bleiben —
aber solange eine interaktive Session es hält oder gar kein Worker daran arbeitet, muss es
sich ohne Umwege entnehmen und selbst bearbeiten lassen.

Am 2026-07-27 (T002255) griff der laufende Factory-Tick ein Ticket unmittelbar nach
`ticket.sh stage-plan`, obwohl `dev-flow-plan` laut Kontrakt bei `plan_staged` stoppt.
Zurückholen ging nur über den Umweg `status=blocked` — semantisch falsch, weil der Plan
fertig ist und nichts blockiert.

**Die naheliegende Erklärung war falsch.** Der ticket-scoped Lock-Guard existiert bereits
dreifach und ist korrekt (`factory-prep-runner.sh:67`, `factory-prep-bridge.sh:100`, und im
verwaisten `dispatcher-prep.sh:82`, jeweils als T000510 markiert). Er fragt
`agent-lock.sh check ticket` ab und gibt bei `held` den Slot frei. Er griff nicht, weil die
**Antwort falsch war**: `agent-lock.sh` stufte den Lock einer lebenden Session als reapable
ein und meldete `free`. Zwei Defekte in `_reapable`:

- **`_sid_alive` erkennt Claude-Sessions nicht.** Numerische SIDs werden per `pgrep -s`
  aufgelöst; die Claude-Session-SID ist numerisch, wird davon aber nicht gefunden. Der
  Kommentar nimmt nur *nicht*-numerische Harness-IDs von der Prüfung aus.
- **Ein lebender `owner_pid` galt nirgends als Lebensbeweis.** Der pid-Zweig reapt nur bei
  *totem* Prozess; ein lebender fiel durch zum `sid-dead`-Pfad und wurde nach Ablauf der
  Grace-Periode gereapt.
- **Branch-scoped Claims tragen `branch: ""`** — der Name steht in `id`, `--branch` wird nie
  übergeben. Der worktree+branch-Fallback (T002204) verlangt aber ein nicht-leeres
  `branch`-Feld und greift für sie deshalb prinzipiell nie.

## What

- **`scripts/agent-lock.sh`** — ein laufender `owner_pid` schützt den Claim (vor den
  worktree-missing- und sid-dead-Pfaden); ein toter `owner_pid` bleibt reapable. Ein
  branch-scoped Claim füllt sein `branch`-Feld aus der `id`, sofern kein `--branch` kommt.
- **`scripts/ticket-reclaim.sh` (neu)**, dispatcht von `ticket.sh reclaim <id>`: prüft
  Worker-Liveness über `updated_at` mit derselben Schwelle wie `watchdog.sh`, gibt bei totem
  oder fehlendem Worker den Slot frei, setzt den Status auf **`plan_staged`** und claimt das
  Ticket. Lebt ein Worker, bricht es ab und nennt Slot, Status und Alter des letzten
  Fortschritts — Übernahme nur mit `--force`.
- **Die Factory bleibt unverändert.** `queue.sh` (Sichtbarkeit), `dispatcher.js` und der
  T000510-Guard werden nicht angefasst — sie sind korrekt.

_Ticket: T002267_
