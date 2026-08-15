# Proposal: factory-merged-dispatch-gate

## Why

Mishap-Fix (T006297). Am 2026-08-14 22:37–22:52 UTC wurden PR #4512 (T004896), #4514
(T005565) und #4515 (T005591) gemergt — die Tickets blieben jedoch offen
(Merge-ohne-Close-Drift: T004896/T005591 `in_progress`, T005565 `plan_staged`). Seit
22:41 UTC lief ein Watchdog-Sturm: `scripts/factory/watchdog.sh` (FACTORY_STALE_MIN=0 in
der Laufzeit-Umgebung) schrieb im Sekunden- bis Minutenabstand nahezu identische
„pipeline stale > 0min"-Kommentare (`class=INFRA`) auf T004896/T005565/T005591/T005560
und resettete sie auf `plan_staged`; die Factory-Pipeline dispatchte sie daraufhin
erneut in frische Worktrees (review-gate-enforce für T005565, ticket-lock-stale-pass
für T005560 — beide dirty, mtimes 00:30–00:48) → Duplikat-Arbeitsrisiko an bereits
gemergten Fixes. Die Tickets wurden erst 23:41–23:49Z von der ticket-ops-Konsolidierung
manuell geschlossen.

**Ursache (verifiziert, T002448-M5 — Symptom von Hypothese getrennt):**

*Symptome (belegt):* 11–12 Stale-Kommentare pro Ticket in ~40 min (DB
`tickets.ticket_comments`); null `[auto-close-merged]`-Journal-Zeilen zwischen 00:30 und
01:30 CEST; factory.service-Timeout um 01:12 CEST; frische dirty Worktrees.

*Ursachenkette (drei Lücken, die eine selbsttragende Schleife bilden):*

1. **Kein Merged-Check im Dispatch-Pfad.** `queue.sh` ist eine reine DB-Query;
   `schedule.sh` (Poll → Dependency-Gate → Conflict-Gate → Slot-Claim) prüft nirgends,
   ob der Fix des Kandidaten bereits auf main gemergt ist. `agent-lock.sh check-merged`
   (T002279) existiert und wird im Planungs-Preflight genutzt — im Factory-Dispatch
   gibt es keinen Aufrufer. Ein gemergtes Ticket bleibt plan_staged/backlog-dispatchbar.
2. **Watchdog resettet gemergte Tickets.** Der Stale-Sweep filtert nur auf type,
   `status='in_progress'` und `updated_at`. Ein gemergtes Ticket in `in_progress` wird
   auf `plan_staged` zurückgesetzt (plan_ref vorhanden) — exakt der Zustand, aus dem
   `queue.sh` wieder dispatcht. Damit füttert der Watchdog die Schleife selbst.
3. **auto-close-merged läuft nur einmal pro Service-Activation.** `wakeup.sh` ruft
   auto-close-merged/reconcile/auto-enqueue EINMAL vor der Idle-Retick-Loop auf
   (5-s-Intervall). Der aktive Tick (Start ~22:12Z, RuntimeMaxSec=3600) lief durch die
   Merge-Phase (22:37–22:52Z), ohne auto-close-merged erneut aufzurufen — deshalb
   blieben die Tickets offen, während der Loop lief. Journal-Beleg: null
   `[auto-close-merged]`-Zeilen im Sturm-Fenster.

Mit STALE_MIN=0 (Herkunft: Laufzeit-Umgebung, nicht autopilot.env) war jedes
`in_progress`-Ticket sofort stale: Dispatch → in_progress → Watchdog-Reset + Kommentar
→ Re-Dispatch → … — der beobachtete Sekundentakt.

**Kandidaten aus dem Ticket:** (1) Merged-Gate im Dispatch (`schedule.sh`): gemergte
Kandidaten nicht claimen, sondern schließen; (2) Watchdog schließt gemergte stale
Tickets statt sie zurückzusetzen; (3) auto-close-merged in die Retick-Loop aufnehmen.

**Entscheidung: (1) + (2).** Mit (1)+(2) konvergiert der Abschluss eines gemergten
Tickets im selben Tick an beiden Kanten der Schleife (plan_staged/backlog → Gate beim
Dispatch; in_progress → Gate im Watchdog-Sweep). (3) wird verworfen: ein
auto-close-merged pro Retick (~5 s) würde `gh pr list` je Lauf aufrufen (API-Limits)
und `wakeup.sh` anfassen; die Schleife ist ohne (3) bereits an beiden Kanten gebrochen,
und `wakeup.sh` bleibt unberührt (geringeres Konfliktrisiko mit laufenden Sessions).

**Überlappung mit T006364 (Parallelsession, gleiche Datei-Familie):** T006364
(slug `watchdog-factory-excluded-scope`) verengt den Watchdog-Stale-Scope um
`readiness.factory_excluded=true` (Resume-Livelock bei manueller dev-flow-execute-
Übernahme; STALE_MIN=0-Herkunft gehört in dessen Scope). Die Änderungen sind disjunkt:
T006364 berührt `_stale_query` (WHERE-Klausel) und das SSOT-Requirement
„Watchdog-Eskalation und Zombie-Cleanup"; T006297 berührt den Reset-Entscheidungspfad
im Watchdog-Loop (Merged-Check) plus `schedule.sh` (neuer Gate) und legt ein NEUES
SSOT-Requirement an („Merged-PR-Dispatch-Gate"), nicht das von T006364 modifizierte.
Beide Pläne können unabhängig mergen; `depends_on_plans` bleibt leer.

## What

- `scripts/factory/schedule.sh`: neuer Gate „merged-on-main" pro Kandidat — vor
  Dependency-/Conflict-Gate und Slot-Claim. Aufruf `agent-lock.sh check-merged
  <ext_id>`; rc=1 (Fix auf main) → Kandidat nicht claimen, Ticket schließen
  (`ticket.sh update-status --status done --resolution fixed|shipped`, Typ-Vokabular
  wie auto-close-merged: fix/bug → fixed, sonst shipped) + Abschluss-Kommentar
  („Fix bereits auf main gemergt — Ticket geschlossen statt dispatcht"); rc=2 (kein
  origin/main) → fail-open mit sichtbarer WARN (Muster T002418/T002610), Kandidat
  wird weiter verarbeitet.
- `scripts/factory/watchdog.sh`: Merged-Check im Stale-Loop pro Ticket (nach
  plan_ref-Extraktion, vor Zählerfortschreibung und Reset): rc=1 → Ticket schließen
  (done, resolution nach Typ) + Kommentar statt Status-Reset; Slot-Freigabe und
  Zombie-Worktree-Cleanup laufen unverändert; der Versuchszähler wird nicht
  fortgeschrieben (kein Sturm-Kommentar). rc=2 → fail-open wie bisher.
- SSOT-Delta `openspec/specs/software-factory.md` (ADDED): Requirement
  „Merged-PR-Dispatch-Gate" mit vier Scenarios (Dispatch-Gate geschlossen/positiv,
  Watchdog-Close/positiv).
- Neue BATS-Guards (Output-Verifikation, Positiv-Anker-Pflicht T002356-M1):
  `tests/spec/software-factory/merged-dispatch-gate.bats` und
  `tests/spec/factory-watchdog/merged-ticket-close.bats` — rot ohne Fix, grün mit Fix.

_Ticket: T006297_
