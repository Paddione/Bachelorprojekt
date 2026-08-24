# Proposal: agent-lock-reliability

## Why

Zwei Mishap-Buffer-Einträge vom 2026-08-23 belegen dieselbe Zuverlässigkeitsschwäche in
`scripts/agent-lock.sh` von zwei Seiten (Batch-Parent T015918):

1. **T015822 — Liveness-Erkennung meldet aktive Locks als stale.** Der Heartbeat wird nur
   beim Claim geschrieben (`_write_lock` setzt `heartbeat_at=_now`) und danach von nichts
   verlängert. Läuft eine Session länger als `AGENT_LOCK_TTL` (1800 s), fällt ihr Lock
   ausschließlich durch den cwd-Scan `_worktree_has_active_process` (T014468) durch — der
   greift nicht, wenn die Session gerade zwischen zwei Bash-Calls arbeitet oder ihre
   Prozesse cwd-fremd sind. `reap` entfernt dann den Lock einer **lebenden** Session
   (`heartbeat-ttl`) und lässt parallele Sessions auf dasselbe Ticket los.
2. **T015823 — Session arbeitet ohne jeden Lock-Eintrag.** Die Absicherung ist kooperativ:
   `worktree-write-guard.sh` erlaubt bewusst alles, wenn die rufende Session gar keinen
   Claim hält (Entscheidungspfad 4), `worktree-create.sh` prüft zwar fremde Claims auf dem
   Zielpfad, erzwingt aber keinen eigenen Claim, und `activity` listet Prozesse, ohne
   claim-lose Worktrees kenntlich zu machen. Genau so arbeitete eine Session im
   T015168-Worktree komplett unsichtbar für die Koordination.

Beide Decksblätter führen zum selben Schaden: parallele Arbeit am selben Ticket/Branch
ohne dass das Koordinationssystem es sieht oder verhindert.

## What

Ein Change, ein Branch (`feature/batch-agent-lock-reliability-T015918`), zwei Task-Gruppen —
die Kinder schließen einzeln über ihre eigenen PRs:

- **Gruppe A (T015822) — Reap/Liveness-Zuverlässigkeit:**
  - Selbstbesitzerte Locks werden bei Read-Kontaktpunkten (`check` im mine-Fall,
    `refresh`, pre-commit-Self-Claim) per Heartbeat-Erneuerung am Leben gehalten.
  - Ein `heartbeat-ttl`-Reap gegen einen non-numeric (harnessgesetzten, unverifizierbar
    "always alive") Owner-SID braucht zusätzlich zum abgelaufenen Heartbeat ein zweites,
    unabhängiges Todessignal: keinen aktiven Prozess im Worktree **und** keine Git-
    Aktivität (HEAD/index-mtime) seit dem Heartbeat.
  - Die Fragmentstruktur bleibt erhalten; Logik wächst in `agent-lock-identity.sh`
    bzw. `agent-lock-activity.sh`, nicht in `agent-lock.sh` (Budget dort nur +26 Zeilen).
- **Gruppe B (T015823) — Claim-Durchsetzung & Worktree-Sichtbarkeit:**
  - `worktree-write-guard.sh` erhält Entscheidungspfad 2.5: Ziel innerhalb eines
    bestehenden Repo-Worktrees + Session hält GAR KEINEN Claim → ablehnen mit
    Claim-Anleitung (Bypass `WORKTREE_GUARD_BYPASS=1` bleibt).
  - `worktree-create.sh` claimed den Branch beim Anlegen automatisch (branch-scoped,
    Label `auto: worktree-create`), sodass ein Worktree nie ohne Lockeintrag entsteht.
  - `agent-lock.sh activity` meldet Worktrees mit Prozessen/Aktivität, aber ohne liveen
    Claim als eigene Sektion ("unclaimed worktrees") — der Mishap war sonst nur per Zufall
    auffindbar.

Delta-Spec zielt auf den Parent-SSOT `active-sessions-hub` (dort leben alle
agent-lock-Requirements). Kein Code-Merge in diesem Plan-Vorgang; Umsetzung und PRs
übernimmt `dev-flow-execute`.

_Ticket: T015918_
