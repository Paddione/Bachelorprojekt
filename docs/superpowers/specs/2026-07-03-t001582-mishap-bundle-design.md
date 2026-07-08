# T001582 — Mishap-Bundle: agent-lock.sh, ticket.sh, vda.sh (3 Einträge) — Design

**Status:** approved (autonomous Fix-Pfad; root cause pre-established by mishap-tracker investigation, confirmed against current code on 2026-07-03).

## Kontext

Drei unabhängige, bereits root-verursachte Kleinbugs aus dem Mishap-Tracker, gebündelt in T001582:

1. `scripts/agent-lock.sh` — `_reapable()` reißt einen aktiv gehaltenen Claim ein, obwohl er
   kürzlich per `refresh` erneuert wurde.
2. `scripts/vda/ticket/create.sh` — ungültiger `--severity`-Wert verbrennt eine Ticket-ID.
3. `scripts/vda/ticket/get.sh` — ruft eine nicht definierte Funktion auf, druckt Stderr-Rauschen.

## M1 — agent-lock.sh: pid-dead/sid-dead reap muss `heartbeat_at` statt `created_at` als Altersbasis nutzen

**Root cause (verifiziert im Code, `scripts/agent-lock.sh`):** `_reapable()` berechnet in beiden
Zweigen (`pid-dead` Zeile ~127, `sid-dead` Zeile ~139) `age=$(( now - ${ct:-0} ))` mit `ct` =
`created_at` des Claims. `cmd_refresh()` aktualisiert bei jedem Refresh `heartbeat_at` und
`owner_pid` (neue PID des refreshenden Bash-Prozesses), lässt aber `created_at` unverändert
(`CREATED="$(_lock_field "$f" created_at)"` wird 1:1 durchgereicht). Ergebnis: Für einen Claim,
der vor > `AGENT_LOCK_GRACE` (120s) erstmals erstellt wurde und seither mehrfach refresht wurde,
ist `age` (gegen `created_at` gemessen) praktisch immer ≥ `AGENT_LOCK_GRACE` — der frisch
refreshte, aktiv gehaltene Claim wird beim nächsten `reap`-Sweep trotzdem als `pid-dead` (der
Owner-PID ist die transiente, längst beendete Bash-Instanz des letzten Refresh-Aufrufs) markiert
und gelöscht. Betrifft primär Sessions ohne den "immer alive"-Fastpath für nicht-numerische
Harness-SIDs (`CLAUDE_SESSION_ID`), z. B. Sessions mit numerischer Unix-SID (Agentic-Terminal/
ttyd-tmux-Kontext T001565, Factory-Pipelines ohne Harness-Env) — genau der "worktree whose owning
session is between shell commands"-Fall aus dem Ticket.

**Fix:** In beiden Reap-Zweigen `heartbeat_at` (falls vorhanden) statt `created_at` als
Altersbasis verwenden — Fallback auf `created_at` nur wenn `heartbeat_at` fehlt (Rückwärtskompat.
für ältere Claim-Dateien ohne das Feld). Ein Claim, der vor < `AGENT_LOCK_GRACE` zuletzt
geheartbeated wurde, gilt trotz totem PID/SID als nicht reapbar.

**Nicht-Regression:** Ein Claim mit totem PID/SID UND einem `heartbeat_at`, das älter als
`AGENT_LOCK_GRACE` ist, muss weiterhin gereapt werden (die bestehenden Reap-Gründe `pid-dead`,
`sid-dead`, `worktree-missing`, `heartbeat-ttl` bleiben inhaltlich unverändert, nur die
Altersmessbasis ändert sich).

## M2 — ticket.sh create: `--severity` vor der DB-Schreibaktion validieren

**Root cause (verifiziert, `scripts/vda/ticket/create.sh`):** `severity` wird ungeprüft in die
`INSERT`-Query interpoliert (`NULLIF(:'sev', '')`). Die DB hat eine CHECK-Constraint auf das Enum
`critical|major|minor|trivial`; ein ungültiger Wert lässt den INSERT fehlschlagen, aber
Postgres hat den `external_id`-Sequence-Wert bereits per `nextval()` verbraucht, bevor die
Constraint geprüft wird (Sequence-Advance ist nicht transaktional rückrollbar) — die ID ist
verbrannt.

**Fix:** Vor dem Aufruf von `_exec_sql` client-seitig validieren: leerer String bleibt erlaubt
(optionales Feld, entspricht `NULLIF`); ein nicht-leerer Wert muss exakt
`critical|major|minor|trivial` sein (case-sensitive — keine deutsche Übersetzung wie „hoch"
zulassen, das Enum ist Englisch). Bei Verstoß: Fehlermeldung mit der vollständigen Enum-Liste auf
stderr, `exit 2`, **kein** DB-Zugriff. Usage-/Help-Text von `ticket.sh` (Zeile 5,
`--severity <severity>`) um die vier erlaubten Werte ergänzen.

## M3 — vda.sh ticket get: fehlende Funktion `_ticket_offline_refuse_read`

**Root cause (verifiziert, `scripts/vda/ticket/get.sh` + `scripts/ticket.sh`):**
`get.sh` sourced nur `_ticket-core.sh` und ruft `_ticket_offline_refuse_read` auf. Diese Funktion
ist aber in `scripts/ticket.sh` definiert (Zeilen 54–60), einem Sibling-Top-Level-Skript, das
`get.sh` nicht sourced. Jeder `vda.sh ticket get`-Aufruf schlägt daher mit
`command not found` auf stderr fehl (JSON auf stdout bleibt korrekt, da `set -e` hier nicht
greift und der `if`-Test lediglich einen nicht-null-Exitcode/Fehler produziert).

**Fix:** `_ticket_offline_refuse_read` UND ihr Pendant `_ticket_offline_skip` in
`scripts/vda/ticket/_ticket-core.sh` verschieben (einzige Quelle der Wahrheit). `scripts/ticket.sh`
sourced `_ticket-core.sh` bereits (Zeile 42) — die dortigen Duplikate werden entfernt, kein
Verhaltensunterschied für `ticket.sh`. `scripts/vda/ticket/get.sh` bekommt die Funktion damit
transitiv über sein bestehendes `source _ticket-core.sh`.

**Out of scope:** `scripts/lib/ticket-links.sh` hat einen eigenen, strukturell ähnlichen
`TICKET_OFFLINE`-Inline-Check — wird hier nicht angefasst (separates Ticket bei Bedarf).

## Tests

Ein konsolidiertes BATS-File `tests/spec/t001582-mishap-bundle.bats` (Konvention: siehe
`tests/spec/t001415-mishap-bundle.bats` als Vorlage), mit je mindestens einem Red-Test pro Mishap:

- M1: Claim mit altem `created_at`, frischem `heartbeat_at`, totem `owner_pid` → darf NICHT
  gereapt werden (aktuell: wird gereapt → FAIL). Plus Regressionstest: Claim mit altem
  `created_at` UND altem `heartbeat_at`, totem `owner_pid` → MUSS weiterhin gereapt werden
  (aktuell bereits grün, bleibt grün).
- M2: `ticket.sh create --severity hoch ...` (ohne DB) muss vor jeglichem DB-Zugriff mit
  `exit 2` und einer Fehlermeldung fehlschlagen, die alle vier Enum-Werte nennt (aktuell: kein
  clientseitiger Check vorhanden → FAIL, da Skript ohne Validierung durchläuft bis zum
  DB-Zugriffsversuch).
- M3: `grep`-basierter Testfall, der bestätigt, dass `_ticket_offline_refuse_read` in
  `_ticket-core.sh` definiert ist UND dass `get.sh` sie über `_ticket-core.sh` erreicht (kein
  Duplikat in `ticket.sh` mehr nötig) — aktuell FAIL, da die Funktion nicht in `_ticket-core.sh`
  steht.
