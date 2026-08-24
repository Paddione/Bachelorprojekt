# Proposal: watchdog-blocked-pr-transition

## Why

Abgebrochene Exec-Tickets bleiben im Status `blocked` hängen, obwohl der
Implementierungs-PR bereits offen ist. Der Eskalationspfad des Factory-Watchdogs
(`ticket.sh unfactory`, watchdog.sh:280) setzt `status=blocked`,
`attention_mode=needs_human` und `readiness.factory_excluded=true` — danach fasst
kein Sweep das Ticket wieder an: der Stale-Sweep von watchdog.sh filtert ausschließlich
auf `status='in_progress'` (watchdog.sh:57), und reconcile-ticket-status.sh deckt mit
seinen Patterns 1–4b nur `awaiting_deploy`, Terminal-Zustände und `plan_staged` ab.
Existiert zum Zeitpunkt der Eskalation bereits ein PR mit `[T<id>]`-Tag im Titel,
divergiert der Ticket-Status vom realen Fortschritt — die Arbeit ist im Review,
das Ticket erscheint aber als blockiert und bleibt für die Folgephasen unsichtbar.

**Ursachen-Verifikation (T002448-M5):**
- *Symptom (beobachtet):* Mishap-Buffer-Eintrag vom 2026-08-23T23:36:40Z — Exec-Ticket
  nach Abbruch in `blocked` zurückgeblieben, Implementierungs-PR offen.
- *Ursache (Code-Evidenz):* Kein Skript unter scripts/factory/ führt eine Query auf
  `status='blocked'` mit PR-Gegenprobe aus (`grep -rn "status='blocked'" scripts/factory/`
  trifft nur queue.sh-Kommentare und dispatcher-bridge.sh-Setzung, nie eine Reparatur).

## What

Neues **Pattern 5 „blocked-with-open-PR"** in `scripts/factory/reconcile-ticket-status.sh`
(im etablierten nummerierten Pattern-Stil, dort ist die Drift-Reparatur beheimatet und es
läuft in wakeup.sh nach auto-close-merged.sh):

1. Kandidaten-Query: Tickets mit `status='blocked'`, Typ-Ausschluss wie watchdog
   (`project`,`incident`), Karenz 30min wie Patterns 4/4b.
2. PR-Gegenprobe im Stil auto-close-merged.sh: offene PRs via `gh pr list --state open`,
   Match gegen den literalen `[T<ext_id>]`-Titel-Tag (M2/T002506-Pattern).
3. Guard vor Write: gehaltener Agent-Lock (`agent-lock.sh check ticket`) ⇒ Skip
   (Spiegel der T002770-Signale); `gh`-Fehler ⇒ fail-open mit WARN.
4. Transition `blocked → in_review` + Audit-Kommentar + `attention_mode=auto`;
   `readiness.factory_excluded` bleibt bewusst `true` (Doku siehe Delta-Spec).
5. Ohne passenden offenen PR bleibt `blocked` korrekt bestehen (Eskalation steht);
   kein Kommentar pro Tick (Spam-Schutz).

Ziel-Status ist **`in_review`**, nicht `awaiting_deploy`: awaiting_deploy bedeutet im
hiesigen Statusfluss „gemergt, aber noch nicht deployt" (watchdog AD-Sweep, auto-close-
merged schließt bei Merge) — ein offener, ungemergter PR liegt semantisch davor.

_Ticket: T015820_
