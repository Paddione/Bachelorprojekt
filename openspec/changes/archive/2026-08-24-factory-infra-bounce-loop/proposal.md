# Proposal: factory-infra-bounce-loop

## WHY (Root Cause, evidenzbasiert)

T014546/T014551 (feat, lastenheft_locked, backlog) bounced am 2026-08-23 wiederholt
triage→in_progress→triage (Kommentare 09:46–21:40 UTC), ohne dass je ein Phasen-Event
geschrieben wurde (class=INFRA). Drei zusammenspielende Defekte:

1. **Claim-vor-Readiness-Ordnung:** `schedule.sh:173` claimed den Gang-Slot
   (`slots.sh claim-gang` setzt `status='in_progress'`) BEVOR der Readiness-Gate in
   `dispatcher-bridge.sh:92` (`check_ticket_readiness branch plan_path`) planlose
   Rows (`readiness=missing_args`, Journal 21:34 UTC) überspringt. Ergebnis:
   in_progress-Strand ohne Pipeline.
2. **Split-Brain im Watchdog-Pfad:** Status-Reset + Bounce-Kommentar landen via
   `ticket.sh` (TICKET_CTX=k3d-mentolder-dev) in der SSOT, während der
   Attempt-Counter via `factory_psql` (FACTORY_CTX) in eine davon abweichende DB
   geschrieben wurde — belegt: Zeile `factory_infra_attempt:T014546=4` auf dem
   datenleeren fleet-Ghost-Pod (T015168-Szene), während die SSOT nie eine Zeile
   erhielt. Der Kommentar zeigt `[INFRA ?/3]`: attempt="?" ist nie numerisch,
   `escalate` feuert nie → endloses Re-Bouncing statt Eskalation nach
   MAX_INFRA_ATTEMPTS.
3. **STALE_MIN=0-Sweeps gegen die geteilte Dev-DB:** Bounce-Kommentare tragen
   wörtlich `stale > 0min`. T005561 dokumentiert genau diese Klasse: Tests/ Aufrufe
   mit FACTORY_STALE_MIN=0 setzen fremde in_progress-Tickets zurück. Jeder solche
   Sweep verwandelte den Stranded-Zustand sofort in einen Bounce.

## WAS

- schedule-seitiger Readiness-Gate VOR claim-gang: planlose Feats werden nicht
  geclaimt (kein in_progress-Strand mehr).
- Watchdog: Counter-Fehler sichtbar machen (stderr statt 2>/dev/null), bei
  N aufeinanderfolgenden unlesbaren Runden dennoch eskalieren (Fail-safe gegen
  Endlosschleife), DB-Identitätscheck zwischen factory_psql- und ticket.sh-Pfad
  vor Reset-Writes; bei Mismatch laut abbrechen statt fremde DB zu beschreiben.
- Guard-Tests für alle drei Verhaltensweisen (RED zuerst).
