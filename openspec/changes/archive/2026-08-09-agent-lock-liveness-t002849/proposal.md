# Proposal: agent-lock-liveness-t002849

## Why

`scripts/agent-lock.sh` `_reapable()` Block 0b ("Worktree+branch match beats a dead/mismatched
SID", eingeführt für Session-Resumes [T002204], begrenzt auf frischen Heartbeat [T002513) prüft
für einen Lock, dessen Worktree existiert und dessen Branch zum HEAD des Worktrees passt, nur
den Heartbeat gegen die volle `AGENT_LOCK_TTL` (Default 1800s). Es prüft **nicht**, ob der im
Lock verzeichnete `owner_pid` noch lebt.

Am 2026-08-09 (T002849-Mishap) hielten sechs ticket-scoped Locks einer abgestürzten
ticket-ops-Session (`owner_sid=611671`, `owner_pid=611672`) — beide vom OS bestätigt tot
(`ps -p` lieferte nur die Kopfzeile). `agent-lock.sh reap` räumte sie nicht, weil Worktree und
Branch noch passten und der Heartbeat erst 12 von 1800 Sekunden alt war.
`scripts/openspec.sh propose` brach mit "Ticket T002836 ist gesperrt (agent-lock)" ab, obwohl
die Toten-Erkennung über die PID sofort möglich gewesen wäre.

Direkt oberhalb von Block 0b existiert bereits ein analoger Fast-Pfad für den Fall
"Worktree fehlt UND `owner_pid` tot" (Block 0a, `worktree-missing`, T002785 Befund 7) — mit
`AGENT_LOCK_GRACE` (Default 120s) als Schutzfenster gegen einen jungen, noch nicht
heartbeat-aktualisierten Claim. Block 0b fehlt das spiegelbildliche Gegenstück für "Worktree
vorhanden UND `owner_pid` tot".

**Zu lösendes Risiko:** Ein Session-Resume [T002204] startet einen neuen Prozess mit neuer
SID (und meist auch neuer PID), bevor die Lock-Datei mit der neuen PID aktualisiert wird — ein
naiver `_pid_alive`-Check gegen die alte, im Lock verzeichnete PID würde diesen Fall als "tot"
lesen und einen legitimen Resume fälschlich reapen. Block 0b wird überhaupt nur erreicht,
wenn die SID-Prüfung in Block 0 bereits fehlgeschlagen ist (Resume = neue SID) — die im Lock
stehende `owner_pid` gehört dann garantiert dem alten, beendeten Prozess, unabhängig davon ob
die Session abgestürzt ist oder sauber resumed hat. `_pid_alive` allein unterscheidet die
beiden Fälle daher grundsätzlich nicht.

Die Unterscheidung liegt stattdessen in der Zeit seit dem letzten Heartbeat: ein Resume
aktualisiert die Datei innerhalb kurzer Zeit erneut (neuer `claim`/`refresh`-Aufruf der neuen
Session), ein abgestürzter Halter tut das nie wieder. `AGENT_LOCK_GRACE` (120s) ist exakt das
bereits etablierte, in Block 0a verwendete Zeitfenster für "gerade erst geschrieben, Resume
könnte noch unterwegs sein". Der Fix spiegelt Block 0a: `owner_pid` tot + Worktree vorhanden +
Branch passt + Alter (seit `heartbeat_at`/`created_at`) ≥ `AGENT_LOCK_GRACE` → sofort reapen
(`pid-dead`, statt bis zu 30 Minuten auf `heartbeat-ttl` zu warten). Ein Resume, dessen neuer
Heartbeat innerhalb der Grace-Periode eintrifft, bleibt geschützt — identisch zum bereits
produktiven Verhalten von Block 0a.

**Nebenbefund T002826** ("agent-lock claim ticket returns exit 0 but lock not held" bei
gleichzeitigen Claims während ticket-ops Wave 0+1): 5 Läufe à 20 parallele
`claim ticket`-Aufrufe auf dieselbe Ticket-ID (100 Versuche gesamt) reproduzieren den Defekt
NICHT — in jedem Lauf gewinnt genau ein Aufruf (`exit=0`), alle übrigen scheitern mit `exit=1`,
und `check ticket` meldet danach konsistent den Gewinner als `held`. `cmd_claim` und `cmd_reap`
serialisieren beide über dieselbe `flock`-Kritische-Sektion (`_with_lock`), das schützt exakt
gegen die vermutete Race Condition. Ohne reproduzierbaren Defekt wird hier kein Fix konstruiert
(siehe Auftrag: "keinen Fix für einen nicht messbaren Defekt konstruieren"). T002826 bleibt als
offener, nicht reproduzierter Befund im Ticket dokumentiert und nachrangig gegenüber T002849.

## What

- `scripts/agent-lock.sh` `_reapable()` Block 0b ergänzt einen `_pid_alive`-Check: ist
  `owner_pid` tot UND das Alter seit `heartbeat_at`/`created_at` ≥ `AGENT_LOCK_GRACE`, reapt
  der Lock sofort (`_reap_log … pid-dead`) statt erst nach `AGENT_LOCK_TTL`. Ein frischer Claim
  (< `AGENT_LOCK_GRACE`) bleibt geschützt — Resume-Fenster unverändert.
- Neue BATS-Tests unter `tests/spec/factory-reclaim-lock-respect/` belegen sowohl den
  RED-Fall (aktuell: `held` trotz totem PID + gealtertem Claim) als auch den GREEN-Fall nach
  dem Fix sowie den Resume-Schutz (frischer Claim mit totem PID bleibt `held`).
- T002826 wird NICHT verändert — der Befund bleibt dokumentiert, kein Codepfad wird angefasst.

_Ticket: T002849_
