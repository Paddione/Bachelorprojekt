# p4 — agent-lock: SID-Drift (T003229) + Heartbeat-TTL (T003284)

_Ticket: T003541 · Partial p4 (impl) · Kinder: T003229, T003284_

## Ziel

Zwei zusammenhängende Defekte im agent-lock-Besitzmodell, die beide dazu führen,
dass die eigene Session vom eigenen Schutz ausgesperrt wird:

1. **T003229 — SID-Drift via MCP-Server.** ticket-mcp sieht eine andere
   CLAUDE_CODE_SESSION_ID als die Shell. `_AGENT_LOCK_SID_ENVS`
   (scripts/agent-lock-identity.sh:13) leitet die Identität aus der
   Prozessumgebung ab; der langlebige ticket-mcp-Serverprozess konserviert die
   SID seines Startzeitpunkts. Die Identität ist damit an die Server-Lebensdauer
   gebunden, nicht an die Session. Folge: `_ticket_lock_guard`
   (scripts/vda/ticket/_ticket-core.sh, Z. 129-183) sieht den eigenen Lock als
   fremd und blockiert jeden Ticket-Schreibvorgang — genau im vorgesehenen Ablauf
   "Lock nehmen, arbeiten, Status setzen".

2. **T003284 — Heartbeat-TTL reapt den Lock.** `heartbeat_at` wird beim Claim
   gesetzt, aber von nichts fortgeschrieben (`created_at` == `heartbeat_at`).
   `_reapable` (scripts/agent-lock.sh) reapt einen Lock nach Ablauf der
   heartbeat-TTL (~35 min) auch bei laufender Arbeit (4× in 2 min beobachtet).
   Der Worktree-Write-Guard (scripts/hooks/worktree-write-guard.sh) hängt seinen
   Besitzausweis am Lock — läuft der Lock ab, verweigert er Schreibzugriff auf
   den EIGENEN Worktree und diagnostiziert das Gegenteil ("vermutlich im
   Hauptcheckout oder in einem fremden Worktree").

## Entscheidung (im Plan festgehalten)

- **T003229:** Die Ownership-Erkennung MUSS gegen die Session des Aufrufers
  prüfen, nicht gegen die Startumgebung des Serverprozesses. Konkret: Der
  Lock-Guard soll die SID des CALLERS akzeptieren (Übergabe explizit, z.B. via
  Umgebungsvariable beim Sub-Bash-Aufruf — die T002422-Weitergabe existiert
  bereits, sie reicht nur die Harness-Variablen des Serverprozesses durch).
  Ansatz: die Harness-Variablen VOR dem Serverstart bzw. pro Tool-Call
  einfrieren und dem Guard zugänglich machen; Zieldesign im Plan: der Guard
  vergleicht nicht mehr ausschließlich `_my_sid()` des Serverprozesses, sondern
  akzeptiert eine explizit übergebene Caller-SID (z.B.
  `AGENT_LOCK_SESSION_ID`-Umgebungsvariable, die der MCP-Client beim Tool-Call
  mitliefert bzw. die aus dem MCP-Request-Kontext stammt).
  **Kein `TICKET_LOCK_OVERRIDE=1`-Generalausweg** — der deaktiviert den Schutz
  auch gegen echte Fremdsessions.
- **T003284:** Heartbeat WIRD fortgeschrieben (die TTL ist nicht das Problem —
  interaktive Läufe sind planmäßig länger als 35 min). Dafür: ein
  `agent-lock.sh touch|renew <scope> <id>`-Subkommando (bzw. eine Refresh-Option
  im bestehenden check/check-and-claim-Pfad), das `heartbeat_at` des eigenen
  Locks aktualisiert; der Worktree-Write-Guard und der Ticket-Lock-Guard rufen
  es bei jedem Schreibzugriff auf, bevor sie den Besitz prüfen. Damit verlängert
  sich die TTL bei jeder aktiven Aktion, ohne dass ein Prozess im Hintergrund
  laufen muss.

## Steps

1. **RED.** Tests in `tests/spec/batch-ticket-ops-meta.bats` (Sammeldatei, wird
   in p6 angelegt — hier die Anforderungen festhalten):
   - `sid drift`: ein Lock mit Halter-SID X, geprüft mit explizit übergebener
     Caller-SID X (aber anderer Serverprozess-Umgebung) → gilt als "mine",
     Status-Schreibvorgang wird NICHT verweigert.
   - `heartbeat refresh`: nach `agent-lock.sh claim` + `touch/renew` ist
     `heartbeat_at` > `created_at`; ein Reap-Lauf nach simulietter TTL reapt
     den Lock NICHT.
   - `heartbeat write-guard`: Write-Guard-Besitzprüfung nach
     Heartbeat-Refresh passiert für den eigenen Worktree.

2. **GREEN.**
   - `scripts/agent-lock.sh`: Subkommando `touch`/`renew` (eigener Lock:
     `heartbeat_at` neu setzen, idempotent, kein `--force` nötig); `_reapable`
     unverändert (TTL-Check bleibt, aber Heartbeat wird jetzt am Leben
     gehalten).
   - `scripts/agent-lock-identity.sh`: Caller-SID-Übergabe unterstützen (neue
     Env-Variable z.B. `AGENT_LOCK_SESSION_ID` hat Vorrang vor der
     Prozessumgebung in `_my_sid`, analog zum AGENT_LOCK_SID-Test-Override).
   - `scripts/vda/ticket/_ticket-core.sh`: `_ticket_lock_guard` ruft vor der
     Prüfung `agent-lock.sh touch` auf (wenn der Lock der eigenen Caller-SID
     gehört) und vergleicht die Caller-SID statt der Serverprozess-SID.
   - `scripts/hooks/worktree-write-guard.sh`: Besitzprüfung refresht ebenfalls
     den Heartbeat des eigenen Locks (oder delegiert an `agent-lock.sh
     check-and-claim`/`touch`), damit aktive Arbeit den Lock nicht ablaufen
     lässt.

3. **Verifikation.** Fälle aus T003229 (Ticket-Write über MCP bei gehaltenem
   Lock) und T003284 (aktiver Worktree-Write nach >TTL-Dauer) laufen ohne
   Fehlschlag durch; Reap-Log zeigt keine `heartbeat-ttl`-Zeilen für aktive
   Locks.

## Acceptance

- Eigener Lock wird trotz MCP-Serverprozess als eigener erkannt (keine
  Fehlverweigerung von Status-Writes).
- Aktiver Worktree-Write wird nicht mehr durch abgelaufene Heartbeat-TTL
  ausgesperrt.
- Fremde Locks bleiben geschützt (keine Aufweichung des Besitzmodells — nur
  der Heartbeat wird erneuert und die Caller-SID akzeptiert).
