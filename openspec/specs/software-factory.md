# software-factory

<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-06-20 -->

## Purpose

Die Software Factory ist ein autonomes, mehrstufiges Pipeline-System, das Feature-Tickets
vom Backlog bis zum Production-Deploy verarbeitet. Sie besteht aus drei Kernkomponenten:
dem **Dispatcher** (Queue-Poll, Slot-Management, Tick-Orchestrierung), der **Pipeline**
(6-Phasen Scout→Design→Plan→Implement→Verify→Deploy pro Feature) und dem **Watchdog**
(Stale-Eskalation, Slot-Freigabe, Zombie-Cleanup). Der Autopilot läuft als systemd-USER-Timer
auf dem WSL-Host ohne offene Claude-Code-Session.

---

## Requirements

### Requirement: Dispatcher-Tick-Execution

The system SHALL execute exactly one Dispatcher tick per Timer-Aktivierung via `wakeup.sh`
under a `flock`-Sperre, sodass simultane Ticks ausgeschlossen sind. Der Timer re-armt erst
nach Tick-Ende (`OnUnitInactiveSec=10min`), und `RuntimeMaxSec=900s` killt hängende Runs.

#### Scenario: Normaler Tick ohne parallele Instanz
- **GIVEN** der systemd-Timer `factory.timer` feuert
- **WHEN** keine andere Factory-Instanz läuft (`/tmp/factory-tick.lock` frei)
- **THEN** `wakeup.sh` erwirbt die flock-Sperre, entsperrt git-crypt und startet `claude -p` mit `dispatcher.js`

#### Scenario: Paralleler Start während laufendem Tick
- **GIVEN** ein Factory-Tick ist aktiv (flock-Sperre gehalten)
- **WHEN** der Timer erneut feuert (z.B. nach Reboot mit `Persistent=true`)
- **THEN** `wakeup.sh` beendet sich ohne Aktion (flock blockiert); kein doppelter Dispatch

---

### Requirement: Queue-Poll und Slot-Claim

The system SHALL poll the backlog per brand every tick and SHALL account slot
usage as `SUM(slot_count)` over all `in_progress` tickets with a set
`pipeline_slot` (the `pipeline_slot` column remains as the "holds slots" marker).
A single-slot claim (`slot_count=1`, the default) SHALL behave exactly like the
legacy claim. A gang claim (`slots.sh claim-gang <ext_id> <n>`) SHALL be one
atomic SQL statement that succeeds only when
`SUM(slot_count) + n <= FACTORY_SLOTS_PER_BRAND`; on failure it SHALL exit 1 and
claim nothing (all-or-nothing). A claim only succeeds while
`pipeline_slot IS NULL` and `status IN ('backlog','triage','plan_staged')` —
race-safe. `slots.sh release` SHALL reset both `pipeline_slot` to NULL and
`slot_count` to 1. `schedule.sh` SHALL apply head-of-line blocking: if the
front-most queue candidate needs `n` slots and fewer than `n` are free, NO
lower-ranked ticket is pulled ahead in that tick (prevents gang starvation).

#### Scenario: Feature aus dem Backlog schedulen

- **GIVEN** brand `mentolder` has 2 of 3 slots free and ticket T000500 in status `backlog` with `slot_count=1`
- **WHEN** the dispatcher runs `schedule.sh`
- **THEN** T000500 is claimed via `claim-gang` with n=1, receives a `pipeline_slot` and `status=in_progress`; the UPDATE returns the slot number

#### Scenario: Gang claim succeeds when the pool fits

- **GIVEN** brand `mentolder` has 3 of 3 slots free and ticket T000600 staged with `slot_count=3`
- **WHEN** `slots.sh claim-gang T000600 3` runs
- **THEN** the claim succeeds atomically, `SUM(slot_count)` over `in_progress` tickets becomes 3, and T000600 is `in_progress`

#### Scenario: Gang claim is all-or-nothing

- **GIVEN** brand `mentolder` has only 2 of 3 slots free
- **WHEN** `slots.sh claim-gang T000600 3` runs
- **THEN** the command exits 1 and NO row is changed — T000600 keeps `pipeline_slot IS NULL` and its previous status

#### Scenario: Head-of-line blocking prevents gang starvation

- **GIVEN** the front-most queue candidate T000600 needs 3 slots, only 2 are free, and a later candidate T000601 needs 1 slot
- **WHEN** `schedule.sh` runs
- **THEN** the loop breaks at T000600 and T000601 is NOT claimed in this tick

#### Scenario: Release resets the gang accounting

- **GIVEN** ticket T000600 holds a gang claim with `slot_count=3`
- **WHEN** `slots.sh release T000600` runs
- **THEN** `pipeline_slot` becomes NULL and `slot_count` is reset to 1

### Requirement: Kill-Switch und Daily-Cap Guards

The system SHALL vor jedem Launch zwei FAIL-CLOSED Guards prüfen: den globalen/per-Brand
Kill-Switch und das tägliche Deploy-Cap. Bei Lese-Fehler oder ungesetztem Cap gilt der
Guard als ausgelöst (Paused/Reached). Kein Feature wird gestartet, bis beide Guards `off`/
unterhalb des Caps melden.

#### Scenario: Kill-Switch global aktiviert
- **GIVEN** `factory-control killswitch` hat den Wert `on` für `brand=NULL` (global)
- **WHEN** der Dispatcher `guard_killswitch_on` aufruft
- **THEN** der Guard returnt exit 0 (ON); kein Feature wird in diesem Tick gestartet

#### Scenario: Tages-Cap überschritten
- **GIVEN** `FACTORY_DAILY_DEPLOY_CAP=5` und Brand `mentolder` hat heute bereits 5 Deploys
- **WHEN** `guard_daily_cap_reached mentolder` aufgerufen wird
- **THEN** der Guard returnt exit 0 (Reached); das Feature wird auf `blocked` gesetzt und sein Slot freigegeben

---

### Requirement: 6-Phasen-Pipeline mit Komplexitäts-Routing

The system SHALL jedes Feature durch eine sequenzielle 6-Phasen-Pipeline führen
(Scout → Design → Plan → Implement → Verify → Deploy) und dabei die Phase Design und Plan
bei `complexity=simple` überspringen (Fast-Path).

#### Scenario: Einfaches Feature (Fast-Path)
- **GIVEN** `scout.sh` klassifiziert das Feature als `complexity=simple`
- **WHEN** die Pipeline Phase Scout abschließt
- **THEN** Design und Plan werden übersprungen; die Pipeline geht direkt zu Implement

#### Scenario: Komplexes Feature (Full-Path)
- **GIVEN** `scout.sh` klassifiziert das Feature als `complexity=complex`
- **WHEN** die Pipeline Phase Scout abschließt
- **THEN** Design erzeugt eine Spec, Plan dekomponiert sie in Tasks mit disjunkten Target-Files, Implement führt jeden Task sequenziell aus

---

### Requirement: Konflikt-Gate vor Implementierung

The system SHALL vor der Implementierungsphase per `conflict-check.sh` prüfen, ob die
geplanten `touched_files` des Features mit den aktiven `in_progress`-Features anderer Brands
überlappen. Bei Überlappung wird die Pipeline sofort geblockt und der Slot freigegeben.

#### Scenario: Kein Datei-Overlap
- **GIVEN** T000501 berührt `website/src/pages/foo.astro` und kein anderes `in_progress`-Feature hat diese Datei
- **WHEN** `conflict-check.sh T000501 <files>` aufgerufen wird
- **THEN** Exit 0; Pipeline fährt fort mit Implement

#### Scenario: Datei-Overlap mit laufendem Feature
- **GIVEN** T000502 und das aktuell implementierte T000501 berühren beide `k3d/configmap-domains.yaml`
- **WHEN** `conflict-check.sh T000502` während T000501 `in_progress` ist aufgerufen wird
- **THEN** Exit 1; Pipeline setzt T000502 auf `backlog`, gibt den Slot frei und sendet PushNotification

---

### Requirement: Build-Loop mit Self-Healing CI

The system SHALL nach einem CI-Fehlschlag automatisch bis zu `FACTORY_BUILD_LOOP_MAX`
(Default 3) Korrektur-Iterationen durchführen, aber nur wenn die Failure-Klasse in
`{ci, test, lint, freshness}` liegt UND die geänderten Pfade nicht zur Eskalations-Klasse
`{sealedsecret, secret, realm, sql, manifest}` gehören. Bei idempotenten Fehlern
(gleicher Log-Hash) oder nach Ausschöpfen der Iterationen wird die Pipeline geblockt.

#### Scenario: CI-Fehlschlag der Klasse `test`
- **GIVEN** CI schlägt fehl; `classify_failure` ergibt `test`; geänderte Pfade enthalten keine `.sql`/`k3d/`/`realm*.json`-Dateien
- **WHEN** Build-Loop Iteration 1 wird gestartet
- **THEN** der Agent führt den kleinsten Fix durch, committed und pushed; `retry-count` wird inkrementiert; CI wird neu beobachtet

#### Scenario: CI-Fehlschlag der Klasse `secret` (Eskalations-Gate)
- **GIVEN** CI schlägt fehl; `classify_failure` ergibt `sealedsecret`
- **WHEN** Build-Loop die Failure-Klasse prüft
- **THEN** Gate 1 (ALLOWED_CLASSES) schlägt fehl; Pipeline wird sofort geblockt; kein Auto-Fix-Versuch

#### Scenario: Idempotenter Fehler (kein Fortschritt)
- **GIVEN** zwei aufeinanderfolgende Build-Loop-Iterationen produzieren denselben Log-Hash
- **WHEN** `decide()` den Hash-Vergleich durchführt
- **THEN** action=`abort`, reason=`no-progress`; Pipeline wird geblockt

---

### Requirement: Adversariales Review-Panel mit Risk-Tiering

The system SHALL in der Verify-Phase den Diff mit `classify-risk.sh` in einen Risk-Tier
(`trivial|lite|full`) einordnen und entsprechend 1, 3 oder 5 Review-Lenses parallel
ausführen. Bei Risk-Tier `full` koordiniert ein Coordinator-Agent die Lens-Ergebnisse zu
einem Gesamt-Verdict. Blocking-Findings (Severity `high`/`critical` oder Verdict
`requested_changes`) stoppen die Pipeline.

#### Scenario: Triviale Änderung (nur Docs)
- **GIVEN** `classify-risk.sh` gibt `{"tier":"trivial"}` zurück
- **WHEN** die Verify-Phase die Lenses startet
- **THEN** nur die `bug`-Lens wird ausgeführt; Security/Pattern/Perf/AGENTS.md-Lenses werden übersprungen

#### Scenario: Full-Risk-Änderung mit kritischem Finding
- **GIVEN** Risk-Tier `full`; die Security-Lens findet ein Finding mit `severity=critical`
- **WHEN** der Coordinator das Verdict ableitet
- **THEN** Coordinator-Verdict = `requested_changes`; Pipeline setzt Ticket auf `blocked`; PushNotification wird gesendet

---

### Requirement: Watchdog-Eskalation und Zombie-Cleanup

The system SHALL pro Tick stale `in_progress`-Tickets (kein `updated_at`-Update seit
`FACTORY_STALE_MIN` Minuten, Default 30) prüfen, ob bereits ein `FACTORY-PLAN-REF`-Kommentar
(`plan_ref` via `ticket.sh get`) existiert, und den Slot in jedem Fall freigeben sowie den
verwaisten Worktree entfernen.

Zusätzlich SHALL das System pro stale erkanntem Ticket einen Versuchszähler unter dem Key
`factory_attempt:<external_id>` in `tickets.factory_control` fortschreiben. Der Zähler
SHALL mit einem **non-NULL `brand`**-Wert geschrieben werden, weil `factory_control` ein
`UNIQUE (key, brand)` trägt und Postgres NULL-Werte darin als distinct behandelt — eine
NULL-Brand-Zeile lässt `ON CONFLICT` nie feuern und würde Duplikate ansammeln. Die
Fortschreibung SHALL echten Fortschritt von Stillstand unterscheiden: existiert ein
`tickets.factory_phase_events`-Eintrag, dessen `at` neuer ist als das `updated_at` des
Zählers, SHALL der Zähler auf `1` zurückgesetzt werden; andernfalls SHALL er um `1` erhöht
werden. `tickets.updated_at` SHALL für diesen Vergleich NICHT verwendet werden, da
`fn_lifecycle_ts` es bei jedem Zeilen-Write erhöht und ein reiner `touch` damit als
Fortschritt erschiene.

Solange der Zähler unter `FACTORY_MAX_ATTEMPTS` (Default 3) liegt, gilt das bisherige
Reset-Verhalten:

- Existiert **kein** `plan_ref` (noch nie geplant), setzt das System den Status auf `triage`
  zurück (unverändertes Verhalten).
- Existiert bereits ein `plan_ref` und `type='feature'`, setzt das System den Status auf
  `backlog` zurück, statt die bereits geleistete Planungsarbeit über `triage` zu verwerfen —
  das Ticket re-qualifiziert sich direkt für `queue.sh`s Dispatch-Gate (bleibt
  `lastenheft_locked`) und `pipeline.mjs` erkennt `FACTORY-PLAN-REF` beim nächsten Dispatch
  automatisch, überspringt Scout/Design/Plan und setzt bei Implement fort.
- Existiert bereits ein `plan_ref` und `type='task'`, setzt das System den Status auf
  `plan_staged` zurück (matcht `queue.sh`s bestehenden Task-Dispatch-Pfad).

Erreicht der Zähler `FACTORY_MAX_ATTEMPTS`, SHALL das System statt eines weiteren Resets
`ticket.sh unfactory` aufrufen. Slot-Freigabe und Zombie-Worktree-Cleanup SHALL dabei
unverändert weiterlaufen — die Eskalation ersetzt ausschließlich das Status-Ziel.

Ist der Zähler nicht lesbar oder nicht schreibbar, SHALL sich der Watchdog wie ohne Zähler
verhalten (Reset auf `triage`/`backlog`/`plan_staged`) und den Fehler protokollieren. Ein
Datenbankproblem SHALL NICHT dazu führen, dass Tickets in den Terminalzustand versetzt
werden.

`awaiting_deploy`-Features ohne Deployment seit `FACTORY_AD_STALE_H` Stunden (Default 24)
werden mit `attention_mode=needs_human` markiert und erhalten einen Warn-Kommentar
(unverändert).

#### Scenario: Hung Pipeline ohne gestagten Plan (kein Phase-Heartbeat)
- **GIVEN** Ticket T000503 ist seit 35 Minuten `in_progress` ohne `ticket.sh touch`-Update
  und ohne `FACTORY-PLAN-REF`-Kommentar
- **WHEN** `watchdog.sh` ausgeführt wird (FACTORY_STALE_MIN=30)
- **THEN** T000503 erhält `status=triage`; `pipeline_slot=NULL`; ein Kommentar wird hinzugefügt; der Worktree `/tmp/wt-sf-t000503` wird entfernt

#### Scenario: Hung Pipeline MIT bereits gestagtem Plan (Feature)
- **GIVEN** Ticket T001828 (`type=feature`) ist seit 50 Minuten `in_progress` ohne
  `ticket.sh touch`-Update, trägt aber einen `FACTORY-PLAN-REF`-Kommentar von einem
  abgeschlossenen `dev-flow-plan`-Lauf
- **WHEN** `watchdog.sh` ausgeführt wird (FACTORY_STALE_MIN=30)
- **THEN** T001828 erhält `status=backlog` (nicht `triage`); `pipeline_slot=NULL`; ein
  Kommentar verweist auf den bereits vorhandenen Plan; der nächste Dispatcher-Tick claimed
  erneut einen Slot und `pipeline.mjs` fährt bei Implement fort, statt Scout/Design/Plan zu
  wiederholen

#### Scenario: Versuchszähler steigt bei Stillstand ohne Phase-Event
- **GIVEN** Ticket T002338 (`type=task`, `plan_ref` vorhanden) ist stale, sein Zähler
  `factory_attempt:T002338` steht auf `1`, und seit dem Zähler-Write existiert kein neuerer
  `factory_phase_events`-Eintrag
- **WHEN** `watchdog.sh` ausgeführt wird (FACTORY_MAX_ATTEMPTS=3)
- **THEN** der Zähler steht auf `2`; T002338 erhält `status=plan_staged`; der Slot ist frei

#### Scenario: Versuchszähler wird durch echten Fortschritt zurückgesetzt
- **GIVEN** Ticket T002338 ist stale, sein Zähler steht auf `2`, und es existiert ein
  `factory_phase_events`-Eintrag, dessen `at` neuer ist als das `updated_at` des Zählers
- **WHEN** `watchdog.sh` ausgeführt wird
- **THEN** der Zähler steht auf `1` statt auf `3`; T002338 wird nicht eskaliert

#### Scenario: Eskalation bei Erreichen von FACTORY_MAX_ATTEMPTS
- **GIVEN** Ticket T002338 ist stale, sein Zähler steht auf `2`, es gibt keinen neueren
  `factory_phase_events`-Eintrag, und `FACTORY_MAX_ATTEMPTS=3`
- **WHEN** `watchdog.sh` ausgeführt wird
- **THEN** `ticket.sh unfactory --id T002338` wird aufgerufen; der Status wird NICHT auf
  `plan_staged` zurückgesetzt; `pipeline_slot=NULL` und der Zombie-Worktree-Cleanup laufen
  trotzdem

#### Scenario: Stale awaiting_deploy
- **GIVEN** Ticket T000504 ist seit 26 Stunden im Status `awaiting_deploy`
- **WHEN** `watchdog.sh` ausgeführt wird (FACTORY_AD_STALE_H=24)
- **THEN** T000504 erhält `attention_mode=needs_human` und einen Warn-Kommentar; der Status bleibt `awaiting_deploy`

### Requirement: Canary-Rollout und Dark-Launch-Feature-Flags

The system SHALL neue Features standardmäßig hinter einem Feature-Flag
(`isFeatureEnabled(brand, slug)`, Default OFF) deployen und nach dem Merge einen
Layer-4-Canary-Rollout pro Brand durchführen. Bei CANARY_RED eines Brands wird das
Feature-Flag für diesen Brand deaktiviert und das Ticket auf `blocked` gesetzt.

#### Scenario: Erfolgreicher Canary-Rollout
- **GIVEN** PR ist gemergt; `observe_prod mentolder <image>:<timestamp>` meldet keine Fehler
- **WHEN** der Deploy-Agent den Canary-Check abschließt
- **THEN** kein CANARY_RED; Feature-Flags bleiben wie konfiguriert; Ticket geht auf `qa_review`

#### Scenario: Canary-Fehler auf einem Brand
- **GIVEN** Canary-Rollout auf `korczewski` produziert CANARY_RED
- **WHEN** der Deploy-Agent den Canary-Rückgabewert auswertet
- **THEN** Feature-Flag für `korczewski` wird auf `enabled=false` gesetzt; Ticket auf `blocked`; PushNotification mit Titel "Factory: canary RED" wird gesendet

---

### Requirement: OpenTelemetry-Observability (Fire-and-Forget)

The system SHALL pro Tick und pro Pipeline-Phasen-Übergang OTLP-Metriken und Spans an
den On-Prem OTel-Collector emittieren (`otel-emit.cjs`/`otel-emit.sh`). Telemetrie ist
**fire-and-forget** und darf niemals einen Tick oder eine Phase zum Scheitern bringen.
Bei fehlendem `OTEL_EXPORTER_OTLP_ENDPOINT` oder gesetztem `OTEL_SDK_DISABLED=true`
sind alle Emit-Calls no-ops.

#### Scenario: OTel-Endpoint nicht erreichbar
- **GIVEN** `OTEL_EXPORTER_OTLP_ENDPOINT` ist gesetzt, aber der Collector ist offline
- **WHEN** `otel-emit.sh metric factory.tick.count 1` aufgerufen wird
- **THEN** der Emit-Aufruf schlägt still fehl; der Tick wird normal beendet; kein Fehler im Dispatcher-Log

#### Scenario: OTel-SDK deaktiviert
- **GIVEN** `OTEL_SDK_DISABLED=true` ist gesetzt
- **WHEN** `otel-emit.cjs` `emitPhase('scout', 'done', ...)` aufruft
- **THEN** der Aufruf ist ein no-op; keine Netzwerk-Anfrage wird gemacht

---

### Requirement: Code-Quality-Gate Loop mit Dedup und Throttle

The system SHALL run `scripts/code-quality/loop.sh` to create tickets for code-quality gate violations, deduplicating by checking for existing open tickets per group title, capping new ticket creation per run via `MAX_NEW`, and supporting `DRY_RUN=1` mode that prints groups without creating any tickets or side effects.

#### Scenario: DRY_RUN-Modus verhindert Ticket-Erstellung
- **GIVEN** `DRY_RUN=1` ist gesetzt; zwei Violation-Gruppen (S1:website, S3:infra-manifests) sind vorhanden
- **WHEN** `loop.sh` ausgeführt wird
- **THEN** Ausgabe enthält beide Gruppen-Titel und `[DRY_RUN]`; `ticket.sh create` wird nicht aufgerufen; kein `ticket_calls.log` wird angelegt

#### Scenario: Dedup verhindert Duplikat-Tickets
- **GIVEN** ein offenes Ticket mit Titel `CQ-GATE:S1:website — 15 Dateien kürzen` existiert bereits in der DB (psql-Stub gibt diesen Titel zurück)
- **WHEN** `loop.sh` mit `MAX_NEW=2` und beiden Gruppen läuft
- **THEN** nur ein neues Ticket (S3:infra-manifests) wird erstellt; S1:website wird übersprungen; `MAX_NEW=1` begrenzt auf exakt ein Ticket unabhängig von der Gruppen-Anzahl

---

### Requirement: Skill-Orchestrator Pre/Post Hook Execution

The system SHALL parse a skill YAML frontmatter for `hooks.pre` and `hooks.post` arrays, execute each listed hook script in order when invoked with the corresponding phase, and continue gracefully when a hook script file does not exist.

#### Scenario: Pre-Hooks werden ausgeführt, Post-Hooks nicht
- **GIVEN** Skill-Datei hat `hooks.pre: [test-pre-hook]` und `hooks.post: [test-post-hook]`
- **WHEN** `skill-orchestrator.sh <skill-file> pre` aufgerufen wird
- **THEN** Ausgabe enthält `"pre-hook-executed"`; `"post-hook-executed"` erscheint NICHT in der Ausgabe

#### Scenario: Fehlendes Hook-Script wird übergangen
- **GIVEN** Skill-Datei referenziert `non-existent-hook` zusätzlich zu `test-pre-hook`
- **WHEN** `skill-orchestrator.sh <skill-file> pre` aufgerufen wird
- **THEN** Exit 0; der vorhandene `test-pre-hook` wird ausgeführt; fehlende Scripts werden ohne Fehler übersprungen

---

### Requirement: Agent-Kollisionserkennung bei parallelen Edits

The system SHALL detect when a live peer agent has in-flight modifications to the same files as the
current session. In-flight means the union of the peer's committed branch divergence
(`<base>...HEAD`, three-dot), its unstaged changes and its staged changes — a peer that has already
committed its work MUST still be reported. Peer liveness SHALL follow the same rule as
`agent-lock.sh`: non-numeric (harness-provided) session IDs count as alive because `pgrep -s` cannot
resolve them; numeric session IDs remain `pgrep`-verified. Files whose blob in the peer worktree is
identical to the blob in the base branch SHALL be dropped, so squash-merged branches stop warning.
`--staged` checks staged files, `--all` additionally unstaged, `--branch` the current session's own
committed branch divergence. On collision: exit 1 with a `COLLISION` line naming the file;
`--quiet` suppresses the lines but keeps the exit code; dead or own sessions are ignored. Every git
operation that fails degrades to "no data" (fail-open, exit 0) rather than blocking.

#### Scenario: Überlappende Staged-Datei ergibt Kollision
- **GIVEN** Peer-Session 2222 ist als lebendig markiert und hat `shared.txt` in Worktree B modifiziert; Session 1111 staged `shared.txt` in Worktree A
- **WHEN** `agent-collision.sh check --staged` in Worktree A ausgeführt wird
- **THEN** Exit 1; Ausgabe enthält `COLLISION` und `shared.txt`; `--quiet` gibt Exit 1 ohne Ausgabe

#### Scenario: Tote Session und fehlender Worktree sind fail-open
- **GIVEN** Peer-Session 2222 ist NICHT in `AGENT_LOCK_FAKE_ALIVE` (tot); oder Peer-Worktree-Pfad existiert nicht mehr
- **WHEN** `agent-collision.sh check --staged` ausgeführt wird
- **THEN** Exit 0 in beiden Fällen; eigene SID (1111) als Peer-Claim ergibt ebenfalls Exit 0 (keine Selbst-Kollision)

#### Scenario: Harness-SID ohne pgrep-Auflösung gilt als lebendig
- **GIVEN** ein Peer-Claim mit nicht-numerischer Session-ID (UUID) und einer überlappenden Datei; `AGENT_LOCK_FAKE_ALIVE` ist NICHT gesetzt
- **WHEN** `agent-collision.sh check --staged` ausgeführt wird
- **THEN** Exit 1 mit `COLLISION`; eine numerische, nicht existente Session-ID ergibt unter denselben Bedingungen Exit 0

#### Scenario: Committete Peer-Arbeit ist sichtbar
- **GIVEN** der Peer hat seine Änderung an `shared.txt` bereits committed, sein Working Tree ist sauber
- **WHEN** `agent-collision.sh check --staged` mit derselben Datei staged ausgeführt wird
- **THEN** Exit 1 mit `COLLISION` und `shared.txt`; eine committete Peer-Änderung an einer anderen Datei ergibt Exit 0

#### Scenario: Squash-gemergter Peer warnt nicht mehr
- **GIVEN** der Peer hat `shared.txt` committed und derselbe Inhalt steht inzwischen über einen eigenen Commit in `main`, sodass die Blobs identisch sind
- **WHEN** `agent-collision.sh check --staged` ausgeführt wird
- **THEN** Exit 0; solange der Peer-Blob dagegen von `main` abweicht, ergibt derselbe Aufruf Exit 1

#### Scenario: --branch prüft die eigene Branch-Divergenz
- **GIVEN** die eigene Änderung an `shared.txt` ist bereits committed und nichts ist staged; ein lebender Peer hat dieselbe Datei in Arbeit
- **WHEN** `agent-collision.sh check --branch` ausgeführt wird
- **THEN** Exit 1 mit `shared.txt`; `--staged` ergibt im selben Zustand Exit 0; `--branch --quiet` gibt Exit 1 ohne Ausgabe; ein fehlender Peer-Worktree ergibt Exit 0

### Requirement: Inter-Agent Message Channel

The system SHALL provide an append-only JSONL message bus (`agent-msg.sh`) that supports `post` (broadcast oder `--to <sid>` gerichtet), `read --unread` (Cursor pro SID, jede Nachricht einmalig zugestellt), `read --mine` (nur an diese SID gerichtete oder Broadcasts) und `tail`. Nachrichten über 4 KB werden auf stderr gewarnt und auf 4096 Zeichen gekürzt.

#### Scenario: Post-Read Roundtrip und Cursor-Isolation
- **GIVEN** Session 1111 postet `"first"` und `"second"`
- **WHEN** Session 2222 `read --unread` zweimal aufruft
- **THEN** erster Aufruf liefert beide Nachrichten; zweiter Aufruf gibt leere Ausgabe; Session 3333 erhält denselben Broadcast unabhängig (eigener Cursor)

#### Scenario: Gerichtete Nachricht und Truncation
- **GIVEN** Session 1111 postet `"for two" --to 2222`
- **WHEN** Session 3333 `read --mine` aufruft
- **THEN** die Nachricht erscheint NICHT bei Session 3333; Broadcast ohne `--to` erscheint bei allen; Texte >4 KB werden auf ≤4096 Zeichen gekürzt mit Warn-Ausgabe

---

### Requirement: Ops-Agent Output-Trust Discipline

The system SHALL ensure the `bachelorprojekt-ops` agent system prompt contains an explicit output-trust / shell-session-integrity section that warns about echoed-input and stale PTY buffer conditions, forbids fabricating a diagnosis from unverified output, prescribes a trivial verifiable probe (`kubectl get nodes --context fleet`), and instructs the agent to surface a broken environment rather than continue operating.

#### Scenario: System-Prompt enthält Output-Trust-Sektion
- **GIVEN** die Datei `.claude/agents/bachelorprojekt-ops.md` existiert
- **WHEN** sie auf einen Header `## Output-Trust` / `Shell-Session-Integrity` geprüft wird
- **THEN** der Header ist vorhanden; der Text warnt vor desynchronisierten Shells/echoed input; der Trivialprobe-Befehl `kubectl get nodes --context fleet` ist literal enthalten

#### Scenario: Fabrication-Verbot ist explizit formuliert
- **GIVEN** der Ops-Agent erhält unverifizierten Shell-Output
- **WHEN** der Prompt auf das Fabrication-Verbot geprüft wird
- **THEN** mindestens eine Formulierung mit `never`/`do not`/`don't` und `fabricat`/`diagnos`/`trust` ist vorhanden; der Prompt instruiert, die defekte Umgebung zu melden statt weiterzumachen

---

### Requirement: git-crypt-sicheres Worktree-Create

The system SHALL create Git worktrees via `scripts/worktree-create.sh` that bypass the `git-crypt` smudge/clean filter failure (which causes plain `git worktree add` to exit 128) by neutralizing `filter.git-crypt.clean=cat` und `filter.git-crypt.required=false` im per-Worktree-Config, sodass Commits und Follow-up-git-Ops gelingen. Bei vorhandenem Key werden Secrets entschlüsselt; ohne Key bleibt der Worktree benutzbar.

`node_modules` SHALL be provisioned by symlink from the base checkout — both the repository root and **every pnpm workspace package**, discovered by its `pnpm-workspace.yaml` marker (`website/`, `brett/`, `mentolder-web/`, …) rather than by a hardcoded package list. A hardcoded website-only symlink leaves every other pnpm-managed package without dependencies in the worktree, which breaks `task test:changed` with "module not found" whenever the touched package is not `website/`.

Because the linked `node_modules` reflect whatever the **source checkout** has installed for *its* currently checked-out branch, `worktree-create.sh` SHALL emit a warning when the source checkout sits on a different branch than the new worktree — a dependency mismatch must surface at creation time instead of failing opaquely in a later test run. A missing `node_modules` in the source checkout SHALL remain a non-error.

#### Scenario: Entschlüsselter Worktree im unlocked Repo
- **GIVEN** das Haupt-Checkout hat einen gültigen git-crypt Key unter `.git/git-crypt/keys/default`
- **WHEN** `worktree-create.sh feature/x <path> HEAD` ausgeführt wird
- **THEN** Exit 0; `<path>/secret/data.yaml` enthält den entschlüsselten Wert; `git status` im Worktree gibt Exit 0; `filter.git-crypt.clean=cat` und `filter.git-crypt.required=false` sind im Worktree-Config gesetzt

#### Scenario: Locked Repo und node_modules Provisioning
- **GIVEN** kein Key vorhanden (gesperrtes Repo); Basis-Checkout hat `node_modules/cheerio/`
- **WHEN** `worktree-create.sh fix/z <path> HEAD` ausgeführt wird
- **THEN** Exit 0; Worktree ist benutzbar (`git status` Exit 0); `node_modules/cheerio/package.json` ist über Symlink erreichbar; fehlendes `node_modules` im Basis-Checkout führt zu keinem Fehler

#### Scenario: Non-website workspace package gets its node_modules

- **GIVEN** the source checkout has `brett/pnpm-workspace.yaml` and `brett/node_modules/` installed
- **WHEN** `worktree-create.sh fix/y <path> HEAD` runs
- **THEN** Exit 0 and `<path>/brett/node_modules` resolves through a symlink to the source checkout's `brett/node_modules`, alongside the root `node_modules` symlink

#### Scenario: Branch mismatch between source checkout and new worktree

- **GIVEN** the source checkout is on branch `main` and a worktree is created for `fix/other`
- **WHEN** `worktree-create.sh fix/other <path>` runs
- **THEN** Exit 0 and a warning on stderr names both branches and states that the linked `node_modules` may diverge from this branch

### Requirement: Brainstorm Extract-Choice

The system SHALL extract the last `choice` value from an events JSONL file via `scripts/brainstorm-extract-choice.sh`, returning exit 1 when no events file exists or when no entry with a `choice` field is present.

#### Scenario: Letzter Choice-Wert wird extrahiert
- **GIVEN** `events`-Datei enthält zwei Einträge: `choice=A` (timestamp 1) und `choice=B` (timestamp 2)
- **WHEN** `brainstorm-extract-choice.sh <dir>` aufgerufen wird
- **THEN** Exit 0; Ausgabe ist `B` (letzter Eintrag)

#### Scenario: Fehlende oder choicelose Events-Datei
- **GIVEN** kein `events`-File im Verzeichnis vorhanden; oder die Datei enthält nur `type=scroll`-Einträge ohne `choice`
- **WHEN** `brainstorm-extract-choice.sh <dir>` aufgerufen wird
- **THEN** Exit 1 in beiden Fällen

---

### Requirement: Brainstorm-Broker auf Dev-Host (kein Prod-Overlay)

The system SHALL route the brainstorm broker exclusively through the dev-stack sish on `*.dev.<domain>` (port 2222), with no dedicated `brainstorm-sish.yaml` manifest in `prod-mentolder/` or `prod-fleet/mentolder/`, and the brainstorm Taskfile SHALL target `${DEV_DOMAIN}` not `mentolder.de`.

#### Scenario: Kein Brainstorm-Manifest in Prod-Overlays
- **GIVEN** die Kustomize-Overlays `prod-mentolder/` und `prod-fleet/mentolder/`
- **WHEN** auf `brainstorm-sish`-Referenzen geprüft wird
- **THEN** keine `brainstorm-sish.yaml` Datei existiert; `kustomization.yaml` beider Overlays enthält keine `brainstorm-sish`-Referenz

#### Scenario: Brainstorm Taskfile targetet Dev-Domain und Port 2222
- **GIVEN** `Taskfile.brainstorm.yml` ist die Konfigurationsquelle
- **WHEN** auf Prod-Domain-Referenzen und den SSH-Port geprüft wird
- **THEN** `brainstorm.mentolder.de` und `${PROD_DOMAIN}` kommen nicht vor; `${DEV_DOMAIN}` ist vorhanden; Port `2222` (dev sish) ist referenziert; Port `32223` (entfernter Prod-NodePort) ist nicht vorhanden

---

### Requirement: Preflight PR-Scope-Validierung

The system SHALL validate a PR title's conventional-commit scope against the allowlist defined in `.github/workflows/ci.yml` before `gh pr create`. Titles with valid or absent scopes exit 0; invalid scopes exit non-zero with an error naming the allowlist and listing valid scopes; missing workflow file exits 2; breaking-change marker (`!`) is transparent.

#### Scenario: Gültiger und fehlender Scope
- **GIVEN** `commitlint.config.cjs` mit `website` in `namedScopes`
- **WHEN** `preflight-pr-scope.sh "feat(website): add dashboard"` aufgerufen wird
- **THEN** Exit 0; Titel ohne Scope (`"docs: update readme"`) gibt ebenfalls Exit 0 mit `"no scope"`-Meldung

#### Scenario: Ungültiger Scope wird abgewiesen
- **GIVEN** Scope `cockpit` ist nicht in der Allowlist
- **WHEN** `preflight-pr-scope.sh "feat(cockpit): add view"` aufgerufen wird
- **THEN** ungültiger Scope gibt Exit non-0 mit `"NOT in the semantic-PR allowlist"` und listet gültige Scopes; Breaking-Change `!` bei gültigem Scope gibt Exit 0

---

### Requirement: Superpowers-Collab und Submit Patch Idempotenz

The system SHALL apply runtime patches to the brainstorm helper.js and server.cjs via `superpowers-collab-patch.sh` and `superpowers-submit-patch.sh` that inject collaboration blocks, who-tags, broadcast relay, submit listener, and plan-review fields. Both patches SHALL be idempotent (re-running produces no diff), support `--check` (exit non-zero before patch, zero after), and abort with exit 2 when required server anchors are missing.

#### Scenario: Collab-Patch und Submit-Patch anwenden
- **GIVEN** `helper.js` und `server.cjs` enthalten die erwarteten Anker-Strings
- **WHEN** `superpowers-collab-patch.sh` und `superpowers-submit-patch.sh` jeweils einmalig ausgeführt werden
- **THEN** `helper.js` enthält `brainstorm-collab v1`, `event.who`, `brainstorm-submit v1`, `__brainstormSubmit`; `server.cjs` enthält `broadcast(event)`, `startSubmitListener`, `127.0.0.1`, `submission.json`; `--check` gibt Exit 0

#### Scenario: Idempotenz und fehlende Anker
- **GIVEN** beide Patches wurden bereits einmal angewendet
- **WHEN** die Scripts ein zweites Mal ausgeführt werden
- **THEN** `diff` zwischen altem und neuem Stand ist leer (kein Diff); fehlen erforderliche Anker in `server.cjs`, gibt `superpowers-submit-patch.sh` Exit 2

---

### Requirement: Release-Notes Subcommand Pipeline

The system SHALL provide a `vda/release-notes.sh` subcommand (dispatched via `vda.sh release-notes`) with sub-subcommands `generate`, `publish-github`, und `publish-changelog`. `generate` fällt bei fehlendem `gh`/`curl` auf `git log` zurück und produziert deterministisches Markdown; `publish-github` und `publish-changelog` erfordern `--notes-file` und geben Exit 2 wenn fehlend; `--dry-run` zeigt den Befehl ohne Ausführung; unbekannte Subcommands geben Exit 2.

#### Scenario: Generate mit gh-Stub und Offline-Fallback
- **GIVEN** ein `gh`-Stub gibt zwei PRs zurück (`dark mode`, `login redirect`)
- **WHEN** `release-notes.sh generate --since v1.0.0` mit `PATH` auf den Stub aufgerufen wird
- **THEN** Ausgabe enthält `# Release Notes`, `dark mode` und `login redirect`; ohne `gh` im PATH fällt `generate` auf `git log` zurück und gibt trotzdem `# Release Notes` aus; `--out <file>` schreibt in die Datei

#### Scenario: Publish-Subcommands Pflichtparameter und Dry-Run
- **GIVEN** keine `--notes-file` ist übergeben
- **WHEN** `release-notes.sh publish-github --tag v1.0.0` oder `publish-changelog` ohne `--notes-file` aufgerufen wird
- **THEN** beide geben Exit 2 mit `"--notes-file is required"`; `--dry-run` gibt Exit 0 und zeigt `DRY_RUN` sowie `gh release edit`; fehlende Notes-Datei bei `publish-changelog` gibt Exit 2 mit `"Notes file not found"`

---

### Requirement: Pipeline-Order SSOT Lane Mapping

The system SHALL maintain a single source of truth in `tickets/pipeline-order.ts` that defines the linear ticket lifecycle sequence (triage → planning → plan_staged → backlog → in_progress → in_review → qa_review → awaiting_deploy → done), derives `STATUS_BUCKETS` byte-identically from that sequence, and maps every member of `ALL_TICKET_STATUSES` to exactly one lane. Side lanes (`blocked`, `archived`) SHALL be excluded from the linear `PIPELINE_STATUSES` array but present in `PIPELINE_LANES`. The symbols SHALL be re-exported unchanged from `factory-floor.ts` for backwards-compatible consumer imports.

#### Scenario: Lineares Lifecycle-Order und Side-Lane-Ausschluss
- **GIVEN** die `pipeline-order.ts` SSOT ist geladen
- **WHEN** `PIPELINE_STATUSES` auf Reihenfolge und `PIPELINE_LANES` auf Side-Lane-Flags geprüft werden
- **THEN** `qa_review` kommt vor `done` (lifecycle-direction guard); `blocked` und `archived` sind ausschließlich in Lanes mit `side: true` und nicht in `PIPELINE_STATUSES` enthalten

#### Scenario: Re-Export-Kontrakt für bestehende Konsumenten
- **GIVEN** Konsumenten (SP2/SP3/SP4) importieren `STATUS_BUCKETS`, `PIPELINE_LANES` und `ALL_TICKET_STATUSES` aus `factory-floor.ts`
- **WHEN** die Re-Exporte der Symbole gegen die SSOT-Quelle verglichen werden
- **THEN** `FF_PIPELINE_LANES === PIPELINE_LANES`, `FF_STATUS_BUCKETS === STATUS_BUCKETS` und `FF_ALL_TICKET_STATUSES === ALL_TICKET_STATUSES` (referenzidentisch); jedes `ALL_TICKET_STATUSES`-Mitglied hat einen definierten Bucket-Eintrag

---

### Requirement: Factory-Floor DAL Hallenbetrieb und Slot-Verwaltung

The system SHALL provide a Data Access Layer (`factory-floor.ts`) that queries active tickets for the factory floor (Hall, Loading Dock, Shipped, Staged, Awaiting Deploy), derives the latest phase and state per ticket from `factory_phase_events`, excludes terminal tickets with stale `pipeline_slot` values from slot counts and Hall display, includes slot-less devflow tickets in the Hall without counting them against slot capacity, and returns provider health status with cooldown classification.

#### Scenario: Stale Slot-Leak und Devflow-Tickets in der Halle
- **GIVEN** Ticket x1 (archived) hat `pipeline_slot=4` und ist 30 Minuten alt; Ticket dv1 (in_progress) hat `pipeline_slot=NULL` und `driver=devflow`
- **WHEN** `getHall()` und `getControl(3)` aufgerufen werden
- **THEN** x1 wird nicht in der Halle angezeigt und nicht als belegter Slot gezählt (`slotsUsed=2`); dv1 erscheint in der Halle mit `driver=devflow` und der PR-Nummer aus dem `deploy`-Event-Detail; `watchdogStale` zählt terminale Slots nicht

#### Scenario: Loading Dock Wartegrund und Provider-Cooldown
- **GIVEN** ein Backlog-Ticket wartet; `slotsCap=3`, `slotsUsed=3`; Provider `ollama` hat `cooldown_until` in der Zukunft
- **WHEN** `getLoadingDock(3, 3)` und `getProviderHealth()` aufgerufen werden
- **THEN** `getLoadingDock` meldet `waitReason='Slot voll'`; bei freiem Slot lautet der Grund `'wartet auf Dispatch'`; `getProviderHealth` klassifiziert `ollama` als `status='cooldown'` und `deepseek` als `status='healthy'`

---

### Requirement: Staged Ticket Kommissionierung und Plan-Ref-Parsing

The system SHALL expose `getStaged()` to return only `plan_staged` features, parse a `FACTORY-PLAN-REF` marker from `ticket_comments` to extract `branch` and `planPath`, and expose `releaseToBacklog(extId)` to atomically flip a `plan_staged` ticket to `backlog`, returning `true` on success and `false` for unknown or non-staged tickets.

#### Scenario: Plan-Ref-Parsing und Staged-Filterung
- **GIVEN** Ticket p1 hat Status `plan_staged` und einen Kommentar `FACTORY-PLAN-REF branch=feature/staged-eins plan=openspec/changes/staged-eins/tasks.md`; Ticket p2 hat keinen solchen Kommentar
- **WHEN** `getStaged()` aufgerufen wird
- **THEN** nur `plan_staged`-Tickets (p1, p2) werden zurückgegeben; p1 hat `branch='feature/staged-eins'` und `planPath='openspec/changes/staged-eins/tasks.md'`; p2 hat `branch=null` und `planPath=null`; `in_progress`-, `backlog`- und `done`-Tickets sind ausgeschlossen

#### Scenario: releaseToBacklog Atomizität und Fehlerbehandlung
- **GIVEN** Ticket T000490 hat Status `plan_staged`; Ticket T000467 hat Status `done`; T999999 existiert nicht
- **WHEN** `releaseToBacklog` für alle drei aufgerufen wird
- **THEN** T000490 gibt `true` zurück und taucht danach nicht mehr in `getStaged()` auf; T000467 und T999999 geben jeweils `false` zurück

---

### Requirement: Phase-Progress-Visualisierung und Attention-Aggregation

The system SHALL compute a `phaseProgress` array that marks all phases before the current one as `done`, the current phase as `active` (or `blocked` if blocked), and all subsequent phases as `pending`. A null phase yields all-pending. The `buildAttention` function SHALL aggregate blocked tickets, tickets stuck longer than a configurable threshold, and providers in cooldown into a single attention object with an `isEmpty` flag.

#### Scenario: Phasen-Fortschritt bei aktiver und blockierter Phase
- **GIVEN** ein Ticket ist in Phase `implement` mit State `entered`; ein anderes in Phase `verify` mit State `blocked`
- **WHEN** `phaseProgress('implement', 'entered')` und `phaseProgress('verify', 'blocked')` aufgerufen werden
- **THEN** für `implement/entered` sind scout/design/plan `done`, implement `active`, verify/deploy `pending`; für `verify/blocked` ist verify `blocked` und implement `done`; `phaseProgress(null, null)` gibt alle Phasen als `pending` zurück

#### Scenario: buildAttention sammelt Blocked, Stuck und Cooldown
- **GIVEN** Ticket A ist `blocked`; Ticket B ist seit 30 Minuten `entered` (> 15-Minuten-Schwellwert); Ticket C ist seit Sekunden `entered`; Provider `deepseek` ist im Cooldown
- **WHEN** `buildAttention(hall, providers, 15)` aufgerufen wird
- **THEN** `blocked` enthält nur A; `stuck` enthält nur B; `cooldowns` enthält nur `deepseek`; `isEmpty` ist `false`; bei ausschließlich gesunden und frischen Tickets ist `isEmpty` `true`

---

### Requirement: Injection-DAL mit phasengesteuerter Consumption

The system SHALL persist ticket injections via `insertInjection`, return them via `getInjections`, and atomically consume them via `consumeInjections(extId, phase)`. Consumption marks matching rows as consumed so a second call returns empty. Phase-targeted injections (non-null `phase` column) SHALL only be consumed when the current phase matches; null-phase injections SHALL be consumed at any phase boundary.

#### Scenario: Insert-Get-Consume Round-Trip und Atomizität
- **GIVEN** eine Injektion der Art `context` für Phase `implement` wird in Ticket T000459 eingetragen
- **WHEN** `getInjections('T000459')` und dann `consumeInjections('T000459', 'implement')` zweimal aufgerufen werden
- **THEN** `getInjections` gibt die Injektion mit `consumedAt=null` zurück; der erste `consumeInjections`-Aufruf liefert die Row; der zweite Aufruf gibt eine leere Liste zurück (Atomizität)

#### Scenario: Phasen-Targeting verhindert Fehl-Consumption
- **GIVEN** Ticket T000460 hat eine `verify`-Phase-Injektion (`phase='verify'`) und eine Wildcard-Injektion (`phase=null`)
- **WHEN** `consumeInjections('T000460', 'implement')` aufgerufen wird
- **THEN** nur die Wildcard-Injektion wird konsumiert; die `verify`-Injektion bleibt offen und wird bei `consumeInjections('T000460', 'verify')` korrekt geliefert

---

### Requirement: Factory-Metriken und Active-Features-Abfrage

The system SHALL expose `listFactoryMetrics()` returning daily KPI rows (features_shipped, avg_cycle_time_h, escalations, total_features) sorted newest-day-first, `listActiveFeatures()` returning the current working set with pipeline_slot from `v_active_features`, and `listActiveFlags(brand)` returning only disabled (`enabled=false`) feature flags for the given brand.

#### Scenario: Metriken neuesten-Tag-zuerst und KPI-Vollständigkeit
- **GIVEN** `v_factory_metrics` enthält Einträge für 2026-06-04 (3 shipped, avg 5.5h, 1 escalation, 7 total) und 2026-06-03
- **WHEN** `listFactoryMetrics()` aufgerufen wird
- **THEN** der erste Row hat `day='2026-06-04'`, `features_shipped=3`, `avg_cycle_time_h=5.5`, `escalations=1`, `total_features=7`; die Reihenfolge ist absteigend nach Tag

#### Scenario: Active Features und Dark-Launch-Flags
- **GIVEN** `v_active_features` enthält Feature T000500 mit `pipeline_slot=1`; `feature_flags` enthält für `mentolder` einen deaktivierten Flag `dark-a` und einen aktivierten Flag `dark-b`
- **WHEN** `listActiveFeatures()` und `listActiveFlags('mentolder')` aufgerufen werden
- **THEN** `listActiveFeatures` gibt T000500 mit `priority='hoch'` und `pipeline_slot=1` zurück; `listActiveFlags` gibt nur `dark-a` (`enabled=false`) zurück — aktivierte Flags werden ausgeschlossen

---

### Requirement: Factory-Observability Prometheus-Proxy

The system SHALL provide `buildPromQL(metric, brand)` that generates brand-aware PromQL queries without embedding literal domain names (e.g. `mentolder.de`), and `queryRange(query, start, end, step)` that proxies requests to the Prometheus `/api/v1/query_range` endpoint and returns the matrix result. Unreachable endpoints SHALL propagate a typed error.

#### Scenario: PromQL-Generierung ohne Domain-Literals
- **GIVEN** `metric='cost'` und `brand='mentolder'`
- **WHEN** `buildPromQL('cost', 'mentolder')` aufgerufen wird
- **THEN** der Query enthält `claude_code_cost_usage`; weder `mentolder.de` noch `korczewski.de` erscheinen als Literale im Query-String

#### Scenario: queryRange Proxy und Fehlerweiterleitung
- **GIVEN** ein `fetch`-Mock gibt eine erfolgreiche Prometheus-Matrix-Antwort zurück; ein zweiter Mock wirft `ECONNREFUSED`
- **WHEN** `queryRange('up', start, end, 60)` aufgerufen wird
- **THEN** im Erfolgsfall enthält `r.data.result.length` den Wert 1 und die Fetch-URL enthält `/api/v1/query_range`; bei unerreichbarem Prometheus wird ein Fehler geworfen

---

### Requirement: CI Check-Run Normalisierung und Rollup

The system SHALL provide `normalizeChecks(raw)` in `factory-ci.ts` that maps GitHub check-run objects to a normalized shape (name, status, conclusion, url from details_url), and `rollupConclusion(checks)` that returns `'failure'` if any check has a failure-class conclusion, `'pending'` if any check is still running or the list is empty, `'success'` if all checks completed successfully, and `null` for an empty normalized list.

#### Scenario: Normalisierung von Check-Run-Objekten
- **GIVEN** ein Array mit einem `completed/success`-Check und einem `in_progress/null`-Check
- **WHEN** `normalizeChecks([...])` aufgerufen wird
- **THEN** jeder Output-Eintrag hat exakt die Felder `name`, `status`, `conclusion`, `url` (aus `details_url`); kein weiteres Feld ist vorhanden

#### Scenario: Rollup-Logik nach Priorität
- **GIVEN** Szenarien mit (a) allen `success`, (b) einem `failure`, (c) einem `in_progress`, (d) leerer Liste
- **WHEN** `rollupConclusion` auf jedes Szenario angewendet wird
- **THEN** (a) `'success'`; (b) `'failure'`; (c) `'pending'`; (d) `null`; `timed_out` Conclusion wird ebenfalls als `'failure'` klassifiziert

---

### Requirement: Content-Hub Catalog Migration mit Idempotenz

The system SHALL provide `linkCardsToCatalog(cards, categories)` that matches service cards to leistung-catalog categories by slug, selects the highlight row as `headlineKey` (falling back to the first row), detects price divergences between stored card price and catalog price, strips the stored `price` and `pageContent.pricing` fields from matched cards, sets `headlinePrefix=true` when the old price began with "Ab", and is fully idempotent. Cards with no category mapping SHALL be left untouched with their original price retained.

#### Scenario: Catalog-Link mit Highlight-Auswahl und Preis-Divergenz
- **GIVEN** Card `digital-50plus` hat Preis `'Ab 99 € / Stunde'`; der Katalog hat `50plus-digital-paket-s` als Highlight und `50plus-digital-einzel` ohne Highlight
- **WHEN** `linkCardsToCatalog([card], cats)` aufgerufen wird
- **THEN** `migrated[0].leistungCategoryId='digital-50plus'`; `headlineKey='50plus-digital-paket-s'` (Highlight bevorzugt); `headlinePrefix=true` (Preis begann mit "Ab"); `price` und `pageContent.pricing` sind `undefined`; `divergences` enthält `{ slug: 'digital-50plus', old: 'Ab 99 € / Stunde', catalog: '330 €' }`

#### Scenario: Idempotenz und unbekannte Slugs
- **GIVEN** bereits verknüpfte Cards werden erneut an `linkCardsToCatalog` übergeben; eine Card mit Slug `unbekannt` hat keinen Katalog-Eintrag
- **WHEN** `linkCardsToCatalog` ein zweites Mal auf dem `migrated`-Output aufgerufen wird
- **THEN** der Output ist identisch mit dem Input (kein Diff); `divergences` ist leer; die unbekannte Card behält ihren ursprünglichen `price`-Wert und hat kein `leistungCategoryId`-Feld

---

### Requirement: Security-Guidance Rewake Response Protocol

The system SHALL, upon receiving a `security-guidance` asyncRewake message after a `git commit`, acknowledge findings or open a follow-up ticket — never run `git restore`, `git checkout --`, or `git reset` to undo the already-completed commit. The commit has landed; reverting it destroys committed work and requires merge-conflict recovery.

#### Scenario: Security-Guidance meldet ein echtes Finding nach Commit

- **GIVEN** ein `git commit` wurde erfolgreich abgeschlossen und der `security-guidance`-Plugin feuert einen asyncRewake mit einem Finding
- **WHEN** der Agent den rewakeMessage verarbeitet
- **THEN** der Agent bestätigt das Finding (Acknowledgement) oder eröffnet ein Follow-up-Ticket; kein `git restore`, `git checkout --` oder `git reset` wird ausgeführt; das Finding wird in einem neuen Commit behoben, falls es kein False Positive ist

#### Scenario: False-Positive-Finding nach Commit

- **GIVEN** der `security-guidance`-Plugin rewakt nach einem Commit mit einem Finding, das ein False Positive ist
- **WHEN** der Agent das Finding bewertet
- **THEN** der Agent notiert das False Positive explizit; es werden keine destruktiven Git-Operationen ausgelöst; der Commit-Stand bleibt erhalten

---

### Requirement: Agent-Lock Claim/Release Lifecycle

The system SHALL enforce a claim-before-work, release-after-merge lifecycle for all ticket and branch work via `scripts/agent-lock.sh`: `reap` at session/skill start to clean zombie locks, `claim ticket <ext-id>` before touching a ticket's branch or worktree, and `release ticket <ext-id>` after merge. An exit-1 from `claim` indicates a live session already owns the ticket — the agent SHALL coordinate or choose a different ticket, never duplicate the work.

#### Scenario: Ticket-Claim vor Arbeitsbeginn

- **GIVEN** keine andere lebende Session hält einen Claim auf Ticket T000600
- **WHEN** `bash scripts/agent-lock.sh claim ticket T000600 --branch feature/foo --worktree /tmp/wt-foo --label dev-flow-execute` aufgerufen wird
- **THEN** Exit 0; der Claim wird unter `.git/agent-locks/` registriert; anschließendes `bash scripts/agent-lock.sh list` zeigt den Eintrag; die Software Factory überspringt dieses Ticket im Dispatcher

#### Scenario: Claim-Kollision bei laufender Session

- **GIVEN** Session A hält bereits einen Claim auf Ticket T000600 und ist laut Prozess-Check noch lebendig
- **WHEN** Session B `bash scripts/agent-lock.sh claim ticket T000600 ...` aufruft
- **THEN** Exit 1; Session B wählt ein anderes Ticket oder koordiniert mit Session A; kein doppelter Dispatch findet statt; nach `bash scripts/agent-lock.sh release ticket T000600` durch Session A gibt ein erneuter Claim-Versuch Exit 0

---

### Requirement: Session-Start Reaper für Zombie-Locks

The system SHALL run `bash scripts/agent-lock.sh reap` at the start of every session or skill invocation to clean up stale locks from dead processes (whose cwd points to a deleted worktree), removed worktrees, and sessions with no live PID. The reap operation SHALL be idempotent and fail-open — errors must not abort the session.

Liveness SHALL NOT be decided by the session id alone. A session **resume** starts a new process with a different SID (and possibly a different PID), so a lock whose recorded worktree still exists **and** is checked out on exactly the branch the lock recorded SHALL be treated as live and SHALL NOT be reaped, regardless of a dead or mismatched SID. Reaping a resumed session's lock causes the pre-commit guard to fail afterwards with a spurious "branch mismatch". The filesystem/git state is the authoritative liveness signal here; the volatile SID is not.

#### Scenario: Resumed session keeps its lock

- **GIVEN** a lock records worktree `<path>` and branch `fix/x`, its recorded SID is no longer alive, and `<path>` exists with `fix/x` checked out
- **WHEN** `bash scripts/agent-lock.sh reap` runs
- **THEN** the lock is retained and still listed by `agent-lock.sh list`

#### Scenario: Regression guard — branch drift is still reaped

- **GIVEN** a lock records worktree `<path>` and branch `fix/x`, its SID is dead, but `<path>` is checked out on a different branch
- **WHEN** `bash scripts/agent-lock.sh reap` runs
- **THEN** the lock is removed, because the worktree/branch evidence no longer corroborates a live session

### Requirement: Main-Checkout Commit-Sperre bei Live-Session

The system SHALL block `git commit` in the main checkout via the `.githooks/pre-commit` hook when another live session holds the `main-checkout` lock, to prevent concurrent modification of the shared working tree. The gate SHALL be skipped in worktrees (fail-open) and overridable with `AGENT_LOCK_FORCE=1`. The preferred alternative is always to work in a dedicated worktree via `scripts/worktree-create.sh`.

#### Scenario: Commit im main-Checkout bei belegtem Lock

- **GIVEN** Session D hält den `main-checkout`-Lock und ist laut Prozess-Check lebendig; Session E versucht `git commit` direkt im main-Checkout
- **WHEN** der `.githooks/pre-commit`-Hook ausgeführt wird (setzt `core.hooksPath=.githooks` via `task secrets:install-hooks` voraus)
- **THEN** der Hook gibt Exit 1 zurück; der Commit wird abgeblockt; Session E erhält eine Fehlermeldung mit Hinweis auf den Lock-Inhaber

#### Scenario: Force-Override und Worktree-Bypass

- **GIVEN** Session E setzt `AGENT_LOCK_FORCE=1` oder arbeitet in einem Worktree unter `/tmp/`
- **WHEN** `AGENT_LOCK_FORCE=1 git commit ...` bzw. ein normaler Commit im Worktree ausgeführt wird
- **THEN** der Hook lässt den Commit durch; im Worktree wird das Gate gänzlich übersprungen (fail-open); `AGENT_LOCK_FORCE=1` im main-Checkout gibt eine Warn-Ausgabe, committed aber durch

---

### Requirement: Factory scripts never checkout/switch branches in the shared main checkout

The system SHALL statically guard (CI-gated test) that no script under `scripts/factory/`
issues a `git checkout` or `git switch` against the shared main checkout. Worktree-scoped
git operations (e.g. `git -C "$WORK_WT" ...`, or commands executed after `cd` into a
dedicated worktree created via `scripts/worktree-create.sh`) remain permitted.

#### Scenario: Factory script adds a raw checkout in the main checkout

- **GIVEN** a developer adds a new line to a script under `scripts/factory/` containing
  `git checkout <branch>` or `git switch <branch>` that is not scoped to `$WORK_WT`
- **WHEN** `task test:changed` (or CI) runs the factory-branch-switch-guard BATS test
- **THEN** the test fails, blocking merge until the checkout is removed or properly
  worktree-scoped

#### Scenario: Factory pipeline creates and works inside an isolated worktree

- **GIVEN** `scripts/factory/pipeline.js` creates a dedicated worktree via
  `scripts/worktree-create.sh` for a ticket
- **WHEN** the guard test scans `scripts/factory/`
- **THEN** the worktree-scoped commands are recognized as exempt and the test passes

### Requirement: main-checkout post-checkout guard reverts foreign branch switches to the claimed branch

The `main-checkout` agent-lock's `post-checkout` guard SHALL attempt a best-effort revert
to the branch recorded in a live foreign `main-checkout` lock's `branch` field when a
branch switch happens in the shared main checkout, unless a rebase, merge, or
cherry-pick is in progress, or `AGENT_LOCK_POSTCHECKOUT_REVERT=0` is set. The guard SHALL
never fail the underlying git command (fail-open) and SHALL never target a raw commit SHA.

#### Scenario: Foreign session switches branch while lock holder's branch is known

- **GIVEN** session A holds a live `main-checkout` lock with `branch=feature/x`
- **WHEN** session B (a different live SID) runs `git checkout main` in the shared main
  checkout
- **THEN** the `post-checkout` hook calls `agent-lock.sh guard-postcheckout`, which checks
  out `feature/x` again and logs a warning, without exiting non-zero

#### Scenario: Rebase in progress is exempt from the revert

- **GIVEN** session A holds a live `main-checkout` lock with `branch=feature/x`
- **WHEN** session B runs `git pull --rebase origin main` in the shared main checkout,
  triggering intermediate `post-checkout` events while `.git/rebase-merge` exists
- **THEN** `guard-postcheckout` returns immediately without warning or reverting, so
  session B's rebase completes undisturbed

#### Scenario: Lock has no recorded branch

- **GIVEN** a live foreign `main-checkout` lock exists with an empty `branch` field
- **WHEN** a branch switch happens in the shared main checkout
- **THEN** `guard-postcheckout` logs the existing warning only and does not attempt any
  checkout (no revert onto an unreliable target)

### Requirement: main-checkout lock is self-claimed on every commit

`scripts/agent-lock.sh::cmd_guard_precommit` SHALL, after confirming no live foreign
`main-checkout` lock blocks the commit, best-effort claim/refresh the `main-checkout` lock
for the committing session with `--branch` set to the current branch name, so that the
lock's `branch` field stays populated without requiring skills to call
`agent-lock.sh claim main-checkout` explicitly.

#### Scenario: Commit in main checkout updates the lock's branch field

- **GIVEN** no live foreign `main-checkout` lock exists
- **WHEN** a session commits successfully in the shared main checkout on branch `chore/y`
- **THEN** the `main-checkout` lock is claimed or refreshed with `branch=chore/y`,
  `owner_sid` set to the committing session's SID, and `heartbeat_at` updated

### Requirement: Token-Budget-Semaphor für Agent-Provider-Claims

Die bestehende Slot-Concurrency (`provider_config.max_concurrent`, statischer Zähler) kann die
KV-Cache-Ressource eines lokalen LLM-Hosts nicht modellieren: drei 60k-Kontexte passen
gleichzeitig, ein 180k-Kontext belegt den Host exklusiv. Das Routing SHALL Claims zusätzlich
gegen ein per-Provider Token-Budget absichern, das generisch für alle Provider gilt und bei
`context_budget = NULL` als unbegrenzt interpretiert wird (Cloud-Rows bleiben unverändert).

The system SHALL extend the atomic slot claim so that a claim reserves the candidate row's
`context_window` tokens on `provider_health.reserved_tokens` and only succeeds when the provider's
`context_budget` is `NULL` (unbounded) or the sum of already reserved tokens plus the requested
`context_window` does not exceed `context_budget`. The release SHALL symmetrically decrement
`reserved_tokens` by the same amount. The four routing implementations
(`scripts/factory/route-provider.sh`, `scripts/factory/release-slot.sh`,
`scripts/factory/provider-router.js`, and the inlined clone in `scripts/factory/pipeline.js`)
SHALL apply identical budget arithmetic; `website/src/lib/provider-config.ts` remains a read-only
selection path that passes the new columns through without claiming.

#### Scenario: Claim within budget succeeds and reserves tokens
- **GIVEN** provider `local-qwen35` has `context_budget = 180000` and `reserved_tokens = 0`
- **WHEN** a claim requests a row with `context_window = 60000`
- **THEN** the atomic UPDATE succeeds, `active_agents` becomes 1 and `reserved_tokens` becomes 60000

#### Scenario: Claim exceeding budget is rejected and routing falls through
- **GIVEN** provider `local-qwen35` has `context_budget = 180000` and `reserved_tokens = 120000`
- **WHEN** a claim requests another row with `context_window = 120000` (would total 240000)
- **THEN** the claim UPDATE returns no row, the candidate is skipped, and routing continues to the
  next lower-priority (cloud) candidate

#### Scenario: NULL budget is unbounded
- **GIVEN** a cloud provider row with `context_budget IS NULL`
- **WHEN** any claim is issued regardless of `reserved_tokens`
- **THEN** the budget guard is satisfied and only the existing `max_concurrent` cap applies

#### Scenario: Release restores the reserved budget
- **GIVEN** provider `local-qwen35` holds a 120000-token claim (`reserved_tokens = 120000`)
- **WHEN** the slot is released with its claim's `context_window = 120000`
- **THEN** `reserved_tokens` returns to 0 (floored at 0) and `active_agents` is decremented

### Requirement: Erweiterter Provider-Katalog und lokales qwen3.5-Primär-Routing

Der Provider-Katalog SHALL um einen lokalen `local-qwen35`-Eintrag (LM-Studio-Endpoint, kein
API-Key) sowie um die Cloud-Provider `openrouter`, `opencode-zen`, `google-gemini` und
`github-models` erweitert werden, deren API-Keys über die bestehende Provider-Verwaltung und
`environments/schema.yaml` gepflegt werden. Kontextleichte Orchestrierungsarbeit SHALL primär auf
den lokalen Provider geroutet werden, mit Cloud als automatischem prio-2-Fallback über den
bestehenden Circuit-Breaker.

The system SHALL register `local-qwen35` in `website/src/lib/ki-catalog.ts` with the LM-Studio
base URL and no `apiKeyEnv`, and SHALL register `openrouter`, `opencode-zen`, `google-gemini`, and
`github-models` each with an `apiKeyEnv`. The service source `lavish-artifact` SHALL be registered
in `website/src/lib/ki-services.ts`. Seed rows SHALL make `local-qwen35` priority 1 for the sources
`factory-scout`, `factory-plan`, `ticket-triage`, and `lavish-artifact`, and SHALL demote the
existing cloud rows of those sources to priority 2.

#### Scenario: Local provider is primary for orchestration sources
- **GIVEN** the seed migration has been applied to a brand database
- **WHEN** `route-provider.sh factory-scout sonnet` selects candidates
- **THEN** the highest-priority (priority 1) candidate is `local-qwen35` and the former cloud row is
  now priority 2

#### Scenario: New cloud providers expose an apiKeyEnv
- **GIVEN** the extended catalog
- **WHEN** `interfaceById('openrouter')` (or `opencode-zen`, `google-gemini`, `github-models`) is read
- **THEN** each entry defines a non-empty `apiKeyEnv`, and the four env names are declared in
  `environments/schema.yaml`

#### Scenario: Local provider requires no API key
- **GIVEN** the catalog entry `local-qwen35`
- **WHEN** its configuration is resolved
- **THEN** it defines no `apiKeyEnv` and its resolved API key is `not-required`

### Requirement: Agent-lock reap age is measured against heartbeat_at, not created_at alone

The `scripts/agent-lock.sh` `_reapable()` function SHALL compute the age reference used by the
`pid-dead` and `sid-dead` reap branches from `heartbeat_at` when present, falling back to
`created_at` only when `heartbeat_at` is absent (legacy claim files predating that field). A
claim whose `heartbeat_at` was refreshed recently SHALL NOT be reaped by the `pid-dead` or
`sid-dead` branches purely because its `created_at` is old. The `heartbeat-ttl` branch remains
the ultimate fallback for genuinely stale, never-refreshed claims and is unaffected.

#### Scenario: A recently-refreshed claim survives the pid-dead reap despite an old created_at

- **GIVEN** a lock file with `created_at` far older than `AGENT_LOCK_GRACE` seconds, but
  `heartbeat_at` set to the current time (a recent refresh), and a dead `owner_pid`
- **WHEN** `agent-lock.sh reap` runs
- **THEN** the claim is NOT reaped and still appears in `agent-lock.sh list`

#### Scenario: A claim whose heartbeat is also stale is still reaped

- **GIVEN** a lock file with both `created_at` and `heartbeat_at` far older than
  `AGENT_LOCK_GRACE` seconds, and a dead `owner_pid`
- **WHEN** `agent-lock.sh reap` runs
- **THEN** the claim is reaped with reason `pid-dead` (or `sid-dead`, depending on which check
  fires first) and no longer appears in `agent-lock.sh list`

### Requirement: ticket create validates --severity client-side before any DB access

`scripts/vda/ticket/create.sh` SHALL validate a non-empty `--severity` value against the enum
`critical|major|minor|trivial` before making any database call (`_pgpod`/`_exec_sql`). An invalid
value SHALL cause the script to exit with status `2` and a stderr message listing all four
allowed values, without ever burning a ticket sequence id. An empty/omitted `--severity` remains
allowed and skips the guard entirely. `scripts/ticket.sh`'s usage text SHALL document the four
allowed values.

#### Scenario: An invalid --severity value is rejected before any DB access

- **GIVEN** `create.sh create --type bug --title "x" --description "y" --severity hoch` is
  invoked with `kubectl` unreachable (no cluster access possible)
- **WHEN** the script runs
- **THEN** it exits with status `2` and stderr lists `critical`, `major`, `minor`, and `trivial`

#### Scenario: An empty --severity is still allowed

- **GIVEN** `create.sh create --type bug --title "x" --description "y"` is invoked without a
  `--severity` flag
- **WHEN** the script runs
- **THEN** the severity validation guard does not trigger (the script proceeds to the DB step)

### Requirement: Offline-guard helpers are reachable from every ticket CLI script that needs them

`_ticket_offline_skip` and `_ticket_offline_refuse_read` SHALL be defined in the shared
`scripts/vda/ticket/_ticket-core.sh`, which every `scripts/vda/ticket/*.sh` subcommand script and
`scripts/ticket.sh` source. `scripts/ticket.sh` SHALL NOT redefine these functions locally.

#### Scenario: get.sh no longer emits a command-not-found error for the offline guard

- **GIVEN** `scripts/vda/ticket/get.sh --id T000001` is invoked (offline or online)
- **WHEN** the script reaches its `_ticket_offline_refuse_read` call
- **THEN** stderr does NOT contain `command not found`

#### Scenario: _ticket_offline_refuse_read is defined in the shared core

- **GIVEN** `scripts/vda/ticket/_ticket-core.sh`
- **WHEN** the file is inspected
- **THEN** it contains a `_ticket_offline_refuse_read()` function definition

### Requirement: Guard Against Silent Provider BaseURL Passthrough Loss

The factory pipeline's `agent()` call sites SHALL route every `model` argument
through `resolveAgentModel`, which only accepts a value from the harness tier
enum (`sonnet|opus|haiku|fable`). When a resolved provider route carries a
custom `modelId` and/or `baseUrl` that the harness cannot use, the pipeline
SHALL log the drop and fall back to a valid harness tier instead of silently
discarding local-provider routing.

#### Scenario: Local provider route is dropped with a visible fallback

- **GIVEN** a resolved provider route with a custom `modelId` and `baseUrl`
  pointing at a local endpoint
- **WHEN** the factory pipeline builds the `agent()` call options for
  `factory-scout`, `factory-plan`, `factory-implement`, or `factory-review`
- **THEN** `resolveAgentModel` logs the dropped `modelId`/`baseUrl` and returns
  the caller-supplied fallback tier, so the `agent()` call always receives a
  valid harness tier instead of an unsupported custom value

#### Scenario: Harness-tier route passes through unchanged

- **GIVEN** a resolved provider route whose `modelId` is already one of
  `sonnet|opus|haiku|fable` and has no `baseUrl`
- **WHEN** `resolveAgentModel` evaluates the route
- **THEN** it returns that `modelId` unchanged, with no fallback and no log line

### Requirement: Dry-run-first tickets graduate to a real run

The Software Factory pipeline SHALL mark a ticket as dry-run-checked
(`ticket.sh dryrun-mark`) after completing its forced preview run in the
`DRY_RUN` branch, so that `guard_dryrun_ok()` permits a real (non-dry-run)
execution on the ticket's next scheduled tick.

The marking SHALL happen in deterministic code after the Deploy-phase preview agent call
returns, NOT as an instruction inside the agent prompt. A state transition that is the only
way out of the dry-run-first loop SHALL NOT depend on a headless session surviving or on a
model complying with a prompt line. If the agent call aborts (for example because the
configured `ANTHROPIC_BASE_URL` refuses the connection), the marker SHALL remain unset and
the ticket SHALL be bounded by the watchdog's attempt counter instead of looping
indefinitely.

The pipeline file that carries this behaviour is `scripts/factory/pipeline.mjs` — the file
`dispatcher-bridge.sh` launches via the Workflow tool and `run-pipeline.mjs` imports.

#### Scenario: Ticket forced into dry-run by guard_dryrun_ok

- **GIVEN** a ticket has no dry-run-first marker (`ticket.sh dryrun-check`
  exits non-zero)
- **WHEN** the pipeline runs it in the `DRY_RUN` branch and the Deploy-phase preview agent
  call returns successfully
- **THEN** deterministic code — not the agent prompt — calls
  `ticket.sh dryrun-mark --id <ticket>`, so the next tick's `guard_dryrun_ok()` call
  returns true and the ticket runs for real instead of looping through another forced
  preview.

#### Scenario: Dry-run aborts before the marker is set

- **GIVEN** a ticket has no dry-run-first marker and the configured
  `ANTHROPIC_BASE_URL` refuses connections
- **WHEN** the pipeline enters the `DRY_RUN` branch and the Deploy-phase preview agent call
  throws
- **THEN** the marker stays unset and the ticket keeps returning to the queue, but the
  watchdog's `factory_attempt` counter bounds the repetition and escalates via
  `ticket.sh unfactory` once `FACTORY_MAX_ATTEMPTS` is reached — the ticket does not loop
  indefinitely.

### Requirement: Sandboxed Command Execution for the Implement Phase

The system SHALL execute the Implement-phase build and verify commands (`task workspace:validate`, `task test:all`, `task freshness:regenerate` in `pipeline.js` and the `runTaskVerifyLoop` in `build-loop.cjs`) inside an isolated sandbox provided by `scripts/factory/sandbox-run.sh`, instead of running them directly as a host process. The runner SHALL select an execution backend via the fallback chain **docker → k8s → off**, overridable with the `FACTORY_SANDBOX=docker|k8s|off` environment variable. When Docker is available (`docker info` succeeds) it SHALL run the command in a dedicated sandbox image with the target worktree bind-mounted; when Docker is unavailable it SHALL fall back to a Kubernetes Job in the local cluster with equivalent semantics; when neither is available (or `FACTORY_SANDBOX=off`) it SHALL run the command unsandboxed on the host and emit warning telemetry. The runner SHALL NOT mount the main repository checkout or the `environments/.secrets/` directory into the sandbox. The egress policy SHALL be default-deny with an allowlist (Anthropic API, npm registry, GitHub, and staging/prod endpoints), where the prod domain is resolved from `PROD_DOMAIN` / `k3d/configmap-domains.yaml` and never hardcoded as a brand-domain literal.

#### Scenario: Docker backend selected when the daemon is reachable

- **GIVEN** `FACTORY_SANDBOX` is unset and `docker info` succeeds
- **WHEN** `scripts/factory/sandbox-run.sh <worktree> "task test:all"` is invoked
- **THEN** the resolved mode is `docker`; the command runs in the sandbox image with the worktree bind-mounted; neither the main checkout nor `environments/.secrets/` is mounted

#### Scenario: Fallback to a k8s Job when Docker is unavailable

- **GIVEN** `FACTORY_SANDBOX` is unset and `docker info` fails while the local cluster is reachable
- **WHEN** `scripts/factory/sandbox-run.sh <worktree> "task test:all"` is invoked
- **THEN** the resolved mode is `k8s`; the command runs as a Kubernetes Job with the worktree as its volume and the same secret/main-checkout mount exclusions

#### Scenario: Off escape-hatch runs unsandboxed with warning telemetry

- **GIVEN** `FACTORY_SANDBOX=off`
- **WHEN** `scripts/factory/sandbox-run.sh <worktree> "task test:all"` is invoked
- **THEN** the command runs directly on the host (today's behavior); a warning is written to stderr; and warn telemetry (`factory.sandbox.off`) is emitted via `otel-emit.sh`

#### Scenario: Refusal to sandbox the main checkout

- **GIVEN** the worktree argument equals the main repository checkout path
- **WHEN** `scripts/factory/sandbox-run.sh <main-checkout> "task test:all"` is invoked
- **THEN** the runner exits non-zero without mounting the main checkout into any container

### Requirement: PR-CI-Babysitter Scan und Kandidatenwahl

Der Babysitter deckt die Lücke ab, in der offene PRs außerhalb eines laufenden
Factory-Runs (abgebrochene Factory-PRs, dev-flow-PRs, Renovate, manuelle PRs) mit
roter CI liegen bleiben, weil weder Dispatcher noch Watchdog den PR-CI-Status
abfragen. Der Step läuft repo-weit **einmal pro Wakeup-Tick** (PRs sind
brand-agnostisch) und wählt **genau einen** Kandidaten pro Aufruf (Concurrency 1).

The system SHALL scan open pull requests via `gh pr list --state open --json
number,headRefName,isDraft,mergeStateStatus,statusCheckRollup,author,labels`,
treat only unambiguous `FAILURE` conclusions in `statusCheckRollup` as red (a
`null`/pending conclusion SHALL NOT count as red), and select at most one
candidate per invocation ordered by ascending PR number.

#### Scenario: Ein einziger roter PR wird gewählt
- **GIVEN** two open non-draft PRs #40 and #42 both have a `statusCheckRollup` entry with `conclusion=FAILURE`
- **WHEN** `babysit-prs.sh` runs one pass
- **THEN** it selects exactly PR #40 (smallest number) and processes no other PR in the same pass

#### Scenario: Pending Checks zählen nicht als rot
- **GIVEN** an open PR whose only `statusCheckRollup` entries have `conclusion=null` (pending)
- **WHEN** `babysit-prs.sh` evaluates the candidate set
- **THEN** the PR is skipped and the pass ends without selecting it (retried next tick)

### Requirement: PR-CI-Babysitter Filter- und Guard-Kette

The system SHALL exclude a PR from selection when ANY of the following holds:
the PR is a draft; it carries the label `ci-babysitter-gave-up`; its author is
the Renovate bot and `FACTORY_BABYSIT_RENOVATE` is not `true`; its head branch
has a live `agent-lock` branch claim (`.git/agent-locks/branch__<name>.json`) or
a `[TNNNNNN]`-tagged ticket in status `in_progress`. When
`mergeStateStatus == CONFLICTING`, the system SHALL NOT attempt a fix, SHALL add
the label `ci-babysitter-conflict` at most once, and SHALL emit a notify payload.

#### Scenario: Draft und gave-up werden übersprungen
- **GIVEN** the only red PRs are one draft PR and one PR labelled `ci-babysitter-gave-up`
- **WHEN** `babysit-prs.sh` runs
- **THEN** neither PR is selected and no fix is attempted

#### Scenario: Renovate nur mit Opt-in
- **GIVEN** the only red PR is authored by the Renovate bot
- **WHEN** `babysit-prs.sh` runs with `FACTORY_BABYSIT_RENOVATE` unset
- **THEN** the PR is skipped; **AND** when the same pass runs with `FACTORY_BABYSIT_RENOVATE=true` the PR becomes eligible

#### Scenario: CONFLICTING wird gemeldet, nie gefixt
- **GIVEN** a red PR with `mergeStateStatus=CONFLICTING` and no `ci-babysitter-conflict` label
- **WHEN** `babysit-prs.sh` processes it
- **THEN** it adds the `ci-babysitter-conflict` label once, emits a `QA_NOTIFY_PAYLOAD` line, and performs no fix, rebase, or merge

#### Scenario: Dedup gegen laufende Pipeline
- **GIVEN** a red PR whose head branch has a live `agent-lock` branch claim
- **WHEN** `babysit-prs.sh` evaluates it
- **THEN** the PR is skipped to avoid racing the active session/pipeline

### Requirement: PR-CI-Babysitter Fix-Loop mit zwei Gates und Versuchslimit

Retry-State lebt am PR (kein Ticket, kein Slot): ein Kommentar-Marker
`<!-- ci-babysitter attempt=N -->` zählt die lebenslangen Versuche. Der Fix-Pfad
verwendet ausschließlich die bestehenden Bausteine `classify_failure` (Klasse)
und `build_loop_decide` (Gate 1 Klasse ∈ ci|test|lint|freshness, Gate 2
Escalate-Pfade via `paths_are_escalate_class`, No-Progress-Hash, Iterationslimit).

The system SHALL count existing `<!-- ci-babysitter attempt=N -->` markers on the
PR and, when the count is `>= 2`, add the label `ci-babysitter-gave-up`, emit a
notify payload, and stop without a further fix. Otherwise the system SHALL fetch
the failed CI log (`gh run view --log-failed`, fallback `--log`), derive the class
via `classify_failure`, and consult `build_loop_decide`; on `continue` it SHALL
apply a class-scoped fix in a temporary worktree of the PR branch — deterministic
`task freshness:regenerate` for class `freshness`, an agent dispatch
(`${CLAUDE_BIN} -p`, narrowly scoped `allowedTools`) for classes `ci|test|lint`,
push through the branch worktree — and SHALL never merge, rebase, or force-push.
On any `abort:*` decision the system SHALL emit a notify payload and add a marker
comment instead of fixing.

#### Scenario: Zweiter Versuch überschritten → gave-up
- **GIVEN** a red PR that already carries two `<!-- ci-babysitter attempt=N -->` markers
- **WHEN** `babysit-prs.sh` selects it
- **THEN** it adds the `ci-babysitter-gave-up` label, emits a `QA_NOTIFY_PAYLOAD` line, and attempts no further fix

#### Scenario: Freshness-Klasse wird deterministisch behoben
- **GIVEN** a red PR whose failed CI log classifies as `freshness` and `build_loop_decide` returns `continue`
- **WHEN** `babysit-prs.sh` applies the fix
- **THEN** it regenerates artifacts in a temporary worktree of the PR branch, commits `chore: refresh (ci-babysitter)`, pushes, and never merges or force-pushes

#### Scenario: Escalate-Klasse wird hart abgebrochen
- **GIVEN** a red PR whose failed CI log classifies as `secret`, `realm`, `sql`, or `manifest`
- **WHEN** `build_loop_decide` returns `abort:escalate-gate`
- **THEN** `babysit-prs.sh` emits a notify payload and a marker comment and applies no fix

#### Scenario: Marker-Kommentar nach jedem Versuch
- **GIVEN** a fix attempt just ran on a PR
- **WHEN** `babysit-prs.sh` records the outcome
- **THEN** it posts a `<!-- ci-babysitter attempt=N -->` comment carrying the attempt number, class, decision, and a log tail

### Requirement: PR-CI-Babysitter Guards und Wakeup-Einhängung

The system SHALL skip the entire babysitter pass when the global kill-switch is on
(`guard_killswitch_on`, fail-closed) and, under `FACTORY_DRY_RUN` or the
`--dry-run` flag, SHALL only scan and log without mutating any PR. `wakeup.sh`
SHALL invoke the babysitter once per tick as a best-effort step outside the
per-brand loop (after the brand chain, before the Claude dispatcher call), with
its output prefixed and failures non-fatal.

#### Scenario: Kill-Switch pausiert den Babysitter
- **GIVEN** the global kill-switch is on
- **WHEN** `babysit-prs.sh` runs
- **THEN** it exits early without listing or mutating any PR

#### Scenario: Dry-Run scannt nur
- **GIVEN** a red eligible PR exists
- **WHEN** `babysit-prs.sh` runs with `--dry-run`
- **THEN** it logs the candidate and intended action but posts no comment, adds no label, and pushes nothing

#### Scenario: Wakeup ruft den Babysitter best-effort auf
- **GIVEN** `wakeup.sh` runs one tick
- **WHEN** the pre-dispatcher steps execute
- **THEN** it invokes `scripts/factory/babysit-prs.sh` exactly once outside the per-brand loop, prefixes its output, and continues the tick even if the step fails

### Requirement: Executing QA-Lens in der Verify-Phase

The system SHALL, only at risk-tier `full`, run an executing `qa`-lens during the Verify phase in addition to the diff-reading review lenses. The qa-lens is implemented as a standalone CLI (`scripts/factory/qa-lens.mjs`) that pipeline.js spawns as a subprocess and whose stdout is a `REVIEW_SCHEMA`-shaped `{ findings, summary }` object. The qa-lens SHALL execute `task test:changed` for the feature worktree through the sandbox runner (`scripts/factory/sandbox-run.sh`), and — when staging is available — deploy the feature branch pre-merge to the shared `workspace-staging` namespace (`ENV=staging`) and run a Playwright smoke against staging plus a read-only regression smoke against live prod. Its findings SHALL be appended to the existing `reviews` array before the blocking decision, so that `high`/`critical` qa-findings block the merge through the unchanged rawBlocking/coordinator logic. The lens SHALL be disableable via `FACTORY_QA_LENS=off`. Smoke base URLs SHALL be resolved from environment configuration (`WEBSITE_SITE_URL`, `PROD_DOMAIN`) and never contain a hardcoded brand-domain literal.

#### Scenario: Full-tier diff with a runtime regression
- **GIVEN** risk-tier `full` and a feature branch whose new code fails a Playwright smoke against staging
- **WHEN** the qa-lens deploys the branch to `workspace-staging` and runs the staging smoke
- **THEN** the qa-lens returns a finding with `severity=high`, that finding is merged into `reviews`, and the pipeline sets the ticket to `blocked`

#### Scenario: Lower tier skips the qa-lens
- **GIVEN** risk-tier `trivial` or `lite`
- **WHEN** the Verify phase selects its lenses
- **THEN** the qa-lens is not executed and no staging deploy occurs

#### Scenario: qa-lens is disabled by flag
- **GIVEN** risk-tier `full` and `FACTORY_QA_LENS=off`
- **WHEN** the Verify phase runs
- **THEN** the qa-lens subprocess is not spawned and the remaining review lenses run unchanged

---

### Requirement: Staging-Lock serialisiert das geteilte workspace-staging

The system SHALL serialize concurrent qa-lens staging deploys through a new `agent-lock.sh` scope `staging`, because `workspace-staging` is a single shared namespace and only one feature branch may occupy it at a time. The qa-lens SHALL claim the lock with `agent-lock.sh claim staging <ticket> --branch <branch> --worktree <worktree> --label qa-lens` before deploying, and SHALL release it with `agent-lock.sh release staging <ticket>` in a `finally` block so the lock is freed even when the deploy or smoke throws.

#### Scenario: Second full-tier ticket waits for the lock
- **GIVEN** ticket A holds the `staging` lock and ticket B (also tier `full`) reaches its qa-lens
- **WHEN** ticket B attempts `agent-lock.sh claim staging`
- **THEN** the claim does not succeed while A holds it, and B does not deploy to `workspace-staging` concurrently

#### Scenario: Lock is released after a failing smoke
- **GIVEN** the qa-lens holds the `staging` lock and the Playwright smoke throws
- **WHEN** the qa-lens exits
- **THEN** the `finally` block releases the `staging` lock so the next ticket can claim it

---

### Requirement: Degradationspfad ohne Staging

The system SHALL degrade gracefully when the staging lock cannot be acquired within `FACTORY_QA_STAGING_LOCK_TIMEOUT` (default 900 s), when `FACTORY_QA_SKIP_STAGING=1` is set, or when the staging deploy fails. In that case the qa-lens SHALL still run `task test:changed`, skip the staging and prod smoke, and return exactly one `severity=medium` finding describing the degradation instead of a blocking `high` finding. A degraded run SHALL NOT block the merge on the missing staging coverage alone.

#### Scenario: Staging lock times out
- **GIVEN** the `staging` lock is held by another ticket for the entire `FACTORY_QA_STAGING_LOCK_TIMEOUT`
- **WHEN** the qa-lens gives up claiming the lock
- **THEN** it runs `task test:changed` only and returns a single `severity=medium` finding, and the merge is not blocked by the qa-lens

#### Scenario: test:changed failure does not escalate a degraded run
- **GIVEN** a degraded qa-lens run (staging unavailable) where `task test:changed` also fails
- **WHEN** the qa-lens reports its findings
- **THEN** it still returns exactly one `severity=medium` finding — the `test:changed` failure detail is folded into that finding's description rather than emitted as a separate `severity=high` finding, so a degraded run never blocks the merge on its own

### Requirement: Non-critical mishap bundles auto-stage a chore plan

The `mishap-tracker` skill SHALL, immediately after a mishap bundle ticket is created,
decide whether the bundle is critical by inspecting the entry types of its own
`MISHAP_LOG` (the source list it already holds in session). A bundle is critical when at
least one entry has `type` `broken` or `security` — mirroring the `hasCritical`
computation in `scripts/ticket-mcp/go/internal/tools/mishap.go`. For a critical bundle the
skill SHALL leave the ticket untouched (`status=triage`) for manual triage, exactly as
today. For a non-critical bundle (only `degraded`/`suspicious`/`drift`) the skill SHALL
author, lint-gate, and stage a real OpenSpec chore plan, then set the ticket to
`status=plan_staged` on a `chore/<slug>` branch.

The skill SHALL NOT rely on `ticket.sh get` for the criticality decision, because that
command's JSON output does not expose a `severity` field.

#### Scenario: Non-critical bundle is auto-staged

- **GIVEN** a mishap bundle whose entries are all `degraded`, `suspicious`, or `drift`
- **WHEN** the `mishap-tracker` finishes creating the bundle ticket
- **THEN** it runs `openspec.sh propose`, delegates authoring of `tasks.md`, passes
  `plan-lint.sh`, calls `ticket.sh stage-plan --branch chore/<slug>` and commits+pushes the
  branch, leaving the ticket at `status=plan_staged`

#### Scenario: Critical bundle stays manual

- **GIVEN** a mishap bundle with at least one `broken` or `security` entry
- **WHEN** the `mishap-tracker` finishes creating the bundle ticket
- **THEN** no auto-plan flow runs and the ticket remains at `status=triage`

#### Scenario: A failed plan-lint aborts without staging

- **GIVEN** a non-critical bundle whose authored `tasks.md` fails `plan-lint.sh` after the
  bounded retries
- **WHEN** the `mishap-tracker` gives up
- **THEN** it does NOT call `stage-plan`, the ticket remains at `status=triage`, and the run
  reports the lint failure

### Requirement: The Software Factory picks up staged task tickets

The Software Factory scheduling pipeline SHALL consume `type='task'` and `type='bug'`
tickets at `status='plan_staged'` in addition to `type='feature'` backlog tickets, so that
a chore plan staged by the `mishap-tracker` and a fix plan staged by `dev-flow-plan` are
both implemented, PR'd, and merged without human intervention. Task and bug tickets SHALL
NOT require the feature-only `lastenheft_locked` readiness flag, because the staged plan is
itself authored and lint-gated by `stage-plan`. Task and bug tickets SHALL share one single
dispatch branch in the `queue.sh` WHERE clause, so that the `execution_released` and
`factory_excluded` readiness gates apply identically to both types and cannot drift apart.
The pipeline SHALL treat `chore/<slug>` work branches as first-class alongside `feature/*`
and `fix/*` for the deploy guard, produce a `chore(...)`-prefixed PR title for them, and
derive the pipeline slug from any `feature|fix|chore` branch prefix.

#### Scenario: queue.sh surfaces a staged task ticket

- **GIVEN** a `type='task', status='plan_staged'` ticket
- **WHEN** `scripts/factory/queue.sh` runs for that brand
- **THEN** the ticket appears in the candidate JSON without needing `lastenheft_locked`

#### Scenario: queue.sh surfaces a staged bug ticket

- **GIVEN** a `type='bug', status='plan_staged'` ticket whose plan was staged by `dev-flow-plan`
- **WHEN** `scripts/factory/queue.sh` runs for that brand
- **THEN** the ticket appears in the candidate JSON without needing `lastenheft_locked`

#### Scenario: the readiness gates hold for staged bug tickets

- **GIVEN** a `type='bug', status='plan_staged'` ticket carrying `readiness.factory_excluded=true`
  (set by `ticket.sh unfactory`) or `readiness.execution_released=false` (set by `stage-plan --hold`)
- **WHEN** `scripts/factory/queue.sh` runs for that brand
- **THEN** the ticket is absent from the candidate JSON, exactly as for a task ticket

#### Scenario: slots.sh claims a slot for a staged task ticket

- **WHEN** `scripts/factory/slots.sh claim <ext_id> <n>` runs for a `plan_staged` task ticket
- **THEN** the claim succeeds and the ticket moves to `status=in_progress`

#### Scenario: pipeline handles a chore branch

- **GIVEN** a work branch `chore/<slug>` auto-detected from the ticket's `FACTORY-PLAN-REF`
- **WHEN** `scripts/factory/pipeline.js` reaches the deploy phase
- **THEN** the branch passes the `^(feature|fix|chore)/` HARD-GUARD and the PR is opened with
  a `chore(<slug>): …` title

#### Scenario: dispatcher-bridge extracts the slug from a chore branch

- **GIVEN** a launch row whose `branch` is `chore/<slug>`
- **WHEN** `scripts/factory/dispatcher-bridge.sh` derives the slug
- **THEN** it yields `<slug>` with no leading `chore/` (no slash leak into the worktree path)

### Requirement: Semi-automatic eval fixture generator

The system SHALL provide a semi-automatic fixture generator, invoked as
`task factory:eval:gen -- <TICKET_EXT_ID>`, that produces a curatable golden-fixture
proposal for a merged Software-Factory ticket without overwriting any existing fixture.
The generator SHALL source the ticket record from `scripts/ticket.sh get --id <ext_id>`,
resolve the linked pull request via the `tickets.ticket_links` record (`kind='pr'`,
`pr_number IS NOT NULL`), derive the changed-file list from `gh pr diff <pr> --name-only`,
and record the pull request's merge-base as `base_commit`. Threshold, `forbidden`, and
`tests` fields SHALL be emitted as an editable skeleton for human curation, never as an
authoritative final value.

#### Scenario: Generator emits a curatable fixture proposal

- **GIVEN** a merged Software-Factory ticket `T000725` with a linked PR in `tickets.ticket_links`
- **WHEN** an operator runs `task factory:eval:gen -- T000725`
- **THEN** a fixture directory `tests/factory-eval/fixtures/T000725/` is created containing
  `ticket.json` (title/type/brand/external_id from the DB record), an `expected.json`
  skeleton whose `files` come from `gh pr diff --name-only`, and a `meta.json` carrying
  `base_commit`, `pr_number`, `generated_at`, and `source: "eval-gen"`

#### Scenario: Generator never overwrites an existing fixture

- **GIVEN** an existing fixture directory `tests/factory-eval/fixtures/T000726/`
- **WHEN** an operator runs `task factory:eval:gen -- T000726`
- **THEN** the generator refuses to overwrite the existing fixture and exits non-zero
  with a message naming the existing path

### Requirement: Eval fixture meta.json with base_commit

The eval fixture schema SHALL support an optional `meta.json` file
(`{ base_commit, pr_number, generated_at, source }`) alongside the existing
`ticket.json` and `expected.json`. Fixtures without `meta.json` SHALL remain valid and
scoreable exactly as before, with the scorer falling back to the current `HEAD` when no
`base_commit` is recorded.

#### Scenario: Existing meta-less fixtures stay valid

- **GIVEN** the three pre-existing fixtures `T000725`, `T000726`, `T000925` with no `meta.json`
- **WHEN** `node scripts/factory/eval.mjs` runs without flags
- **THEN** all three fixtures are scored using the existing live-diff behaviour and no error
  is raised for the missing `meta.json`

### Requirement: Eval replay mode against the current agent setup

The eval harness SHALL provide a `--replay` mode
(`node scripts/factory/eval.mjs --replay [--fixture <id>] [--dry-run]`) that, per fixture,
creates an ephemeral git worktree at the fixture's `meta.base_commit` using the
git-crypt-safe worktree semantics of `scripts/worktree-create.sh`, invokes the existing
Factory implement machinery, scores the resulting `git diff --name-only`, and tears the
worktree down afterwards. The default invocation without `--replay` SHALL remain byte-for-byte
behaviourally unchanged (live-diff scoring). Each scorecard entry SHALL record `mode`
(`"replay"` or `"live"`) and `base_commit`.

#### Scenario: Replay dry-run builds and tears down a worktree without an LLM call

- **GIVEN** a fixture with a valid `meta.base_commit`
- **WHEN** an operator runs `node scripts/factory/eval.mjs --replay --fixture <id> --dry-run`
- **THEN** an ephemeral worktree is created at `base_commit` and removed again, no LLM/implement
  invocation is made, and the scorecard entry records `mode: "replay"` and the fixture's
  `base_commit`

#### Scenario: Default mode is unchanged

- **GIVEN** the eval harness with replay support present
- **WHEN** `node scripts/factory/eval.mjs` runs without `--replay`
- **THEN** it scores the live git diff exactly as before and every scorecard entry records
  `mode: "live"`

### Requirement: Eval score persistence via phase-event detail

When the Factory verify phase runs on a ticket for which a golden fixture exists, the
pipeline SHALL embed a compact JSON eval-context string into the `detail` column of the
`tickets.factory_phase_events` verify event. The `detail` column is `TEXT`; the score
SHALL be stored as an embedded JSON string with no schema migration. The eval-context
computation SHALL live in a pure helper module rather than inline in `pipeline.js`.

#### Scenario: Verify event carries eval context when a fixture exists

- **GIVEN** a ticket `T000726` that has a matching fixture under `tests/factory-eval/fixtures/`
- **WHEN** the Factory pipeline records its verify phase event
- **THEN** the `detail` of the `verify` `factory_phase_events` row contains a compact JSON
  eval-context string and no new database column or migration is introduced

#### Scenario: CI advisory warning on agent-setup changes

- **GIVEN** a pull request that modifies an agent-setup path (`.opencode/agent-models.jsonc`,
  `scripts/factory/review-*.prompt.md`, `scripts/factory/provider-router.js`, or `AGENTS.md`)
- **WHEN** the CI Factory job runs
- **THEN** the job emits a `::warning::` advising a local `task factory:eval:replay`, and a
  pull request that touches none of those paths emits no such warning

### Requirement: Partial-Plan Lifecycle with partial-done Events and Review Rotation

The pipeline SHALL, when a staged change contains a `tasks.d/` directory, read
the partial plans host-side (pipeline-runner command `read-partials`, backed by
`scripts/factory/pipeline-partials.cjs`) and feed them into the generalized
batch path; the runtime `plan:decompose` agent remains the fallback for legacy
plans without partials. Disjointness of the partials' target files SHALL be
re-validated at runtime via `validateDisjoint` from
`scripts/factory/pipeline-decompose.cjs`. Each completed partial SHALL be
recorded as a phase event on `tickets.factory_phase_events` with
`phase='implement'`, `state='partial-done'` and a structured JSON `detail`
(`{partial, files, tests}`). Once ALL `impl` partials have reported
`partial-done`, the review SHALL start as a continuation of the tests-partial
agent (same prompt prefix as its test run for a llama-server prompt-cache hit)
augmented with the diffs of the other partials and an embedding comparison via
factory-mcp `openspec_find_similar`. Slot release and ticket closure stay
unchanged (Merge = Abschluss).

#### Scenario: Partial completion is visible on the factory floor

- **GIVEN** a partial `p1` finished implementing its target files with passing local tests
- **WHEN** the pipeline records the completion
- **THEN** a row appears in `tickets.factory_phase_events` with `phase='implement'`, `state='partial-done'` and a JSON `detail` naming the partial id, its files, and the test result

#### Scenario: Review rotation waits for all impl partials

- **GIVEN** a 3-partial gang where `p1` reported `partial-done` but `p2` has not
- **WHEN** the pipeline evaluates `rotationReady`
- **THEN** the review does NOT start; it starts only after `p2` also reports `partial-done`, and then runs as the continuation of the `p3` tests agent

#### Scenario: Legacy plan without partials uses the decompose fallback

- **GIVEN** a staged plan whose change directory has no `tasks.d/`
- **WHEN** the pipeline runs `read-partials`
- **THEN** the runner reports `partials: false` and the pipeline falls back to the runtime `plan:decompose` path unchanged

### Requirement: Bonsai Provider Registration for Implement and Review

The system SHALL provide an idempotent registration script
(`scripts/factory/provider-register-bonsai.sh`) that registers the local Bonsai
llama.cpp server (`llamacpp`, model `ternary-bonsai-27b`, base URL
`http://127.0.0.1:8093/v1`, `max_concurrent=3`) in `tickets.provider_config`
via `ON CONFLICT (source, tier, priority) DO UPDATE` and pins
`tickets.factory_model_slots` for `phase='implement'` and `phase='verify'` via
`ON CONFLICT (phase) DO UPDATE`, for both brands. Scout and Plan phases keep
their existing routing. The server-side slot budget convention is `-np 4` = 3
factory workers + 1 orchestrator; the factory DB pool stays at 3.

#### Scenario: Registration is idempotent

- **GIVEN** the registration script already ran once
- **WHEN** it runs a second time
- **THEN** it exits 0 and the end state is identical — no duplicate rows in `provider_config` or `factory_model_slots`

#### Scenario: Implement and review phases route to Bonsai

- **GIVEN** the registration script has run
- **WHEN** `route-provider.sh factory-implement sonnet` or the review path resolves a provider
- **THEN** the phase-pinned `factory_model_slots` row wins and returns `llamacpp` with base URL `http://127.0.0.1:8093/v1`

### Requirement: PR Creation Gate after Local Verify and Completed Review

The pipeline SHALL create a pull request only after (a) `task test:all && task
freshness:check` passed locally on the work branch AND (b) the rotated
p3-review completed. This authorization SHALL be signalled as a phase event on
`tickets.factory_phase_events` with `phase='verify'` and `state='pr-ready'`
(structured JSON `detail`). Before that event exists, the Deploy phase SHALL
only push the branch (no `gh pr create`, no auto-merge queue) and end with
status `pending-pr-gate`. The gate check runs host-side (pipeline-runner
command `pr-gate`, helper `prGateSatisfied` in
`scripts/factory/pipeline-partials.cjs`).

#### Scenario: No PR without the pr-ready event

- **GIVEN** a ticket whose local verify has not yet passed and whose review is still running
- **WHEN** the Deploy phase evaluates the `pr-gate` command
- **THEN** it receives `pr_ready: false`, pushes only the branch, creates no PR, and returns `pending-pr-gate`

#### Scenario: pr-ready authorizes the PR

- **GIVEN** `task test:all && task freshness:check` passed locally and the rotated p3-review finished
- **WHEN** the pipeline emits the `verify`/`pr-ready` phase event and the Deploy phase re-evaluates the gate
- **THEN** the PR is created and auto-merge is queued (`gh pr merge --squash --auto`)

### Requirement: Ticket-scoped CI Babysit Loop for the Own PR

After PR creation and auto-merge queueing, the orchestrator SHALL babysit the
CI checks of its OWN PR via `scripts/factory/pr-babysit-ticket.sh <ticket_id>
<pr_number>` (GitHub CLI via `gh-axi`, polling cadence per the ci-fix-loop
reference). On a failing check it SHALL dispatch a fix subagent with the check
name, a failure-log excerpt, and the affected files, wait synchronously for
its return, and then RE-CHECK ALL checks: any check that turned red in the
meantime SHALL be fixed first. Auto-merge SHALL only be re-queued when no
known-red check remains (green or pending are acceptable). Failure
classification SHALL be reused from `scripts/factory/classify-failure.sh`
(`classify_failure <ci-log-file>`); the loop complements the repo-wide
`scripts/factory/babysit-prs.sh` scanner and does not replace it. After
`MAX_CI_ATTEMPTS` (default 5) the loop SHALL exit non-zero and escalate via
the existing blocked path.

#### Scenario: Red check is fixed and merge is re-queued

- **GIVEN** the own PR has one failing required check and auto-merge is queued
- **WHEN** the babysit loop detects the failure
- **THEN** it dispatches a fix subagent with check name, log excerpt, and affected files, waits for its return, re-checks all checks, and re-queues auto-merge once everything is green or pending

#### Scenario: A second check turns red before requeue

- **GIVEN** the fix subagent for the first red check returned successfully
- **WHEN** the re-check finds that another check has turned red in the meantime
- **THEN** the loop fixes the newly red check first and does NOT re-queue auto-merge until no known-red check remains

#### Scenario: Attempt limit escalates instead of looping forever

- **GIVEN** the loop reached `MAX_CI_ATTEMPTS` with checks still red
- **WHEN** the limit is evaluated
- **THEN** the script exits non-zero with the list of red checks and the pipeline escalates via the existing blocked path (`update-status --status blocked` + notification)

### Requirement: Parallel-Status Endpoint

The system SHALL expose an admin-guarded `GET /api/factory/parallel-status` endpoint that
returns the current gang-scheduling state derived from `tickets.tickets`: the number of gang
tickets (`slot_count > 1` and claimed), the total slots claimed, the per-brand slot cap, and
the derived next scheduled tick timestamp.

#### Scenario: Unauthenticated request is rejected

- **GIVEN** a request without a valid session
- **WHEN** `GET /api/factory/parallel-status` is called
- **THEN** the endpoint responds with HTTP 401 and does not query the database

#### Scenario: Non-admin request is rejected

- **GIVEN** a request with a valid but non-admin session
- **WHEN** `GET /api/factory/parallel-status` is called
- **THEN** the endpoint responds with HTTP 403

#### Scenario: Admin receives aggregated gang state

- **GIVEN** an admin session and tickets with mixed `slot_count` values
- **WHEN** `GET /api/factory/parallel-status` is called
- **THEN** the endpoint responds with HTTP 200 and a JSON body containing `gangTickets`,
  `slotsClaimed`, `slotsPerBrand`, and `nextTickAt`

### Requirement: Force-Tick Trigger

The system SHALL expose an admin-guarded `POST /api/factory/force-tick` endpoint that records
a force-tick request by writing the `force-tick-requested` control key (ISO timestamp) into
`tickets.factory_control`, so the next factory tick consumes it. The endpoint SHALL be
idempotent — repeated calls only overwrite the timestamp.

#### Scenario: Admin forces the next tick

- **GIVEN** an admin session
- **WHEN** `POST /api/factory/force-tick` is called
- **THEN** the `force-tick-requested` control key is written with the current timestamp and the
  endpoint responds with HTTP 200

#### Scenario: Factory tick consumes and clears the force-tick flag

- **GIVEN** a `force-tick-requested` control key is set
- **WHEN** `scripts/factory/wakeup.sh` starts a tick
- **THEN** it logs that the tick was forced, clears the `force-tick-requested` key, and writes
  `last-tick-at` with the tick completion time

### Requirement: Parallel-Status Panel

The admin dev-status UI SHALL provide a `parallel` tab that fetches `/api/factory/parallel-status`,
renders the gang state, shows a countdown timer toward `nextTickAt` that displays a due state at
zero, and offers a "Force next tick" button that posts to `/api/factory/force-tick` and refetches.

#### Scenario: Panel is deep-linkable

- **GIVEN** the admin pipeline page
- **WHEN** it is opened with `?tab=parallel`
- **THEN** the parallel-status tab is active on load

#### Scenario: Countdown reaches zero

- **GIVEN** the panel is showing a countdown toward `nextTickAt`
- **WHEN** the remaining time reaches zero or below
- **THEN** the panel shows a "tick due" state and refetches the status

### Requirement: Every claimed provider slot is released on all return paths

Any script that obtains a slot from `scripts/factory/route-provider.sh` SHALL release it again on
**every** return path, including error paths. A claim increments
`tickets.provider_health.active_agents`; a provider whose counter reaches `max_concurrent` is
silently skipped by the candidate chain, without any error being surfaced to the caller.

Scripts that claim more than once per run SHALL NOT rely on an `EXIT` trap alone, because such a
trap releases only the final claim.

#### Scenario: The triage helper releases its slot after a successful call

- **GIVEN** `auto-triage.sh` has routed a ticket and holds a slot for provider `deepseek`
- **WHEN** the LLM call completes successfully
- **THEN** `active_agents` for `deepseek` is back at its pre-call value

#### Scenario: The triage helper releases its slot after a failed call

- **GIVEN** `auto-triage.sh` holds a slot and the downstream `curl` fails
- **WHEN** the helper returns a non-zero status
- **THEN** the slot is released just as on the success path

#### Scenario: A provider at its concurrency cap is skipped, not reported

- **GIVEN** `tickets.provider_health.active_agents` for a provider equals its `max_concurrent`
- **WHEN** `route-provider.sh` walks the candidate chain
- **THEN** that provider is passed over and the next candidate is claimed instead

### Requirement: Orphaned provider slots are reclaimed after a TTL

`tickets.provider_health` SHALL record `claimed_at` for every active claim, and
`scripts/factory/reap-provider-slots.sh` SHALL release **all** claims of a row whose `claimed_at` is
older than `PROVIDER_SLOT_TTL_MIN` (default 30) by setting `active_agents` and `reserved_tokens` to
zero. The TTL SHALL stay well above the runtime of a single LLM request — a shorter value would
release slots of requests still in flight and thereby defeat the concurrency limit it is meant to
protect.

Zeroing rather than decrementing is required for correctness, not merely for speed: `claimed_at`
records the **most recent** claim of a row, so a row that qualifies holds no fresh claim at all and
every slot on it is orphaned. Decrementing by one while clearing `claimed_at` in the same statement
made the row unreachable after the first run, because `claimed_at IS NOT NULL` never matched again —
the counter stayed permanently above zero and the provider was skipped by the candidate chain for good.

The reaper SHALL be invoked once per factory tick from `scripts/factory/wakeup.sh`, before the tick
claims any candidates. It is deliberately bound to the tick rather than to an independent timer: a
reaper that runs while the factory is stopped could reclaim slots of requests that are still active.

#### Scenario: A stale claim is reclaimed completely

- **GIVEN** a provider row with several concurrent claims whose `claimed_at` is older than the TTL
- **WHEN** the reaper runs once
- **THEN** `active_agents` and `reserved_tokens` are zero and `claimed_at` is reset to `NULL`

#### Scenario: A fresh claim is left alone

- **GIVEN** a provider row whose `claimed_at` lies within the TTL
- **WHEN** the reaper runs
- **THEN** the row is left untouched

#### Scenario: Releasing one of several concurrent claims keeps the timestamp

- **GIVEN** a provider holds more than one concurrent claim
- **WHEN** `release-slot.sh` releases one of them
- **THEN** `claimed_at` is retained, so the reaper can still see the remaining claim

#### Scenario: The reaper runs on every factory tick

- **GIVEN** a factory tick starts
- **WHEN** `wakeup.sh` prepares the tick
- **THEN** it invokes the reaper before dispatching, best-effort, so a reaper failure never aborts
  the tick

### Requirement: Provider names are free of structural characters

`tickets.provider_health.provider` SHALL reject values containing a backslash, tab or any other
whitespace. Such values indicate a failed field split, where an entire result row was written as a
single provider name.

#### Scenario: A malformed provider name is rejected

- **GIVEN** an insert whose provider value contains an escaped tab sequence
- **WHEN** the row is written to `tickets.provider_health`
- **THEN** the database rejects it via a CHECK constraint

### Requirement: Tests never write to production routing tables or the working tree

Test suites SHALL NOT write to `tickets.provider_config`, `tickets.provider_health` or the repository
working tree. Argument-validation tests SHALL use a dry-run mode that stops before any database
access, and shell tests that change directory SHALL fail loudly if the change fails — bats does not
set `set -e` inside `@test` blocks, so an unguarded `cd` lets subsequent commands run against the
real repository root.

#### Scenario: Validation is tested without touching the database

- **GIVEN** a test asserting that `provider-config.sh set` accepts `tier=opus` with a warning
- **WHEN** the test invokes the script with `--dry-run`
- **THEN** the warning is emitted and no row is written to `tickets.provider_config`

#### Scenario: A failed directory change aborts the test

- **GIVEN** a test that changes into a temporary repository before creating files
- **WHEN** the directory change fails
- **THEN** the test returns non-zero instead of creating those files in the repository root

### Requirement: Ticket CLI auto-tick wake never blocks on the factory tick

Every subcommand of the ticket CLI that wakes `factory.service` SHALL complete without
waiting for a running factory tick to finish. This covers `release-hold` in
`scripts/ticket.sh` and the auto-tick wake in `scripts/vda/ticket/stage-plan.sh`. Both
write their control keys, then wake the dispatcher with a non-blocking
`systemctl --user start --no-block factory.service`. The success confirmation SHALL be
emitted before the systemd call, so the state change is reported even when systemd is
unreachable or stalled.

`factory.service` is a `Type=oneshot` unit with `RuntimeMaxSec=3600`; a blocking
`systemctl start` attaches to the already running job and waits for its completion, which
made the command hang silently for the duration of the tick.

#### Scenario: A factory tick is already running

- **GIVEN** `factory.service` is currently activating a long-running oneshot job
- **WHEN** an operator runs `scripts/ticket.sh release-hold --id <ticket>`
- **THEN** the command returns promptly with exit code 0 and prints
  `execution_released set to true for ticket <ticket>`, instead of blocking until the tick
  completes

#### Scenario: Staging a plan while a factory tick is running

- **GIVEN** `factory.service` is currently activating a long-running oneshot job
- **WHEN** an operator runs `scripts/ticket.sh stage-plan` without `--hold`
- **THEN** the command returns promptly after writing the `force-tick-requested` control
  key and prints its `staged in Kommissionierung` confirmation, instead of blocking until
  the tick completes

#### Scenario: systemd is unreachable

- **GIVEN** the `systemctl` call fails or is unavailable
- **WHEN** an operator runs `scripts/ticket.sh release-hold --id <ticket>`
- **THEN** the readiness flag and the `force-tick-requested` control key are still written,
  the confirmation is still printed, and the next scheduled tick picks the ticket up

### Requirement: Permanent dispatch exclusion via unfactory

The system SHALL provide `ticket.sh unfactory --id <external_id>` as the terminal state for
a ticket the Software Factory could not complete. The subcommand SHALL set, in one
statement block so no partially applied state can be observed:

- `status = blocked`
- `attention_mode = needs_human`
- `readiness.factory_excluded = true`
- a closing comment naming the attempt count and the most recent phase event

`scripts/factory/queue.sh` SHALL exclude tickets carrying
`readiness.factory_excluded = true` from **both** dispatch branches (the
`type='feature' AND status='backlog'` branch and the `type='task' AND status='plan_staged'`
branch) via `COALESCE((readiness->>'factory_excluded')::boolean, false) = false`. The
default `false` is deliberate: an absent flag SHALL NOT exclude a ticket, consistent with
`lastenheft_locked` (default false) and `execution_released` (default true).

The exclusion SHALL survive a later status change, so returning the ticket to
`plan_staged` by hand or by another script does NOT re-expose it to dispatch. Clearing the
flag SHALL require an explicit human action
(`ticket.sh plan-meta set --readiness factory_excluded=false`).

#### Scenario: Unfactored ticket is not dispatched even in a dispatchable status

- **GIVEN** Ticket T002338 (`type=task`) carries `readiness.factory_excluded = true` and
  someone sets its status back to `plan_staged`
- **WHEN** `queue.sh` runs for its brand
- **THEN** T002338 does not appear in the returned JSON array

#### Scenario: Tickets without the flag are unaffected

- **GIVEN** Ticket T002400 (`type=task`, `status=plan_staged`) has no `factory_excluded`
  key in its `readiness` object
- **WHEN** `queue.sh` runs for its brand
- **THEN** T002400 appears in the returned JSON array

### Requirement: Phase Pin Is the First Candidate, Not a Shortcut

`scripts/factory/route-provider.sh` SHALL treat a matching row in `tickets.factory_model_slots` as
the highest-priority candidate of the same selection chain that evaluates `tickets.provider_config`,
and SHALL NOT return from the phase branch without passing through the cooldown check and the atomic
slot claim. A phase pin expresses a preference, not a bypass: returning early skipped the priority
chain, `provider_health`, the cooldown window and the claim entirely, which made the whole fallback
logic dead code for the `plan`, `implement` and `verify` phases.

#### Scenario: Pinned provider is claimed like any other candidate

- **GIVEN** `tickets.factory_model_slots` holds a row for phase `implement`
- **WHEN** `route-provider.sh factory-implement sonnet` runs against a reachable database
- **THEN** the pinned provider is offered to the same claim loop as the `provider_config` rows, and
  the emitted JSON carries a non-null `slotId` because a slot was actually claimed

#### Scenario: Blocked pin falls through to the next candidate

- **GIVEN** the pinned provider for a phase sits at `active_agents = max_concurrent`
- **WHEN** the router resolves that phase
- **THEN** the pin is skipped and the next candidate from `provider_config` is claimed, instead of
  the router returning the blocked provider

#### Scenario: Exhausted chain is announced, not returned silently

- **GIVEN** every candidate for a source/tier is claimed out or on cooldown
- **WHEN** the router falls through to the emergency branch
- **THEN** it writes a diagnostic naming the source and tier to stderr, and the emitted JSON carries
  `emergency: true` together with a model id that a reachable backend actually serves

### Requirement: Provider API Keys Are Resolved by Variable Name from the Routing Row

The routing row SHALL carry the **name** of the environment variable holding the provider's API key
in `api_key_env`, the router SHALL emit it as `apiKeyEnv`, and callers SHALL resolve the key by
indirection over that name. No caller SHALL map provider names to key variables itself: a provider
name cannot distinguish two accounts of the same vendor, which is how the factory ended up sending
the coaching key `DEEPSEEK_API_KEY` instead of the factory key `DEEPSEEK_API_KEY_PK`.

The column SHALL never hold a key value. Keys stay git-crypt-encrypted in the environment secrets.

#### Scenario: Caller resolves the factory key, not the coaching key

- **GIVEN** the routing row for the factory's `deepseek` candidate has `api_key_env = 'DEEPSEEK_API_KEY_PK'`
- **WHEN** `auto-triage.sh` builds the request for that provider
- **THEN** it reads the variable named by `apiKeyEnv` and uses the factory account's key

#### Scenario: Provider without a key stays usable

- **GIVEN** a routing row for a local backend with `api_key_env` NULL
- **WHEN** a caller resolves the key for that route
- **THEN** no key is set and no `Authorization` header is sent, and the call proceeds normally

#### Scenario: Missing key is reported, not silently empty

- **GIVEN** a routing row names an environment variable that is unset in the caller's environment
- **WHEN** the caller resolves the key
- **THEN** it writes a diagnostic naming the missing variable to stderr

### Requirement: Every Factory Tier Has a Fallback Candidate Behind the Primary

`tickets.provider_config` SHALL hold at least two `enabled` candidates for each tier the factory
actually requests (`cheap`, `flash`, `sonnet`), so that the cascade has something to fall to. The
stages SHALL be layered by failure domain: the local proxy first, the local backend directly second
(covering a proxy outage while the backend runs), and a cloud provider third (covering a total
outage of the GPU host).

#### Scenario: Each requested tier offers more than one candidate

- **GIVEN** the cascade migration has been applied
- **WHEN** the enabled `source = '*'` rows are counted per tier for `cheap`, `flash` and `sonnet`
- **THEN** every one of those tiers has at least two candidates

#### Scenario: Cloud stage carries its key variable name

- **GIVEN** the third-stage cloud candidate of a factory tier
- **WHEN** its routing row is read
- **THEN** `api_key_env` names the factory account's key variable and `base_url` addresses the
  OpenAI-compatible path that the callers append `/v1/chat/completions` to

### Requirement: Configured Model IDs Are Checked Against Live Backends

The system SHALL provide a check (`scripts/llm/routing-check.sh`, exposed as `task llm:routing:check`)
that fails when a configured model id is served by no reachable local backend. It SHALL cover both
sources of model ids — the routing tables in the database and the factory environment file — because
`resolveModel()` in the llm-proxy silently redirects unknown models to the first healthy backend,
so a drifted id produces no error anywhere on its own.

#### Scenario: Phantom model id fails the check

- **GIVEN** a configured model id that no reachable local backend serves
- **WHEN** the check runs with at least one backend reachable
- **THEN** it names the offending id and its source on stderr and exits non-zero

#### Scenario: Check is fail-soft without any backend

- **GIVEN** no local backend answers
- **WHEN** the check runs
- **THEN** it reports that it was skipped and exits zero, because it cannot make any statement

#### Scenario: Cloud endpoints are not probed

- **GIVEN** a routing row whose `base_url` addresses an `https://` cloud endpoint
- **WHEN** the check runs
- **THEN** that row is skipped, because its catalogue is not retrievable without an API key

### Requirement: Pod-Phase Guard Is Match-Granular and Covers Tests

The system SHALL enforce that every `shared-db` pod selection in the repository carries
`--field-selector status.phase=Running`, evaluated **per logical line** rather than per file.
A logical line is the result of joining backslash continuations. The guard SHALL scan both
`scripts/` and `tests/` and SHALL include `*.sh` and `*.bats` files. A selection that is
deliberately unfiltered SHALL carry an explicit opt-out marker on the same logical line;
without that marker the guard SHALL report it.

Rationale: an unfiltered selection can return a `Completed` or `Terminating` pod, after which
`kubectl exec` fails with exit code 1. A file-granular guard passes any file that mentions the
filter anywhere — including a file that only mentions it inside the guard's own search pattern.

#### Scenario: An unfiltered selection in a test file is reported

- **GIVEN** a file under `tests/` contains a `shared-db` pod selection without
  `--field-selector status.phase=Running` and without an opt-out marker
- **WHEN** the guard runs
- **THEN** the guard fails and names that file

#### Scenario: A filter elsewhere in the same file does not excuse an unfiltered selection

- **GIVEN** a file contains one selection carrying `--field-selector status.phase=Running`
  and a second selection on a different logical line carrying no filter and no opt-out marker
- **WHEN** the guard runs
- **THEN** the guard fails, because the presence of a filter on one line does not cover the other

#### Scenario: A selection split across lines by a backslash continuation counts as filtered

- **GIVEN** a selection whose `--field-selector status.phase=Running` sits on the continuation
  line after a trailing backslash
- **WHEN** the guard runs
- **THEN** the guard treats the joined logical line as filtered and does not report it

#### Scenario: A deliberately unfiltered selection is tolerated only with its marker

- **GIVEN** the error path in `scripts/vda/ticket/_ticket-core.sh` queries pods unfiltered to
  distinguish "no pod at all" from "pods exist, none Running", and carries the opt-out marker
- **WHEN** the guard runs
- **THEN** the guard does not report that line
- **AND** removing the marker makes the guard report it

### Requirement: Database-Dependent Tests Skip on Absent Running Pod

The system SHALL make test helpers that require a live `shared-db` connection skip when no
**Running** pod is reachable, not merely when no pod object is found. A helper that finds a
non-Running pod SHALL skip rather than proceed into a `kubectl exec` that exits non-zero.

#### Scenario: Only a non-Running pod exists

- **GIVEN** the namespace contains a `shared-db` pod in phase `Succeeded` and none in `Running`
- **WHEN** a database-dependent test invokes its skip helper
- **THEN** the test is skipped
- **AND** the test run does not report a failure or a non-zero exit code from `kubectl exec`

### Requirement: touched_files Distinguishes Unscouted from Empty

The system SHALL keep `tickets.tickets.touched_files` nullable without a default. `NULL` SHALL
mean "no scout has recorded files for this ticket"; an empty array SHALL mean "scout ran and
found no files". Conflict detection SHALL rely on this distinction.

Rationale: a `NOT NULL DEFAULT '{}'` migration would make both states indistinguishable and
silently turn every unscouted ticket into a participant in conflict detection.

#### Scenario: Conflict detection ignores unscouted tickets

- **GIVEN** a ticket whose `touched_files` is `NULL`
- **WHEN** `conflict-check.sh` searches for colliding in-flight tickets
- **THEN** that ticket is excluded from the comparison by the `touched_files IS NOT NULL` filter

### Requirement: stage-plan Derives touched_files From the Plan

The system SHALL derive `tickets.tickets.touched_files` from the plan's `## File Structure`
section when a plan is staged, rather than relying on a later manual step. The derivation SHALL
be additive: an existing `touched_files` value SHALL be extended, never replaced, so that files
recorded during implementation survive a re-stage.

Rationale: `## File Structure` is a plan-lint hard rule (STRUCT1), so the information is
guaranteed to exist at stage time. Setting the column only in `dev-flow-execute` step 1.5 — and
there only conditionally ("if the plan knows the touched files") — makes conflict detection
depend on an agent performing an optional prose step.

#### Scenario: Staging a plan populates touched_files

- **GIVEN** a plan whose `## File Structure` section lists `scripts/foo.sh` and `tests/bar.bats`
- **WHEN** the plan is staged for a ticket whose `touched_files` is `NULL`
- **THEN** `touched_files` contains both paths

#### Scenario: Re-staging does not discard files added during implementation

- **GIVEN** a ticket whose `touched_files` already contains `scripts/extra.sh`, a file the
  implementer touched but which the plan never listed
- **WHEN** the same plan is staged again
- **THEN** `touched_files` still contains `scripts/extra.sh` alongside the plan's paths

#### Scenario: A plan without derivable paths does not block staging

- **GIVEN** a plan whose `## File Structure` section names no repository path
- **WHEN** the plan is staged
- **THEN** staging succeeds
- **AND** the absence is reported on stderr rather than passing silently

### Requirement: File Structure Parsing Covers the Three Established Formats

The system SHALL extract repository paths from a `## File Structure` section written in any of
the three formats in use: a fenced block with `NEW:`/`CHANGED:` group headers, a bullet list with
backtick-quoted paths, or a Markdown table with backtick-quoted paths. A candidate SHALL be
accepted only if it is tracked in the repository or carries a known file extension; descriptive
prose, group headers, and table column headings SHALL NOT be emitted as paths.

Rationale: of 33 plans carrying the section, 23 use the fenced form and the remainder split
between bullet and table form. Entries are not always repository paths — one plan lists a
Kubernetes resource in a namespace under this heading.

#### Scenario: Fenced form with group headers

- **GIVEN** a `## File Structure` fence containing a `NEW:` header and an indented line
  `scripts/foo.sh — adds the deriver`
- **WHEN** paths are extracted
- **THEN** `scripts/foo.sh` is emitted
- **AND** neither `NEW:` nor the description after the dash is emitted

#### Scenario: Bullet and table forms with backtick-quoted paths

- **GIVEN** a section containing the bullet ``- `tests/spec/database.bats` (modified)`` and a
  table row `` | `k3d/brett.yaml` | Add comment | ``
- **WHEN** paths are extracted
- **THEN** both `tests/spec/database.bats` and `k3d/brett.yaml` are emitted
- **AND** the table column heading is not emitted

#### Scenario: Non-path entries are rejected while real paths beside them survive

- **GIVEN** a section listing both `tests/spec/database.bats` and the cluster resource
  `deployment/arena-server in namespace workspace-korczewski`
- **WHEN** paths are extracted
- **THEN** `tests/spec/database.bats` is emitted
- **AND** `deployment/arena-server` is not emitted, because it is neither tracked in the
  repository nor carries a file extension

### Requirement: Non-critical mishap bundles reach plan_staged without a human

The Software Factory SHALL provide `scripts/factory/auto-chore-plan.sh`, an executable that
takes a Mishap-Bundle ticket and carries it from `status=triage` to `status=plan_staged`
without human intervention: it derives slug and branch, seeds the OpenSpec change, has the plan
authored, gates it on `plan-lint`, calls `stage-plan` and pushes the branch.

The factory tick SHALL invoke it, so the step cannot be skipped by an agent that forgets it.
A procedure that exists only as prose in a skill file is skipped in practice — that is the
defect this requirement removes, not a hypothetical.

The script SHALL refuse to auto-plan a ticket whose `severity` is `major` or `critical`. Those
bundles carry `broken` or `security` entries and belong in front of a human.

`plan-lint` SHALL remain a hard gate: on failure the script SHALL NOT call `stage-plan`, the
ticket SHALL stay at `status=triage`, and the lint output SHALL be reported.

The branch name SHALL carry the ticket ID unchanged, including its uppercase `T`, while the
OpenSpec directory slug is lowercase. `.githooks/pre-commit` matches `T[0-9]{6,}`
case-sensitively, so a branch derived from the lowercase slug is rejected and the whole step
dies silently.

Commit and push SHALL be chained with `&&`, because a rejected commit does not prevent a push
issued on its own line.

`.claude/skills/mishap-tracker/SKILL.md` SHALL reference the script rather than restate the
procedure, so prose and code cannot drift apart.

#### Scenario: a minor bundle is planned and staged automatically

- **GIVEN** a Mishap-Bundle ticket at `status=triage` with `severity=minor`
- **WHEN** `bash scripts/factory/auto-chore-plan.sh <ext-id>` runs
- **THEN** the ticket reaches `status=plan_staged`, a `FACTORY-PLAN-REF` comment names branch
  and plan path, and the branch is pushed

#### Scenario: a major bundle is left for human triage

- **GIVEN** a Mishap-Bundle ticket at `status=triage` with `severity=major`
- **WHEN** the same command runs
- **THEN** the ticket stays at `status=triage`, nothing is pushed, and the reason is reported

#### Scenario: a lint failure does not stage a broken plan

- **GIVEN** a bundle whose authored plan fails `plan-lint`
- **WHEN** the script reaches the lint gate
- **THEN** `stage-plan` is not called, the ticket stays at `status=triage`, and the lint output
  is reported

#### Scenario: the branch name survives the pre-commit hook

- **GIVEN** ticket `T002382`
- **WHEN** the script derives its working branch
- **THEN** the branch is `chore/mishap-T002382` with an uppercase `T`, while the OpenSpec
  directory is `openspec/changes/mishap-t002382`

### Requirement: The Software Factory BATS suite has a single source

The Software Factory regression cases SHALL live in exactly one file, `tests/spec/software-factory.bats`. The `tests/local/FA-SF-*.bats` tree from which that file was aggregated SHALL NOT be retained alongside it, and `task test:factory` SHALL run the consolidated file rather than the aggregated originals.

Rationale: the consolidation never removed its 41 source files, so every case existed twice under the same `@test` name. That duplication actively hid a defect — after `scripts/factory/pipeline.js` was deleted, a filtered run over `tests/spec/` looked green while `task test:factory` went red over the stale copies, and each follow-up pull request in the factory area had to identify the breakage as foreign before it could proceed.

#### Scenario: No aggregated duplicate of the consolidated suite remains

- **GIVEN** the consolidated suite `tests/spec/software-factory.bats`
- **WHEN** the test tree is inspected
- **THEN** no `tests/local/FA-SF-*.bats` file exists

#### Scenario: The factory task runs the consolidated suite

- **GIVEN** `task test:factory`
- **WHEN** it runs
- **THEN** it executes `tests/spec/software-factory.bats`
- **AND** it does not reference a `tests/local/FA-SF-*` glob that matches nothing

#### Scenario: Removal preserved every case

- **GIVEN** the cases that existed only in the removed files
- **WHEN** the consolidated suite runs
- **THEN** those cases are present in it, so no coverage was lost with the removal

### Requirement: REQ-SF-AUTOTICK-001 — Stage löst automatisch einen Factory-Tick aus

Beim Stagen eines Plans (`stage-plan`, nach dem `plan_staged`-Status-UPDATE) SHALL das
System idempotent das Steuer-Flag `force-tick-requested` (Tabelle
`tickets.factory_control`, `brand IS NULL`, `set_by='stage-plan'`) schreiben und
best-effort `factory.service` starten. Ein Fehlschlag des Flag-Schreibens SHALL das
Stagen NICHT fehlschlagen lassen (Degradation auf den `factory.timer`-Pfad, Warnung auf
stderr). Dieses Requirement supersedet T002102-p3 Task 1/4/5.

#### Scenario: Staging a plan wakes the factory without waiting for the timer

- **GIVEN** a ticket with a committed plan and a pushed feature branch
- **WHEN** `stage-plan --id T… --branch … --plan … --partials N` completes successfully
- **THEN** `tickets.factory_control` contains `key='force-tick-requested'` with `brand IS NULL`
- **AND** the existing consumer (`wakeup.sh`) picks up the flag on its next start and ticks immediately

#### Scenario: Flag write failure degrades gracefully

- **GIVEN** the tickets database is unreachable for the control-flag insert
- **WHEN** `stage-plan` runs
- **THEN** the plan is still staged (exit 0) and a warning is printed to stderr

### Requirement: REQ-SF-EXECUTOR-001 — Umschaltbarer Factory-Executor

`dispatcher-bridge.sh` SHALL pro Ticket-Launch anhand der Env-Variable
`FACTORY_EXECUTOR` (`claude` = Default, `opencode`) den Executor wählen. Der
`opencode`-Zweig SHALL `scripts/factory/opencode-exec.sh` im vorbereiteten
Launch-Worktree aufrufen; der `claude`-Zweig SHALL byte-identisch zum heutigen
Verhalten bleiben. Ein unbekannter Wert SHALL auf `claude` zurückfallen (Warnung).

#### Scenario: Opt-in opencode executor is used when requested

- **GIVEN** `FACTORY_EXECUTOR=opencode` in the factory environment
- **WHEN** `dispatcher-bridge.sh` launches a ticket
- **THEN** `opencode-exec.sh` is invoked in the launch worktree instead of `claude -p`

#### Scenario: Default behavior unchanged

- **GIVEN** `FACTORY_EXECUTOR` is unset
- **WHEN** `dispatcher-bridge.sh` launches a ticket
- **THEN** the existing `claude -p` spawn (flags unchanged) is used

### Requirement: REQ-SF-EXECUTOR-002 — Orchestrator-Dispatch mit Gang-Telemetrie

`opencode-exec.sh` SHALL `opencode run --agent orchestrator` mit einem Prompt aufrufen,
der Ticket-ID, Branch, Worktree-Pfad, Plan-Pfad, das `## Partials`-Manifest und die
Trial-Guardrails (kein Auto-Merge, `pr-ready`-Gate) enthält. Pro Lauf SHALL das Skript
Phase-Events schreiben (`phase=implement`, `state=entered|done|blocked` — KEINE neuen
State-Werte, vgl. T002130) mit strukturiertem `detail`-JSON
(`executor`, `subagent`, `partial`, `duration_s`, `exit`). Bei Exit ≠ 0 SHALL ein
`blocked`-Event geschrieben werden und KEIN stiller Fallback auf `claude -p` erfolgen.

#### Scenario: Successful gang run leaves per-subagent telemetry

- **GIVEN** a staged multi-partial plan and `FACTORY_EXECUTOR=opencode`
- **WHEN** the orchestrator completes all partials via bonsai-8b subagents
- **THEN** `tickets.factory_phase_events` contains `implement`/`done` events whose `detail` JSON names executor, subagent, and partial

#### Scenario: Orchestrator failure is visible, not silently retried

- **GIVEN** `opencode run` exits non-zero
- **WHEN** `opencode-exec.sh` finishes
- **THEN** an `implement`/`blocked` event with the exit code in `detail` exists and no `claude -p` fallback was spawned

### Requirement: REQ-SF-OPENCODE-CANON-001 — Gang-Konfiguration ist Repo-Kanon

Die Agenten `orchestrator`, `bonsai-8b-1..4`, `deepseek-helper` und der
Orchestrator-Prompt SHALL in `.opencode/agent-models.jsonc` bzw.
`.opencode/prompts/orchestrator.md` versioniert sein, sodass
`scripts/opencode-sync-agents.sh` sie in die globale Config verteilt. Die
Bonsai-Modell-ID SHALL `Ternary-Bonsai-8B-Q2_0.gguf` sein (TQ2_0 hat keine
CUDA-Kernel — stiller CPU-Fallback, T002111). Doku-Aussagen zur Parallelität
(`AGENTS.md`, jsonc-Kommentare) SHALL den Ist-Zustand beschreiben
(Server `-np 1`, physische Parallelität via `max_inflight` konfigurierbar).

#### Scenario: Agent sync propagates instead of destroying the gang config

- **GIVEN** the repo canon contains orchestrator + 4 bonsai subagents
- **WHEN** `scripts/opencode-sync-agents.sh` runs
- **THEN** the global opencode config contains the same agent set afterwards

### Requirement: The Factory resumes a partially implemented plan instead of replaying it

When the Software Factory picks up a ticket whose plan was staged by a human (`FACTORY-PLAN-REF`
present, REUSE path), the pipeline SHALL skip the plan partials that are already complete. The
authority for completeness SHALL remain the existing `partial-done` entries in
`tickets.factory_phase_events` as evaluated by `read-partials`; no second progress mechanism SHALL
be introduced. The pipeline SHALL log the skipped partial identifiers so the decision is auditable,
and SHALL proceed with the full task list when no partial is complete.

#### Scenario: A branch with two finished partials resumes at the third

- **GIVEN** a `plan_staged` ticket whose plan ships four partials and whose ticket carries
  `partial-done` phase events for `p1` and `p2`
- **WHEN** `scripts/factory/pipeline.js` enters the Plan-Reuse step
- **THEN** the resulting task list contains only `p3` and `p4`, and the skipped identifiers `p1` and
  `p2` are logged

#### Scenario: An untouched staged branch runs the full plan

- **GIVEN** a `plan_staged` ticket with no `partial-done` phase events
- **WHEN** the pipeline enters the Plan-Reuse step
- **THEN** every partial of the plan is scheduled and no partial is reported as skipped

### Requirement: The partial manifest is read after the work tree exists

The pipeline SHALL read the `tasks.d/` partial manifest of a reused plan only once the work tree
for the reuse branch is present, so that a plan shipping partials drives the fan-out directly
instead of falling back to a runtime LLM decompose. When no partial manifest exists, the LLM
decompose SHALL remain the documented fallback, and the pipeline SHALL log that the fallback was
taken so a silent regression to full-replay behaviour is visible in the run output.

#### Scenario: A plan with partials uses them rather than an LLM decompose

- **GIVEN** a reused plan whose change directory contains `tasks.d/` partials
- **WHEN** the pipeline runs the Plan-Reuse step
- **THEN** the partial manifest is read successfully and the task list comes from the partials, with
  no LLM decompose call

#### Scenario: A plan without partials still decomposes

- **GIVEN** a reused plan with no `tasks.d/` directory
- **WHEN** the pipeline runs the Plan-Reuse step
- **THEN** the LLM decompose produces the task list as before, and the run output states that the
  partial manifest was absent

### Requirement: A branch owned by another work tree is deferred, not blocked

When the work branch of a reused plan is already checked out in another work tree, the Factory
SHALL treat this as foreign ownership: it SHALL release its slot and leave the ticket dispatchable
for a later tick, and SHALL NOT set the ticket to `blocked`. The escalation path for a genuinely
failed work-tree creation SHALL remain unchanged.

#### Scenario: A live session holds the branch

- **GIVEN** a `plan_staged` ticket whose branch is checked out in a work tree belonging to a live
  session
- **WHEN** the Factory reaches work-tree setup for that ticket
- **THEN** the ticket keeps its dispatchable status, the slot is released, and no `blocked`
  transition is recorded

#### Scenario: A genuine work-tree failure still escalates

- **GIVEN** work-tree creation fails for a reason other than the branch being checked out elsewhere
- **WHEN** the Factory reaches work-tree setup
- **THEN** the ticket is set to `blocked` and the existing escalation notification is sent

### Requirement: The hold gate remains the default and reclaim remains manual

Resumability SHALL NOT weaken the execution hold introduced for staged plans. `dev-flow-plan` SHALL
continue to stage plans with `readiness.execution_released=false`, and the dispatcher SHALL
continue to require an explicit release before dispatching such a ticket. `ticket.sh reclaim` SHALL
remain a manually invoked escape hatch for derailed executions and SHALL NOT be triggered
automatically by resume detection.

#### Scenario: A held ticket stays untouched despite being resumable

- **GIVEN** a `plan_staged` ticket with `readiness.execution_released=false` and a branch carrying
  partial work
- **WHEN** `scripts/factory/queue.sh` runs
- **THEN** the ticket does not appear among the dispatch candidates

#### Scenario: A released ticket is resumed rather than restarted

- **GIVEN** the same ticket after `ticket.sh release-hold`
- **WHEN** the Factory dispatches it
- **THEN** it appears among the candidates and its already-complete tasks are skipped

### Requirement: LLM-Proxy-Preflight vor dem Dispatch

`wakeup.sh` SHALL test the reachability of `ANTHROPIC_BASE_URL` (if set) before
the first dispatch of a tick. If the proxy is unreachable, the tick SHALL be
aborted with a log message — no headless `claude -p` sessions SHALL be launched.
The preflight SHALL be a simple TCP/HTTP-HEAD check per brand, best-effort
(non-fatal if the env var is unset — that means the real Anthropic API is the
target and its reachability is out of scope).

This prevents the Livelock-from-infrastructure-failure pattern: a dead
llm-proxy starts sessions that die immediately (before writing any phase
events), wasting INFRA attempt budget and adding load to the proxy during
restart. The watchdog already distinguishes INFRA from MODEL failures
(T002389), but avoiding the sessions entirely is cheaper than counting them.

#### Scenario: Proxy down → Tick skipped

- **GIVEN** `ANTHROPIC_BASE_URL` ist auf einen lokalen llm-proxy gesetzt
- **AND** dieser Proxy antwortet nicht (Connection Refused / Timeout)
- **WHEN** `wakeup.sh` startet
- **THEN** logged die Preflight-Prüfung "LLM-Proxy unreachable — skipping tick"
- **AND** der Tick wird abgebrochen, ohne dass `dispatcher-bridge.sh` läuft

### Requirement: Watchdog-Kommentare deduplizieren

The watchdog SHALL avoid writing consecutive identical comments to the same
ticket. It SHALL track the last comment body per ticket (via
`tickets.factory_control` key `watchdog_last_comment:<ticket>`) and SHALL skip
the comment if the new body equals the stored one, unless the comment includes
a counter that changed (e.g. "Attempt 3/3" after "Attempt 2/3").

This prevents the "seven identical comments" signal-noise problem observed on
T002282: when every watchdog round writes the same text, the repetition itself
becomes invisible.

#### Scenario: Identischer Watchdog-Kommentar wird unterdrückt

- **GIVEN** ein Ticket hat den Watchdog-Kommentar "Pipeline stale > 30min"
  bereits einmal erhalten
- **WHEN** die nächste Watchdog-Runde denselben Text schreiben würde
- **THEN** wird der Kommentar unterdrückt (nicht gespeichert)
- **AND** falls ein Attempt-Zähler vorhanden ist (z.B. " [MODEL 2/3]"), wird der
  Kommentar trotzdem geschrieben, weil der Text sich unterscheidet

### Requirement: Dependency-based partial scheduling without full-gang claim

The factory scheduler SHALL start a ticket whose plan has N partials as soon as at least one
slot is free and at least one partial has no unmet dependencies, claiming
`min(ready partials, free slots)` slots (minimum 1) instead of requiring an all-or-nothing
claim of N slots. Head-of-line blocking SHALL only apply when zero slots are free.

#### Scenario: Single agent starts a multi-partial ticket

- **GIVEN** a `plan_staged` ticket with 3 partials of which at least one has no dependencies,
  and exactly 1 free slot in the brand pool
- **WHEN** the scheduler runs
- **THEN** the ticket is claimed with 1 slot and execution begins with a dependency-free
  partial instead of waiting for 3 free slots

### Requirement: Optional depends_on column in the partials manifest

The `## Partials` manifest table SHALL accept an optional fifth column `depends_on`
(comma-separated partial ids). `plan-lint.sh` SHALL hard-fail on references to unknown partial
ids and on dependency cycles, and SHALL continue to accept four-column manifests (no
dependencies). The pipeline SHALL execute partials in a topological order, only starting
partials whose dependencies have completed, and on resume SHALL skip partials already recorded
as done via `partial-done` phase events.

#### Scenario: Cycle in depends_on is rejected

- **GIVEN** a partials manifest where p1 depends on p2 and p2 depends on p1
- **WHEN** `plan-lint.sh` runs on the plan index
- **THEN** it exits non-zero with a hard error naming the cycle

#### Scenario: Resume skips completed partials

- **GIVEN** a ticket whose `partial-done` events record p1 as completed
- **WHEN** the pipeline resumes the ticket
- **THEN** p1 is not re-executed and the next ready partial starts

### Requirement: Partial count scales with plan size

`stage-plan --partials` SHALL accept values from 1 to 9. Plans MAY declare more than three
partials when their file sets are genuinely disjoint; the decompose guidance expresses a rule
of thumb (one partial per disjoint subsystem, tests separate) instead of a hard cap of three.

#### Scenario: Staging a five-partial plan

- **GIVEN** a plan index whose manifest declares five disjoint partials
- **WHEN** the plan is staged with `--partials 5`
- **THEN** staging succeeds and the ticket's slot_count is 5

## Testszenarien

<!-- merged from BATS unit tests and Playwright e2e tests -->

### Requirement: Blocker-Dependency Guard in Schedule
<!-- bats: factory-blocked.bats -->

The system SHALL verify `depends_on` entries before slot-claiming, skip blocked predecessors, enforce a global daily cap, and only schedule `backlog` tickets (never `awaiting_deploy`).

#### Scenario: schedule.sh prüft depends_on und überspringt blockierte Kandidaten *(BATS)*
- **GIVEN** `schedule.sh` existiert und enthält `depends_on`-, `blocked`- und `continue`-Logik
- **WHEN** die statischen Code-Checks auf `schedule.sh` ausgeführt werden
- **THEN** `grep depends_on`, `grep blocked`, `grep continue`, `grep conflict-check`, `grep candidates`, `grep "slots.sh.*claim"` und `grep GLOBAL_CAP` alle Exit 0 zurückgeben

#### Scenario: queue.sh liefert nur backlog-Features (kein awaiting_deploy) *(BATS)*
- **GIVEN** `queue.sh` enthält `status='backlog'` als Filter
- **WHEN** `grep -E "status\s*=\s*'backlog'"` auf `queue.sh` ausgeführt wird
- **THEN** Exit 0; `grep awaiting_deploy` auf `queue.sh` gibt Exit non-0 zurück

---

### Requirement: Feature-Branch Readiness-Check
<!-- bats: factory-readiness.bats -->

The system SHALL, before advancing a feature into implementation, verify that the target branch exists on `origin` and that the plan file is present on that branch. Missing arguments, unknown branches, or missing plan files each produce a distinct JSON error reason with exit code 1.

#### Scenario: Fehlende Argumente liefern missing_args *(BATS)*
- **GIVEN** `readiness-check.sh` wird mit leeren Strings aufgerufen
- **WHEN** `bash readiness-check.sh "" ""` ausgeführt wird
- **THEN** Exit 1; Ausgabe enthält `"ready":false` und `missing_args`

#### Scenario: Unbekannter Branch liefert no_branch *(BATS)*
- **GIVEN** ein lokaler git-Klon mit einem bekannten Branch `feature/has-plan`
- **WHEN** `readiness-check.sh feature/does-not-exist docs/.../test-plan.md` aufgerufen wird
- **THEN** Exit 1; Ausgabe enthält `"ready":false` und `no_branch`

#### Scenario: Plan-Datei fehlt auf dem Branch -> no_plan_on_branch *(BATS)*
- **GIVEN** Branch `feature/has-plan` existiert auf `origin`, aber `missing.md` ist nicht committet
- **WHEN** `readiness-check.sh feature/has-plan docs/.../missing.md` aufgerufen wird
- **THEN** Exit 1; Ausgabe enthält `"ready":false` und `no_plan_on_branch`

#### Scenario: Branch und Plan-Datei vorhanden -> ready *(BATS)*
- **GIVEN** Branch `feature/has-plan` existiert auf `origin` und `test-plan.md` ist committet
- **WHEN** `readiness-check.sh feature/has-plan docs/.../test-plan.md` aufgerufen wird
- **THEN** Exit 0; Ausgabe enthält `"ready":true` und `"reason":"ok"`

---

### Requirement: Scout-Drift Jaccard-Distanz
<!-- bats: factory-scout-drift.bats -->

The system SHALL compute the Jaccard distance between the planned (`P`) and actual (`A`) file sets after filtering out generated noise files, using the formula `1 - |P∩A| / |P∪A|`, with both empty sets yielding distance 0 and fully disjoint sets yielding distance 1.

#### Scenario: Identische Mengen -> Distanz 0 *(BATS)*
- **GIVEN** `P = ['a.ts','b.ts']` und `A = ['a.ts','b.ts']`
- **WHEN** `jaccardDistance(P, A)` berechnet wird
- **THEN** Ausgabe ist `"0"`

#### Scenario: Disjunkte Mengen -> Distanz 1 *(BATS)*
- **GIVEN** `P = ['a.ts']` und `A = ['b.ts']`
- **WHEN** `jaccardDistance(P, A)` berechnet wird
- **THEN** Ausgabe ist `"1"`

#### Scenario: Leere P, nicht-leere A -> Distanz 1 *(BATS)*
- **GIVEN** `P = []` und `A = ['a.ts']`
- **WHEN** `jaccardDistance(P, A)` berechnet wird
- **THEN** Ausgabe ist `"1"`

#### Scenario: Beide Mengen leer -> Distanz 0 *(BATS)*
- **GIVEN** `P = []` und `A = []`
- **WHEN** `jaccardDistance(P, A)` berechnet wird
- **THEN** Ausgabe ist `"0"`

#### Scenario: Partielle Überlappung (|intersect|=1, |union|=3) -> ~0.6667 *(BATS)*
- **GIVEN** `P = ['a.ts','b.ts']` und `A = ['a.ts','c.ts']`
- **WHEN** `jaccardDistance(P, A)` berechnet wird
- **THEN** Ausgabe ist `"0.6667"`

#### Scenario: filterNoise entfernt docs/generated/**, repo-index.json, test-inventory.json, Plan/Spec-Markdown *(BATS)*
- **GIVEN** Arrays mit Mix aus relevanten und generierten Pfaden
- **WHEN** `filterNoise([...])` ausgeführt wird
- **THEN** `docs/generated/x.md`, `docs/code-quality/repo-index.json`, `website/src/data/test-inventory.json`, `docs/superpowers/plans/p.md`, `docs/superpowers/specs/s.md` werden entfernt; `src/a.ts` bleibt erhalten; `null`-Input gibt `[]` zurück

---

### Requirement: Scout-Quality-Check
<!-- bats: factory-scout-quality.bats -->

The system SHALL evaluate the quality of a Scout-Phase output by checking for non-empty `touched_files`, a `spec_content` mit mindestens 300 Zeichen und einem gesetzten `plan_path`. Bei Verletzung eines dieser Kriterien gibt `evaluateScoutQuality` `weak: true` mit dem jeweiligen Reason zurück; bei Erfüllung aller Kriterien `weak: false` und `reasons: []`.

#### Scenario: Leere touched_files -> weak mit touched_files_empty *(BATS)*
- **GIVEN** `touched_files: []`, `spec_content` mit 400 Zeichen, `plan_path: 'p.md'`
- **WHEN** `evaluateScoutQuality({...})` aufgerufen wird
- **THEN** Ausgabe enthält `"weak":true` und `touched_files_empty`

#### Scenario: Spec unter 300 Zeichen -> weak mit spec_too_short *(BATS)*
- **GIVEN** `touched_files: ['a.ts']`, `spec_content: 'short'`, `plan_path: 'p.md'`
- **WHEN** `evaluateScoutQuality({...})` aufgerufen wird
- **THEN** Ausgabe enthält `"weak":true` und `spec_too_short`

#### Scenario: Fehlender plan_path -> weak mit no_plan_path *(BATS)*
- **GIVEN** `touched_files: ['a.ts']`, `spec_content` mit 400 Zeichen, `plan_path: null`
- **WHEN** `evaluateScoutQuality({...})` aufgerufen wird
- **THEN** Ausgabe enthält `"weak":true` und `no_plan_path`

#### Scenario: Vollständige Scout-Ausgabe -> weak:false, reasons:[] *(BATS)*
- **GIVEN** `touched_files: ['a.ts','b.ts']`, `spec_content` mit ≥400 Zeichen, `plan_path: 'docs/plan.md'`
- **WHEN** `evaluateScoutQuality({...})` aufgerufen wird
- **THEN** Ausgabe enthält `"weak":false` und `"reasons":[]`

---

### Requirement: VDA CLI Subcommand Dispatch und Validierung
<!-- bats: vda-core.bats | vda-factory-slots.bats | vda-ticket-smoke.bats -->

The system SHALL expose a unified `vda.sh` entry point that routes subcommands (`factory`, `ticket`, `release-notes`, `promote`, `oracle`) to their respective handlers, returns exit 0 with usage on `help`, exit 2 for unknown subcommands or missing required parameters, and supports `--json` output for machine-readable results.

#### Scenario: vda-core Hilfsfunktionen Banner, Bullet, Liste, Fehlerausgabe *(BATS)*
- **GIVEN** `scripts/lib/vda-core.sh` ist sourcebar
- **WHEN** `vda_header "Test Header"`, `vda_section "key" "value"`, `vda_list "Items" "one" "two"`, `vda_error "danger"` aufgerufen werden
- **THEN** Header enthält `Test Header` und `──`; Section enthält `• key: value`; List enthält `1. one` und `2. two`; Error enthält `danger`

#### Scenario: vda-core nicht-interaktiver Modus -> Defaults zurückgeben *(BATS)*
- **GIVEN** `VDA_NONINTERACTIVE=1` ist gesetzt
- **WHEN** `vda_choose "Select?" "first" "second"`, `vda_confirm "Continue?"`, `vda_input "Name?" "default"` aufgerufen werden
- **THEN** `vda_choose` gibt `"first"` zurück; `vda_confirm` Exit 0; `vda_input` gibt `"default"` zurück

#### Scenario: vda_json baut JSON ohne jq; vda_exec führt Befehle aus; DRY_RUN=1 verhindert Ausführung *(BATS)*
- **GIVEN** `vda_json key=value num=42`, `vda_exec "echo hello"`, `DRY_RUN=1 vda_exec "touch file"`
- **WHEN** die jeweiligen Funktionen aufgerufen werden
- **THEN** JSON enthält `"key":"value"` und `"num":"42"`; exec gibt `hello` aus; dry-run legt die Datei nicht an

#### Scenario: factory slots help, bogus und count mit JSON-Flag *(BATS)*
- **GIVEN** `BRAND=mentolder FACTORY_DRY_RESOLVE=1` sind gesetzt
- **WHEN** `vda.sh factory slots help`, `vda.sh factory slots bogus`, `vda.sh factory bogus`, `vda.sh factory slots count --json` aufgerufen werden
- **THEN** `help` Exit 0 und listet `count`, `next`, `claim`, `release`; `slots bogus` Exit 2; `factory bogus` Exit 2; `count --json` Exit 0 mit `"action":"count"` und `"brand":"mentolder"`

#### Scenario: factory slots count plaintext enthält ns=workspace *(BATS)*
- **GIVEN** `BRAND=mentolder FACTORY_DRY_RESOLVE=1` sind gesetzt
- **WHEN** `vda.sh factory slots count` (ohne `--json`) aufgerufen wird
- **THEN** Exit 0; Ausgabe enthält `ns=workspace`

#### Scenario: ticket-Subcommand Pflichtparameter und Help *(BATS)*
- **GIVEN** kein Cluster erreichbar (offline)
- **WHEN** `ticket.sh help`, `ticket.sh create` (ohne Params), `ticket.sh get` (ohne `--id`), `ticket.sh nonexistent` aufgerufen werden
- **THEN** `help` Exit 0 mit `subcommands`; `create` Exit 2; `get` Exit 2; `nonexistent` Exit 1 mit `Unknown command`

#### Scenario: vda.sh help listet alle Commands; promote --help; promote --bad-flag; feature-flag ohne brand *(BATS)*
- **GIVEN** `vda.sh` und `scripts/vda/ticket.sh` sind vorhanden
- **WHEN** `vda.sh help`, `vda.sh promote --help`, `vda.sh promote --bad-flag`, `vda.sh ticket feature-flag get` aufgerufen werden
- **THEN** help listet `oracle`, `promote`, `ticket`, `factory-prep`; `promote --help` Exit 0; `--bad-flag` Exit 2 mit `Unknown option`; `feature-flag get` gibt `--brand is required` oder `ERROR`

#### Scenario: ticket help listet triage und feature-flag pass-through *(BATS)*
- **GIVEN** `ticket.sh` ist vorhanden
- **WHEN** `ticket.sh help` und `vda.sh ticket help` aufgerufen werden
- **THEN** beide geben Exit 0; `triage` ist in der Ausgabe; `feature-flag` ist in der Ausgabe; `vda.sh ticket help` erwähnt pass-through

---

### Requirement: Mishap-Tracker und Auto-Kategorisierung
<!-- bats: mishap-tracker.bats -->

The system SHALL record process frictions via `mishap-tracker.sh` into a `.mishaps.log` (when no `--ticket` is given) or as a ticket comment, defaulting severity to `minor` when omitted. The companion `mishap-categorize.sh` SHALL classify friction text against `mishap-keywords.json` (categories include CI-Konflikt, Deploy-Fehler, API-Fehler, Sonstige) and write the result as a DB tag via `INSERT INTO tickets.tags` / `tickets.ticket_tags`.

#### Scenario: kein --ticket schreibt in .mishaps.log mit korrekter Severity *(BATS)*
- **GIVEN** kein `--ticket`-Flag, `--friction "ENV var missing"`, `--severity minor`
- **WHEN** `mishap-tracker.sh` ausgeführt wird
- **THEN** Exit 0; `.mishaps.log` enthält `"ENV var missing"` und `minor`

#### Scenario: fehlendes --friction gibt Usage-Fehler *(BATS)*
- **GIVEN** nur `--severity major` ohne `--friction`
- **WHEN** `mishap-tracker.sh --severity major` ausgeführt wird
- **THEN** Exit non-0; Ausgabe enthält `"--friction is required"`

#### Scenario: default Severity ist minor *(BATS)*
- **GIVEN** kein `--severity`-Flag
- **WHEN** `mishap-tracker.sh --friction "no severity given"` ausgeführt wird
- **THEN** Exit 0; `.mishaps.log` enthält `minor`

#### Scenario: categorize benötigt 3 Argumente *(BATS)*
- **GIVEN** nur ein Argument `T001`
- **WHEN** `mishap-categorize.sh T001` aufgerufen wird
- **THEN** Exit 0; Ausgabe enthält `Usage`

#### Scenario: leerer Titel/Beschreibung -> Sonstige *(BATS)*
- **GIVEN** Titel `""` und Beschreibung `""` für Ticket `T001`
- **WHEN** `mishap-categorize.sh T001 "" ""` aufgerufen wird
- **THEN** Exit 0; Ausgabe enthält `Sonstige`

#### Scenario: Keyword "merge conflict" -> CI-Konflikt *(BATS)*
- **GIVEN** Titel `"CI merge conflict on PR"` und Beschreibung `"CONFLICTING state blocked rebase"`
- **WHEN** `mishap-categorize.sh T002 "<title>" "<desc>"` aufgerufen wird
- **THEN** Exit 0; Ausgabe enthält `CI-Konflikt`

#### Scenario: Keyword "CrashLoopBackOff" -> Deploy-Fehler *(BATS)*
- **GIVEN** Titel `"Pod CrashLoopBackOff"` und Beschreibung `"rollout failed with ErrImagePull"`
- **WHEN** `mishap-categorize.sh T003 "<title>" "<desc>"` aufgerufen wird
- **THEN** Exit 0; Ausgabe enthält `Deploy-Fehler`

#### Scenario: kein Keyword-Match -> Sonstige *(BATS)*
- **GIVEN** Titel `"random stuff"` und Beschreibung `"nothing matches any keyword"`
- **WHEN** `mishap-categorize.sh T004 "<title>" "<desc>"` aufgerufen wird
- **THEN** Exit 0; Ausgabe enthält `Sonstige`

#### Scenario: API-Fehler-Keyword und DB INSERT *(BATS)*
- **GIVEN** Titel `"API 429 rate limit timeout"` und Beschreibung `"upstream connection refused"` (mit gemocktem kubectl)
- **WHEN** `mishap-categorize.sh T005 "<title>" "<desc>"` ausgeführt wird
- **THEN** Exit 0; Ausgabe enthält `API-Fehler`; `kubectl exec`-Capture enthält `INSERT INTO tickets.tags` und `INSERT INTO tickets.ticket_tags`

---

### Requirement: Readiness-Webhook API für Successor-Propagation
<!-- bats: readiness-webhook.bats -->

The system SHALL expose a POST endpoint at `/api/tickets/[id]/readiness` that requires admin authentication, validates the ticket ID format against `T\d{6}`, checks that the ticket status is `done` before proceeding, and calls `updateSuccessorReadiness` to propagate the `abhaengigkeiten_klar` flag in the readiness JSONB field. Missing/unauthorized/not-done conditions return 404, 401, and 409 respectively.

#### Scenario: statische Checks des Readiness-Endpoints *(BATS)*
- **GIVEN** `website/src/pages/api/tickets/[id]/readiness.ts` und `website/src/lib/ticket-readiness.ts` existieren
- **WHEN** Code-Checks auf `isAdmin`, `export const POST`, `T\d{6}`, `status.*done`, `409`, `404`, `401`, `updateSuccessorReadiness`, `abhaengigkeiten_klar` ausgeführt werden
- **THEN** alle `grep`-Checks geben Exit 0; Lib exportiert `updateSuccessorReadiness` und `allPredecessorsDone`

---

### Requirement: FA-48: Factory-Floor Devflow-Chip und CI-Badge
<!-- e2e: fa-48-factory-devflow.spec.ts -->

The system SHALL display workpieces with a `data-driver` attribute distinguishing `devflow` from `factory` tickets, show a CI badge with title on deploy-phase devflow tickets that have a `ciStatus`, and omit the CI badge when `ciStatus` is null.

#### Scenario: T1: Devflow-Workpiece hat data-driver="devflow", Factory-Ticket data-driver="factory" *(E2E)*
- **GIVEN** die Factory-Floor-API ist mit einem Factory- und zwei Devflow-Tickets gestubt
- **WHEN** `/dev-status` geöffnet wird und die Workpieces sichtbar sind
- **THEN** T000582 hat `data-driver="devflow"`; T000459 hat `data-driver="factory"`

#### Scenario: T2: Devflow-Workpiece im deploy-Phase zeigt CI-Badge mit ciStatus *(E2E)*
- **GIVEN** die Floor-API liefert ein Devflow-Ticket in Phase `deploy` mit `ciStatus='success'`
- **WHEN** `/dev-status` geöffnet wird
- **THEN** `[data-testid="floor-ci-badge"]` ist sichtbar und hat `title="CI: success — PR öffnen"`

#### Scenario: T3: Devflow-Workpiece ohne ciStatus zeigt kein CI-Badge *(E2E)*
- **GIVEN** die Floor-API liefert ein Devflow-Ticket mit `ciStatus=null`
- **WHEN** `/dev-status` geöffnet wird
- **THEN** kein `[data-testid="floor-ci-badge"]` ist sichtbar

---

### Requirement: FA-49: Factory Observability Dashboard
<!-- e2e: fa-49-factory-observability.spec.ts -->

The system SHALL surface factory observability (cost/token/provider KPIs and phase metrics)
together with token-budget management as the "Kosten" tab of `/admin/pipeline`, protected behind
admin authentication, and SHALL return a JSON response from `/api/factory-observability` with
`brand`, `timeline`, and `fetchedAt` fields. The former standalone pages
`/admin/factory-observability` and `/admin/factory-budget` SHALL respond with a redirect to
`/admin/pipeline?tab=kosten`. Chart and badge colors on the Kosten tab SHALL come exclusively
from `factory-chart-colors.ts` (no local `PHASE_COLORS` copies, no hardcoded hex values).

#### Scenario: T1: Kosten-Tab lädt mit KPI-Cards für Admin *(E2E)*
- **GIVEN** `E2E_ADMIN_PASS` ist gesetzt (Admin-Auth vorhanden)
- **WHEN** `/admin/pipeline?tab=kosten` aufgerufen wird
- **THEN** die Kosten-KPI-Kacheln und die Budget-Limit-Verwaltung sind sichtbar

#### Scenario: T2: API /api/factory-observability gibt JSON mit brand, timeline, fetchedAt *(E2E)*
- **GIVEN** der API-Endpunkt ist erreichbar (kein 401)
- **WHEN** ein GET-Request an `/api/factory-observability` gesendet wird
- **THEN** Status 200; Body hat Felder `brand`, `timeline` (Array) und `fetchedAt`

#### Scenario: T3: Alt-Routen leiten auf den Kosten-Tab weiter *(E2E)*
- **GIVEN** ein Browser mit Admin-Session
- **WHEN** `/admin/factory-observability` oder `/admin/factory-budget` aufgerufen wird
- **THEN** landet der Browser auf `/admin/pipeline?tab=kosten`

### Requirement: FA-SF: Factory Floor Hallendarstellung
<!-- e2e: fa-factory-floor.spec.ts -->

The system SHALL render the Factory Floor dashboard at `/admin/pipeline` (default tab) with hall
sections (Leitstand, Hall, Shipped, Slots) and open a detail panel when a workpiece is clicked.
The conveyor presentation SHALL be the only floor view: the kanban view mode, its toggle, and the
`localStorage['ff-view']` preference SHALL be removed (a persisted `ff-view=kanban` value is
ignored without error). The floor SHALL follow the admin token base: the kill-switch card renders
as an Ink/Brass status card, action buttons (Factory/Manuell/Promoten) render as Brass pills, and
stations are numbered with mono digits (`01`–`06`), hairline rules, and serif station names. All
existing `data-testid` attributes (`factory-floor`, `floor-leitstand`, `floor-hall`,
`floor-shipped`, `floor-slots`, `floor-workpiece`, `floor-detail`, …) SHALL remain unchanged.

#### Scenario: Hallen-Sektionen werden gerendert *(E2E)*
- **GIVEN** `/admin/pipeline` ist abrufbar und Admin-Auth ist aktiv
- **WHEN** die Seite geladen wird
- **THEN** `[data-testid="factory-floor"]`, `floor-leitstand`, `floor-hall`, `floor-shipped` und `floor-slots` sind alle sichtbar

#### Scenario: Klick auf ein Werkstück öffnet das Detail-Panel *(E2E)*
- **GIVEN** mindestens ein aktives Workpiece ist in der Halle
- **WHEN** das erste `[data-testid="floor-workpiece"]` angeklickt wird
- **THEN** `[data-testid="floor-detail"]` wird sichtbar

#### Scenario: Kein Kanban-Toggle mehr
- **GIVEN** `/admin/pipeline` ist geladen und `localStorage['ff-view']` enthält `kanban`
- **WHEN** der Floor-Tab gerendert wird
- **THEN** wird die Conveyor-Ansicht angezeigt und kein View-Toggle-Control ist vorhanden

### Requirement: FA-SF: Factory Floor Injection
<!-- e2e: fa-factory-injection.spec.ts -->

The system SHALL render an inject form in the detail panel of the Factory Floor and POST the injection payload to `/api/factory-floor/<id>/inject` when submitted.

#### Scenario: Inject-Formular öffnet sich im Detail-Panel und POSTet an den Inject-Endpunkt *(E2E)*
- **GIVEN** `/dev-status` ist gestubt mit einem aktiven Hall-Workpiece T000459 und dem Detail-Endpunkt; der Inject-Endpunkt ist gemockt
- **WHEN** das Workpiece angeklickt, `[data-testid="inject-form"]` aufgeklappt, `inject-content` befüllt und `inject-submit` geklickt wird
- **THEN** der Inject-Endpunkt empfängt einen POST (posted === true)

---

### Requirement: FA-MOBILE: Factory Floor Mobile-Parität
<!-- e2e: fa-mobile-factory.spec.ts -->

The system SHALL render the Factory Floor on mobile viewports (375×812) as a bottom-sheet detail
panel with backdrop and ≥44px close button, ensure content padding so the last loading-dock item
is not obscured by the tab bar, provide 6 horizontally-scrollable outer tabs on
`/admin/pipeline`, 10 inner mobile-station tabs with dot indicators, and render the Leitstand
grid with 8 cards without horizontal overflow.

#### Scenario: FA-MOBILE-01: Detail-Panel öffnet als Bottom-Sheet mit Backdrop und 44px Close-Button *(E2E)*
- **GIVEN** ein Mobile-Viewport (375×812) und ein gestufter Floor-Artikel ist vorhanden
- **WHEN** der Artikel-Button geklickt wird
- **THEN** `[data-testid="floor-detail"]` ist sichtbar, dessen Unterkante > 700px; `.detail-panel__backdrop` ist sichtbar; `.detail-panel__close` ist ≥44×44px; Klick auf Backdrop schließt das Panel

#### Scenario: FA-MOBILE-02: Letztes Laderampe-Item nicht von TabBar verdeckt *(E2E)*
- **GIVEN** ein Mobile-Viewport und der zweite Tab ist aktiv
- **WHEN** `[data-testid="floor-loadingdock"]` geladen ist und Items vorhanden sind
- **THEN** Unterkante des letzten Items ≤ Oberkante der TabBar + 4px (Toleranz)

#### Scenario: FA-MOBILE-03: Alle 6 Pipeline-Outer-Tabs via Horizontal-Scroll erreichbar *(E2E)*
- **GIVEN** ein Mobile-Viewport auf `/admin/pipeline`
- **WHEN** die Tab-Leiste horizontal gescrollt und alle 6 Outer-Tabs angeklickt werden
- **THEN** jeder Tab wird aktiv

#### Scenario: FA-MOBILE-04: Dot-Indikatoren aktualisieren sich bei MobileTabBar-Tap *(E2E)*
- **GIVEN** ein Mobile-Viewport und 10 Dot-Indikatoren sind vorhanden
- **WHEN** der dritte `.mobile-tab-bar__tab` angeklickt wird
- **THEN** `dots.nth(2)` hat Klasse `active`; `dots.first()` hat nicht mehr `active`

#### Scenario: FA-MOBILE-05: Alle 10 Stationen via MobileTabBar erreichbar *(E2E)*
- **GIVEN** ein Mobile-Viewport und 10 `.mobile-tab-bar__tab`-Elemente
- **WHEN** jeder Tab angeklickt wird
- **THEN** die gemappten Spalten (`staged`, `backlog`, `qs`, `done`) erhalten die Klasse `mobile-visible`

### Requirement: Agent-Anleitung Walkthrough
<!-- source: agent-guide-walkthrough.spec.ts -->

The system SHALL render a grouped, searchable, collapsible Agent Guide UI accessible via the PortalSidekick without login, supporting axis switching, tier filtering, cross-links, glossary tooltips, clipboard copy, and a persistent Mental Model map.

#### Scenario: öffnet die Agent-Anleitung und zeigt den Titel
- **GIVEN** die Agent-Anleitung ist aufrufbar ohne Login
- **WHEN** die Agent-Anleitung geöffnet wird
- **THEN** wird das Element `.sk-title` mit dem Text „Agent-Anleitung" sichtbar angezeigt

#### Scenario: zeigt alle 7 Themen-Gruppen, Karten standardmäßig eingeklappt
- **GIVEN** die Agent-Anleitung ist geöffnet
- **WHEN** die Seite geladen wurde
- **THEN** werden genau so viele Themengruppen angezeigt wie in den Guide-Daten definiert, und alle Karten-Köpfe haben `aria-expanded="false"`

#### Scenario: eine Karte lässt sich aus- und wieder einklappen
- **GIVEN** die Agent-Anleitung ist geöffnet und alle Karten sind eingeklappt
- **WHEN** eine Karte durch Klick auf den Kartenkopf ausgeklappt und danach wieder eingeklappt wird
- **THEN** ist der Prompt-Text zuerst sichtbar und nach erneutem Klick ist `aria-expanded` wieder `false`

#### Scenario: Suche ab 3 Zeichen filtert, öffnet Treffer und zeigt einen Zähler
- **GIVEN** die Agent-Anleitung ist geöffnet
- **WHEN** „daten" in das Suchfeld eingegeben wird
- **THEN** wird ein Trefferzähler mit dem Text „Treffer" angezeigt, eine Datenbank-Karte ist sichtbar, und Suchtext-Hervorhebungen sind vorhanden

#### Scenario: Umlaut-Suche: "aendern" findet die Website-Text-Karte
- **GIVEN** die Agent-Anleitung ist geöffnet
- **WHEN** „aendern" in das Suchfeld eingegeben wird
- **THEN** wird eine Karte mit dem Namen „ändern" sichtbar angezeigt

#### Scenario: Alias-Suche: "passwort" findet die Sicherheits-Karte
- **GIVEN** die Agent-Anleitung ist geöffnet
- **WHEN** „passwort" in das Suchfeld eingegeben wird
- **THEN** wird eine Karte mit dem Namen „Passwort" sichtbar angezeigt

#### Scenario: Achsen-Umschalter auf "Gefahr" zeigt Tier-Gruppen
- **GIVEN** die Agent-Anleitung ist geöffnet und die Standard-Achse ist aktiv
- **WHEN** der Achsen-Umschalter „Gefahr" angeklickt wird
- **THEN** erscheinen Gruppenüberschriften mit dem Tier-Label „Niemals allein"

#### Scenario: Tier-Filter auf 🔴 zeigt nur Forbidden-Karten
- **GIVEN** die Agent-Anleitung ist geöffnet
- **WHEN** der Tier-Umschalter für die verbotene Stufe angeklickt und eine verbotene Karte ausgeklappt wird
- **THEN** ist das rote Stopp-Panel sichtbar und enthält den Namen „Patrick" sowie den Text „Rücksprache"

#### Scenario: Cross-Link: Flow-Schritt springt zur Werkzeug-Karte und öffnet sie
- **GIVEN** die Agent-Anleitung ist geöffnet und die Karte „bug-beheben" ist ausgeklappt
- **WHEN** der erste Flow-Jump-Link angeklickt wird
- **THEN** scrollt die Ziel-Werkzeug-Karte in den Viewport und ihr Kartenkopf hat `aria-expanded="true"`

#### Scenario: Begriffe-Glossar lässt sich öffnen und ist durchsuchbar
- **GIVEN** die Agent-Anleitung ist geöffnet
- **WHEN** der Gruppenkopf „Begriffe kurz erklärt" angeklickt wird
- **THEN** wird die erste Glossar-Zeile sichtbar und die Gesamtzahl der Zeilen entspricht den Guide-Daten

#### Scenario: Prompt-Kopieren-Button wechselt zu "Kopiert ✓"
- **GIVEN** die Agent-Anleitung ist geöffnet, Clipboard-Berechtigung erteilt und die erste Ziel-Karte ausgeklappt
- **WHEN** der „Kopieren"-Button angeklickt wird
- **THEN** wechselt der Buttontext zu „Kopiert ✓" und die Zwischenablage enthält den Beispiel-Prompt des Ziels

#### Scenario: Schnellstart-Shelf kopiert den Init-Prompt eines Skills
- **GIVEN** die Agent-Anleitung ist geöffnet und Clipboard-Berechtigung erteilt
- **WHEN** ein Schnellstart-Chip angeklickt wird
- **THEN** wechselt die Chip-Aktion zu „Kopiert ✓" und die Zwischenablage enthält den Init-Prompt des Skills

#### Scenario: Mental-Model-Karte zeigt Fluss-Band und Gebietskarte
- **GIVEN** die Agent-Anleitung ist geöffnet und die Mental-Model-Karte ist eingeblendet
- **WHEN** die Karte gerendert wird
- **THEN** werden genau so viele Fluss-Stationen wie in den Map-Daten definiert angezeigt und der erste Gebiets-Knoten ist sichtbar

#### Scenario: Klick auf eine Fluss-Station filtert den Katalog
- **GIVEN** die Agent-Anleitung ist geöffnet und die Mental-Model-Karte ist eingeblendet
- **WHEN** die Fluss-Station „plan" angeklickt wird
- **THEN** ist ein Mapfilter-Chip sichtbar, die Karte „Fehler beheben" erscheint, und „Dienste laufen" wird nicht angezeigt

#### Scenario: Klick auf einen Baustein filtert auf seine verknüpften Karten
- **GIVEN** die Agent-Anleitung ist geöffnet und die Mental-Model-Karte ist eingeblendet
- **WHEN** ein Gebiets-Knoten mit mindestens einer Verknüpfung angeklickt wird
- **THEN** ist ein Mapfilter-Chip sichtbar und die Anzahl sichtbarer Kartenkopfe entspricht der Anzahl verknüpfter Karten

#### Scenario: Konzept-Zeile + Glossar-Tooltip auf einer Ziel-Karte
- **GIVEN** die Agent-Anleitung ist geöffnet und eine Karte mit `concept_de` ist ausgeklappt
- **WHEN** die Karte gerendert wird und ein Glossar-Element vorhanden ist, das angeklickt wird
- **THEN** ist die Konzept-Zeile sichtbar und das Glossar-Popup erscheint

#### Scenario: Karte einklappen bleibt nach Reload erhalten
- **GIVEN** die Mental-Model-Karte ist geöffnet
- **WHEN** die Karte eingeklappt wird und die Seite neu geladen wird
- **THEN** bleibt der Map-Toggle nach dem Reload auf `aria-expanded="false"` stehen

---

### Requirement: AK-03: Technische Machbarkeit
<!-- source: ak-03-technical.spec.ts -->

The system SHALL demonstrate technical feasibility by being reachable via HTTP/S for Pocket ID, the main website, and Vaultwarden, and the website SHALL render without server-side errors.

#### Scenario: T3a: Pocket ID ist erreichbar
- **GIVEN** ein Pocket-ID-Dienst ist unter der konfigurierten URL betrieben
- **WHEN** eine HTTP-GET-Anfrage an die Pocket-ID-URL gestellt wird
- **THEN** antwortet der Server mit einem HTTP-Statuscode 200, 301 oder 302

#### Scenario: T3b: Website ist erreichbar
- **GIVEN** die Website ist unter der Basis-URL betrieben
- **WHEN** eine HTTP-GET-Anfrage an die Basis-URL gestellt wird
- **THEN** antwortet der Server mit einem HTTP-Statuscode 200, 301 oder 302

#### Scenario: T3c: Vaultwarden ist erreichbar
- **GIVEN** ein Vaultwarden-Dienst ist unter der konfigurierten URL betrieben
- **WHEN** eine HTTP-GET-Anfrage an die Vaultwarden-URL gestellt wird
- **THEN** antwortet der Server mit einem HTTP-Statuscode 200, 301 oder 302

#### Scenario: T3d: Im Browser — Website lädt ohne Fehler
- **GIVEN** die Website ist erreichbar
- **WHEN** die Basis-URL im Browser aufgerufen wird
- **THEN** ist der Body sichtbar und enthält keinen Text wie „Internal Server Error", „502 Bad Gateway" oder „503 Service Unavailable"

#### Scenario: T3e: Im Browser — Pocket-ID-Login-Seite rendert
- **GIVEN** Pocket ID ist erreichbar und die OIDC-Clients sind geseedet
- **WHEN** die Pocket-ID-Oberfläche im Browser aufgerufen wird
- **THEN** ist der Body sichtbar und enthält nicht den Text „502 Bad Gateway"

---

### Requirement: AK-04: Prototyp-Betrieb
<!-- source: ak-04-prototype.spec.ts -->

The system SHALL ship all required configuration and operational scripts in the repository and SHALL NOT load any external tracking or font resources during page load, in compliance with DSGVO/GDPR.

#### Scenario: T1: k3d-Konfiguration im Repo vorhanden
- **GIVEN** das Repository ist ausgecheckt
- **WHEN** das Dateisystem geprüft wird
- **THEN** existiert die Datei `k3d-config.yaml` im Repo-Wurzelverzeichnis

#### Scenario: T1: Taskfile.yml im Repo vorhanden
- **GIVEN** das Repository ist ausgecheckt
- **WHEN** das Dateisystem geprüft wird
- **THEN** existiert die Datei `Taskfile.yml` im Repo-Wurzelverzeichnis

#### Scenario: T1: workspace:up in Taskfile definiert
- **GIVEN** `Taskfile.yml` existiert im Repository
- **WHEN** der Inhalt der Taskfile gelesen wird
- **THEN** enthält die Datei den Task-Namen `workspace:up` oder `workspace:deploy`

#### Scenario: T2: scripts/setup.sh existiert und ist ausführbar (falls vorhanden)
- **GIVEN** das Repository ist ausgecheckt
- **WHEN** `scripts/setup.sh` vorhanden ist und dessen Dateisystem-Metadaten geprüft werden
- **THEN** sind die ausführbaren Bits gesetzt (mode & 0o111 ist truthy)

#### Scenario: T2: scripts/-Verzeichnis enthält Betriebsskripte
- **GIVEN** das Repository ist ausgecheckt
- **WHEN** das `scripts/`-Verzeichnis aufgelistet wird
- **THEN** existiert das Verzeichnis und enthält mindestens eine `.sh`-Datei

#### Scenario: T5a: DSGVO — Website lädt keine Google Fonts
- **GIVEN** die Website ist erreichbar
- **WHEN** die Startseite vollständig geladen wird
- **THEN** werden keine Anfragen an `fonts.googleapis.com` oder `fonts.gstatic.com` gestellt

#### Scenario: T5b: DSGVO — Website lädt keine externen Analytics-Scripts
- **GIVEN** die Website ist erreichbar
- **WHEN** die Startseite vollständig geladen wird
- **THEN** werden keine Anfragen an Google Analytics, Google Tag Manager, Facebook, Hotjar oder Mixpanel gestellt

---

### Requirement: FA-SF-57: App Catalog E2E Tests
<!-- source: app-catalog.spec.ts -->

The system SHALL restrict access to the app catalog admin page to authenticated users and SHALL render a functional catalog with modal detail views for authenticated administrators.

#### Scenario: T1: /admin/app-catalog requires authentication (unauthenticated)
- **GIVEN** ein nicht authentifizierter Nutzer
- **WHEN** die URL `/admin/app-catalog` direkt aufgerufen wird
- **THEN** erfolgt eine Weiterleitung weg von `/admin/app-catalog` (z. B. zur Login- oder Pocket-ID-Seite)

#### Scenario: T2: /admin/app-catalog page loads and renders catalog for authenticated admins
- **GIVEN** ein authentifizierter Administrator ist eingeloggt
- **WHEN** `/admin/app-catalog` aufgerufen wird
- **THEN** wird die Seite mit der Überschrift „App-Katalog" gerendert, die Whiteboard-Karte ist sichtbar, ein Klick auf „Details anzeigen" öffnet ein Modal mit dem Titel „Whiteboard — Installationsanleitung", und „Schließen" schließt das Modal

---

### Requirement: Arena Mentolder Auth Setup
<!-- source: arena-mentolder-auth-setup.spec.ts -->

The system SHALL support OIDC-based authentication for the Arena service via Pocket ID so that a persistent browser session can be saved for subsequent test runs.

#### Scenario: authenticate mentolder arena admin
- **GIVEN** die Umgebungsvariable `E2E_ADMIN_PASS` ist gesetzt und der Arena-Server ist erreichbar
- **WHEN** ein Login über Pocket ID für den Arena-Admin-Nutzer durchgeführt wird
- **THEN** ist die Session authentifiziert und der Storage-State wird in `.auth/mentolder-arena-admin.json` gespeichert

---

### Requirement: Arena Mobile (Android) @mobile
<!-- source: arena-mobile.spec.ts -->

The system SHALL provide a fully usable mobile portal experience on Android-class viewports, with accessible tap targets, a collapsible sidebar, and functional Arena lobby controls.

#### Scenario: T1: portal/arena loads without console errors on mobile
- **GIVEN** ein authentifizierter Nutzer mit gespeichertem Auth-State auf einem mobilen Viewport
- **WHEN** `/portal/arena` im Browser aufgerufen wird
- **THEN** ist eine Überschrift sichtbar und es liegen keine JavaScript-Konsolenfehler vor (abzüglich Favicon-Fehler)

#### Scenario: T2: mobile topbar is visible, sidebar is hidden by default
- **GIVEN** ein authentifizierter Nutzer auf einem mobilen Viewport
- **WHEN** `/portal/arena` geladen wird
- **THEN** ist `#portal-mobile-topbar` sichtbar und `#portal-sidebar` hat eine CSS-Transform mit dem Wert `-224` (sidebar ist ausgeblendet)

#### Scenario: T3: hamburger button has ≥44px tap target
- **GIVEN** ein authentifizierter Nutzer auf einem mobilen Viewport
- **WHEN** die Abmessungen von `#portal-hamburger` gemessen werden
- **THEN** sind Breite und Höhe jeweils mindestens 36 px

#### Scenario: T4: hamburger tap opens sidebar and backdrop
- **GIVEN** ein authentifizierter Nutzer auf einem mobilen Viewport und die Sidebar ist geschlossen
- **WHEN** der Hamburger-Button angetippt wird
- **THEN** enthält die CSS-Transform von `#portal-sidebar` nicht mehr `-224` und `#portal-backdrop` hat die CSS-Eigenschaft `opacity: 1`

#### Scenario: T5: backdrop tap closes sidebar
- **GIVEN** ein authentifizierter Nutzer auf einem mobilen Viewport und die Sidebar ist geöffnet
- **WHEN** der Backdrop angetippt wird
- **THEN** enthält die CSS-Transform von `#portal-sidebar` wieder `-224` (Sidebar ist geschlossen)

#### Scenario: T6: Arena heading and lobby button visible on mobile
- **GIVEN** ein authentifizierter Nutzer auf einem mobilen Viewport
- **WHEN** `/portal/arena` geladen wird
- **THEN** sind die Arena-Überschrift und der Button „Neue Lobby" sichtbar

#### Scenario: T7: Neue Lobby öffnen button has ≥44px tap target
- **GIVEN** ein authentifizierter Nutzer auf einem mobilen Viewport
- **WHEN** die Höhe des „Neue Lobby"-Buttons gemessen wird
- **THEN** beträgt die Höhe mindestens 44 px

#### Scenario: T8: opening lobby shows lobby UI on mobile
- **GIVEN** ein authentifizierter Nutzer auf einem mobilen Viewport
- **WHEN** der „Neue Lobby"-Button angetippt wird
- **THEN** wechselt die URL zu `/portal/arena?lobby=…`, der Text „Arena · Lobby" ist sichtbar, und die Buttons „Waiting for Players", „Leave Lobby" sowie „Start Match" werden angezeigt

#### Scenario: T9: lobby action buttons have ≥44px tap targets
- **GIVEN** ein authentifizierter Nutzer befindet sich in einer Lobby auf einem mobilen Viewport
- **WHEN** die Höhe der Buttons „Leave Lobby" und „Start Match" gemessen wird
- **THEN** beträgt die Höhe beider Buttons jeweils mindestens 44 px

#### Scenario: T10: character selector arrows have ≥44px tap targets
- **GIVEN** ein authentifizierter Nutzer befindet sich in einer Lobby auf einem mobilen Viewport
- **WHEN** die kleinste Abmessung (Breite oder Höhe) der Charakter-Auswahl-Buttons „Previous Character" und „Next Character" gemessen wird
- **THEN** beträgt diese mindestens 36 px

#### Scenario: T11: character selector cycles characters on tap
- **GIVEN** ein authentifizierter Nutzer befindet sich in einer Lobby auf einem mobilen Viewport
- **WHEN** der „Next Character"-Button angetippt wird
- **THEN** ändert sich das `src`-Attribut des Charakter-Bilds gegenüber dem Ausgangswert

#### Scenario: T12: portal main content fills full width on mobile (sidebar not blocking)
- **GIVEN** ein authentifizierter Nutzer auf einem mobilen Viewport
- **WHEN** die Breite von `#portal-main` mit der Viewport-Breite verglichen wird
- **THEN** beträgt die Breite von `#portal-main` mindestens 90 % der Viewport-Breite

---

### Requirement: Brett Art Library
<!-- source: brett-art.spec.ts -->

The system SHALL gate Brett behind SSO authentication and, when the art library feature is present, SHALL load a character manifest and correctly attach Sprite meshes to placed figures.

#### Scenario: Brett redirects unauthenticated users to Pocket ID
- **GIVEN** ein Browser ohne Auth-State (kein eingeloggter Nutzer)
- **WHEN** die Brett-URL direkt aufgerufen wird
- **THEN** wird der Browser zur Pocket-ID-Auth-URL (`auth.` oder `authorize`) weitergeleitet

#### Scenario: Brett loads art manifest and exposes character ids
- **GIVEN** ein authentifizierter Nutzer und das bereitgestellte Brett-Image unterstützt die Art-Library-Funktion
- **WHEN** Brett vollständig geladen ist und `window.__ART_READY__` gesetzt wurde
- **THEN** enthält `window.characterIds` die Werte `figure-01`, `figure-02`, `figure-03` und `figure-04`

#### Scenario: Placing a figure creates a Sprite child in the figure mesh
- **GIVEN** ein authentifizierter Nutzer und die Art-Library-Funktion ist verfügbar
- **WHEN** `addFigure('figure-01', …)` programmatisch aufgerufen wird
- **THEN** enthält das Mesh der Figur `test-1` mindestens ein Kind vom Typ `Sprite`

---

### Requirement: Brett Mannequin Focus
<!-- source: brett-mannequin.spec.ts -->

The system SHALL provide a 3D mannequin board where figures can be added, selected, posed via presets, deleted, and cycled through via keyboard, with physics stiffness controllable via a slider.

#### Scenario: T1: One figure is seeded on load
- **GIVEN** ein neuer Brett-Raum wird mit einem zufälligen `room`-Parameter geöffnet
- **WHEN** die Szene vollständig initialisiert ist
- **THEN** enthält `STATE.figures` genau ein Element

#### Scenario: T2: Adding a figure via button
- **GIVEN** Brett ist geladen und eine Figur ist vorhanden
- **WHEN** der Button `#add-figure` angeklickt wird
- **THEN** enthält `STATE.figures` zwei Elemente

#### Scenario: T3: Applying a preset
- **GIVEN** Brett ist geladen, eine Figur ist ausgewählt
- **WHEN** der Preset-Button `kneel` angeklickt wird
- **THEN** hat `fig.bone.lHip.targetRot.x` den Wert ca. -1.3

#### Scenario: T4: Stiffness slider updates state
- **GIVEN** Brett ist geladen
- **WHEN** der Schieberegler `#stiffness` auf den Wert `0.1` gesetzt wird
- **THEN** hat `STATE.stiffness` den Wert `0.1`

#### Scenario: T5: Double-click on floor adds figure
- **GIVEN** Brett ist geladen
- **WHEN** ein Doppelklick auf das Canvas ausgeführt wird
- **THEN** ist die Anzahl der Figuren in `STATE.figures` größer als zuvor

#### Scenario: T6: Tab cycles selection
- **GIVEN** Brett ist geladen und zwei Figuren sind vorhanden, die erste ist ausgewählt
- **WHEN** die Tab-Taste gedrückt wird
- **THEN** wechselt `STATE.selectedId` zur zweiten Figur

#### Scenario: T7: Delete removes figure
- **GIVEN** Brett ist geladen und zwei Figuren sind vorhanden
- **WHEN** die Entf-Taste gedrückt wird
- **THEN** ist die Anzahl der Figuren in `STATE.figures` um eins kleiner als zuvor

---

### Requirement: Brett Mentolder Authentication Setup
<!-- source: brett-mentolder-auth-setup.spec.ts -->

The system SHALL authenticate users against brett.mentolder.de via Pocket ID OIDC (oauth2-proxy) and persist a valid session state for subsequent test runs.

#### Scenario: authenticate mentolder brett admin
- **GIVEN** der Brett-Healthcheck-Endpunkt ist erreichbar und gültige Admin-Zugangsdaten sind vorhanden
- **WHEN** der Admin-Benutzer sich über den Pocket-ID-OIDC-Flow einloggt
- **THEN** gibt `/healthz` den HTTP-Status 200 zurück und der Session-State wird als JSON-Datei gespeichert

---

### Requirement: Brett Mobile (Android)
<!-- source: brett-mobile.spec.ts -->

The system SHALL render the Brett 3D board correctly on mobile viewports, handle touch events without errors, and enforce OAuth2 authentication for unauthenticated mobile users.

#### Scenario: T1: unauthenticated visit redirects to Pocket ID
- **GIVEN** ein unauthentifizierter Browser ohne gespeicherten Session-State
- **WHEN** die Brett-URL direkt aufgerufen wird
- **THEN** wird der Nutzer zu einer Pocket-ID-Authentifizierungsseite weitergeleitet (URL enthält `auth.` oder `authorize`)

#### Scenario: T2: page has data-URI favicon (browser never requests /favicon.ico)
- **GIVEN** ein authentifizierter Browser mit gespeichertem Session-State
- **WHEN** die Brett-Seite vollständig geladen wird
- **THEN** enthält das `<link rel="icon">`-Element eine `data:image/svg+xml`-URI und der Browser stellt keine HTTP-Anfrage an `/favicon.ico`

#### Scenario: T3: canvas fills viewport width on mobile
- **GIVEN** ein authentifizierter Browser mit einem mobilen Viewport
- **WHEN** die Brett-Seite mit einem neuen Raum geladen wird und das Canvas-Element bereit ist
- **THEN** füllt das Canvas-Element mindestens 90% der Viewport-Breite aus

#### Scenario: T4: topbar is scrollable on mobile (overflow-x)
- **GIVEN** ein authentifizierter Browser mit einem mobilen Viewport
- **WHEN** die Brett-Seite geladen wird und die Topbar sichtbar ist
- **THEN** hat das `#topbar`-Element den CSS-Wert `overflow-x: auto`

#### Scenario: T5: touch tap on canvas does not throw JS error
- **GIVEN** ein authentifizierter Browser mit Touch-Unterstützung und initialisiertem Board-State
- **WHEN** ein Touch-Tap auf das Canvas-Element ausgeführt wird
- **THEN** werden keine JavaScript-`TypeError`-Fehler auf der Seite ausgelöst

#### Scenario: T7: status pill visible on mobile
- **GIVEN** ein authentifizierter Browser mit einem mobilen Viewport
- **WHEN** die Brett-Seite geladen wird
- **THEN** ist das `#status-pill`-Element sichtbar und horizontal auf dem Viewport zentriert

#### Scenario: T8: preset buttons have minimum 44px tap height
- **GIVEN** ein authentifizierter Browser mit Touch-Unterstützung
- **WHEN** die Brett-Seite geladen wird und Preset-Buttons vorhanden sind
- **THEN** haben alle `.preset-btn`-Elemente eine Mindesthöhe von 44px

#### Scenario: T9: pinch-out zooms the orbit camera in (orbit dist decreases)
- **GIVEN** ein authentifizierter Browser mit Touch-Unterstützung und initialisierter Brett-3D-Szene
- **WHEN** eine Pinch-Out-Geste (zwei Finger auseinanderbewegen) auf dem Canvas ausgeführt wird
- **THEN** verringert sich der Orbit-Kameraabstand (`dist`) gegenüber dem Ausgangswert

#### Scenario: T10: one-finger drag on empty floor orbits the camera (theta changes)
- **GIVEN** ein authentifizierter Browser mit Touch-Unterstützung und initialisierter Brett-3D-Szene
- **WHEN** ein Ein-Finger-Drag über das Canvas ausgeführt wird
- **THEN** ändert sich der Orbit-Winkel (`theta`) um mehr als 0,01 Radiant gegenüber dem Ausgangswert

---

### Requirement: Brett role enforcement (C7)
<!-- source: brett-roles.spec.ts -->

The system SHALL enforce server-side role permissions such that a user assigned the `beobachter` role cannot move figures, regardless of their OIDC admin claim.

#### Scenario: an assigned beobachter cannot move a figure (server-enforced)
- **GIVEN** zwei authentifizierte Sessions — eine mit der Rolle `leiter`, eine mit der Rolle `beobachter` — im selben Brett-Raum mit einer aktiven Spielrunde
- **WHEN** der Beobachter eine `move`-Nachricht für eine Figur über den WebSocket sendet
- **THEN** antwortet der Server mit einer `error`-Nachricht (`reason: forbidden`) und die Position der Figur bleibt für den Leiter unverändert

---

### Requirement: Brett share link (T000608)
<!-- source: brett-share-link.spec.ts -->

The system SHALL allow a session leader to generate a share link granting read-only board access to unauthenticated guests, and SHALL reject invalid or disabled share tokens.

#### Scenario: leader creates a share link; guest views the board read-only
- **GIVEN** ein authentifizierter Leiter hat eine Brett-Session erstellt und auf den Share-Button geklickt
- **WHEN** ein unauthentifizierter Gast-Browser die kopierte Share-URL öffnet
- **THEN** wird das `#view-only-badge` angezeigt, das Canvas ist sichtbar und der Figuren-Panel-Button (`#fig-panel-btn`) ist nicht vorhanden

#### Scenario: a disabled / invalid link shows an error
- **GIVEN** ein unauthentifizierter Browser
- **WHEN** eine nicht existierende Share-URL (`/share/this-token-does-not-exist`) aufgerufen wird
- **THEN** wird ein Fehlertext angezeigt, der `ungültig` oder `nicht mehr gültig` enthält

---

### Requirement: Admin Portal Art Library
<!-- source: dashboard-art.spec.ts -->

The system SHALL protect the admin portal art library behind authentication, render art cards for authenticated users on korczewski.de, and show an empty state on the mentolder brand where no art library is configured.

#### Scenario: admin portal redirects unauthenticated users to login
- **GIVEN** kein gültiger Authentifizierungs-State ist vorhanden
- **WHEN** die Admin-Portal-URL direkt aufgerufen wird
- **THEN** wird der Nutzer zur Login-Seite weitergeleitet oder ein `Anmelden`-Link ist sichtbar

#### Scenario: art tab button is present in the nav after login
- **GIVEN** ein authentifizierter Browser mit gespeichertem Admin-Session-State
- **WHEN** das Admin-Portal geladen wird
- **THEN** ist ein Tab-Button mit dem Text `Art Library` oder `Bibliothek` in der Navigation sichtbar

#### Scenario: art tab is visible and renders art cards
- **GIVEN** ein authentifizierter Browser mit gespeichertem Admin-Session-State und sichtbarem Art-Library-Tab
- **WHEN** der Art-Library-Tab angeklickt wird und das `.art-grid`-Element geladen ist
- **THEN** wird mindestens eine `.art-card` im Grid angezeigt

#### Scenario: clicking a card opens the side panel with palette swatches
- **GIVEN** ein authentifizierter Browser mit geöffnetem Art-Library-Tab und sichtbaren Art-Cards
- **WHEN** auf die erste `.art-card` geklickt wird und das `.art-panel` erscheint
- **THEN** enthält das Panel mindestens eine `.art-palette-row` mit Farbfeldern

#### Scenario: mentolder context shows empty-state (no art library)
- **GIVEN** ein Browser der auf die mentolder-Admin-URL zugreift und kein Auth-Redirect erfolgt
- **WHEN** der Art-Library-Tab angeklickt wird
- **THEN** zeigt `.art-empty` den Text `No art library configured` oder `Keine Kunstbibliothek`

---

### Requirement: FA-UNIF: Dev-Status tabs
<!-- source: dev-status-tabs.spec.ts -->

The system SHALL render a unified Dev-Status page with tab navigation that correctly activates tabs via URL parameters, updates the URL on tab switch without page reload, and remains functional on mobile viewports.

#### Scenario: FA-UNIF-01: /dev-status öffnet Factory-Tab
- **GIVEN** kein URL-Parameter ist angegeben
- **WHEN** `/dev-status` aufgerufen wird
- **THEN** ist der Tab `Factory Floor` aktiv und die URL enthält nicht `tab=planung`

#### Scenario: FA-UNIF-02: ?tab=planung öffnet Planungsbüro
- **GIVEN** der URL-Parameter `tab=planung` ist gesetzt
- **WHEN** `/dev-status?tab=planung` aufgerufen wird
- **THEN** ist der Tab `Planungsbüro` als aktiv markiert

#### Scenario: FA-UNIF-03: Tab-Wechsel ändert URL ohne Reload
- **GIVEN** die `/dev-status`-Seite ist geladen mit aktivem Factory-Floor-Tab
- **WHEN** der `Planungsbüro`-Tab angeklickt wird
- **THEN** enthält die URL `tab=planung` und der Tab `Planungsbüro` ist aktiv — ohne Seiten-Reload

#### Scenario: FA-UNIF-04: /admin/planungsbuero → /dev-status?tab=planung
- **GIVEN** die veraltete Admin-Planungsbüro-URL wird verwendet
- **WHEN** `/admin/planungsbuero` aufgerufen wird
- **THEN** erfolgt eine Weiterleitung zu `/dev-status?tab=planung`

#### Scenario: FA-UNIF-05: Tab-Bar wird gerendert
- **GIVEN** die `/dev-status`-Seite wird aufgerufen
- **WHEN** die Seite vollständig geladen ist
- **THEN** ist `.tab-bar-wrap` sichtbar und es werden genau 5 `.ds-tab`-Elemente gerendert

#### Scenario: FA-UNIF-06: Mobile — Tab-Bar sichtbar bei 390px
- **GIVEN** der Viewport ist auf 390×844px gesetzt
- **WHEN** `/dev-status` aufgerufen wird
- **THEN** ist `.tab-bar-wrap` sichtbar und der erste `.ds-tab` ist sichtbar

#### Scenario: FA-UNIF-07: Mobile — Tab-Wechsel funktioniert bei 390px
- **GIVEN** der Viewport ist auf 390×844px gesetzt und `/dev-status` ist geladen
- **WHEN** der `Planungsbüro`-Tab angeklickt wird
- **THEN** enthält die URL `tab=planung` und der Tab `Planungsbüro` ist als aktiv markiert

#### Scenario: FA-UNIF-08: Sidebar hat einen Dev-Status-Eintrag
- **GIVEN** die `/admin`-Seite ist geladen
- **WHEN** die Admin-Sidebar gerendert ist
- **THEN** enthält `#admin-sidebar` genau einen Link zu `/dev-status` mit dem Text `Dev Status` und keinen Link zu `/admin/planungsbuero`

#### Scenario: FA-UNIF-09: Attention strip appears when a workpiece is blocked
- **GIVEN** der Factory-Floor-Tab ist aktiv und ein Workpiece ist blockiert
- **WHEN** `/dev-status?tab=factory` geladen wird und ein Alert-Element vorhanden ist
- **THEN** enthält das Alert-Element eines der Symbole `⛔`, `⏱` oder `🧊`

#### Scenario: FA-UNIF-10: Planungsbüro reflects a promote without manual reload
- **GIVEN** der Planungsbüro-Tab ist aktiv
- **WHEN** das Custom-Event `factory-floor-refreshed` auf `window` ausgelöst wird
- **THEN** aktualisiert sich die Anzahl der `[data-planning-item]`-Elemente ohne manuellen Seiten-Reload

---

### Requirement: FA-01: Messaging (Portal Nachrichten & Räume)
<!-- source: fa-01-messaging.spec.ts -->

The system SHALL require authentication on all portal messaging API endpoints and redirect unauthenticated users away from the messaging section of the portal.

#### Scenario: T1: /api/portal/rooms requires authentication
- **GIVEN** kein Authentifizierungs-Token ist vorhanden
- **WHEN** ein GET-Request an `/api/portal/rooms` gesendet wird
- **THEN** antwortet der Server mit HTTP 401 oder 403

#### Scenario: T2: /api/portal/nachrichten requires authentication
- **GIVEN** kein Authentifizierungs-Token ist vorhanden
- **WHEN** ein GET-Request an `/api/portal/nachrichten` gesendet wird
- **THEN** antwortet der Server mit HTTP 401 oder 403

#### Scenario: T3: /api/portal/rooms/ensure-direct requires authentication
- **GIVEN** kein Authentifizierungs-Token ist vorhanden
- **WHEN** ein POST-Request an `/api/portal/rooms/ensure-direct` mit einer `targetCustomerId` gesendet wird
- **THEN** antwortet der Server mit HTTP 401 oder 403

#### Scenario: T4: /api/portal/rooms/:id/messages requires authentication
- **GIVEN** kein Authentifizierungs-Token ist vorhanden
- **WHEN** ein GET-Request an `/api/portal/rooms/999/messages` gesendet wird
- **THEN** antwortet der Server mit HTTP 401 oder 403

#### Scenario: T5: Portal Nachrichten section redirects unauthenticated users
- **GIVEN** ein unauthentifizierter Browser
- **WHEN** `/portal?section=nachrichten` aufgerufen wird
- **THEN** wird der Nutzer von der `/portal`-URL wegnavigiert (Redirect zu Login oder anderem Ziel)

---

### Requirement: FA-03: Videokonferenzen (Nextcloud Talk)
<!-- source: fa-03-video.spec.ts -->

The system SHALL make the Nextcloud Talk interface reachable, redirect unauthenticated users to a login page, and expose a functional HPB signaling server endpoint.

#### Scenario: T1: Talk-Oberfläche öffnen
- **GIVEN** die Nextcloud-URL ist konfiguriert
- **WHEN** `/apps/spreed` (oder `/index.php/apps/spreed`) aufgerufen wird
- **THEN** ist ein Talk-, Login- oder Pocket-ID-Authentifizierungselement auf der Seite sichtbar

#### Scenario: T4: HPB Signaling-Server erreichbar
- **GIVEN** die Signaling-Server-URL ist konfiguriert und der NATS-Backend-Dienst ist verfügbar
- **WHEN** ein GET-Request an `/api/v1/welcome` des Signaling-Servers gesendet wird
- **THEN** antwortet der Server mit HTTP 200 und die JSON-Antwort enthält das Feld `version`

#### Scenario: T5: Talk-Link ohne Login aufrufbar (Gast)
- **GIVEN** ein unauthentifizierter Browser und die Nextcloud-URL ist konfiguriert
- **WHEN** `/apps/spreed` (oder `/index.php/apps/spreed`) aufgerufen wird
- **THEN** wird eine Login-Seite oder ein Pocket-ID-Authentifizierungsformular angezeigt, was bestätigt dass die URL erreichbar und korrekt behandelt wird

---

### Requirement: FA-04: Dateiablage (Projektanhänge)
<!-- source: fa-04-files.spec.ts -->

The system SHALL enforce authentication and authorization on all project file management API endpoints and redirect unauthenticated users away from the portal projects section.

#### Scenario: T1: /api/portal/projekte requires authentication
- **GIVEN** ein nicht authentifizierter HTTP-Client
- **WHEN** ein GET-Request an `/api/portal/projekte` gesendet wird
- **THEN** antwortet der Server mit HTTP 401 oder 403

#### Scenario: T2: /api/admin/projekte/attachments/upload requires admin auth
- **GIVEN** ein nicht authentifizierter HTTP-Client
- **WHEN** ein POST-Request an `/api/admin/projekte/attachments/upload` mit leerem Body gesendet wird
- **THEN** antwortet der Server mit HTTP 401 oder 403

#### Scenario: T3: /api/admin/projekte/attachments/delete requires admin auth
- **GIVEN** ein nicht authentifizierter HTTP-Client
- **WHEN** ein POST-Request an `/api/admin/projekte/attachments/delete` mit leerem Body gesendet wird
- **THEN** antwortet der Server mit HTTP 401 oder 403

#### Scenario: T4: /api/admin/projekte/create requires admin auth
- **GIVEN** ein nicht authentifizierter HTTP-Client
- **WHEN** ein POST-Request an `/api/admin/projekte/create` mit leerem Body gesendet wird
- **THEN** antwortet der Server mit HTTP 401 oder 403

#### Scenario: T5: Portal Projekte section redirects unauthenticated users
- **GIVEN** ein nicht angemeldeter Browser-Nutzer
- **WHEN** die URL `/portal?section=projekte` aufgerufen wird
- **THEN** wird der Nutzer von der Portal-Seite weggeleitet (aktuelle URL enthält nicht mehr `/portal`)

---

### Requirement: FA-05: Nutzerverwaltung
<!-- source: fa-05-user-mgmt.spec.ts -->

The system SHALL protect all client management API endpoints behind admin authentication and provide SSO-based login by redirecting to Pocket ID.

#### Scenario: T1: /api/admin/clients/create requires admin auth
- **GIVEN** ein nicht authentifizierter HTTP-Client
- **WHEN** ein POST-Request an `/api/admin/clients/create` mit leerem Body gesendet wird
- **THEN** antwortet der Server mit HTTP 401 oder 403

#### Scenario: T2: /api/admin/clients/enroll requires admin auth
- **GIVEN** ein nicht authentifizierter HTTP-Client
- **WHEN** ein POST-Request an `/api/admin/clients/enroll` mit leerem Body gesendet wird
- **THEN** antwortet der Server mit HTTP 401 oder 403

#### Scenario: T3: /api/admin/clients/delete requires admin auth
- **GIVEN** ein nicht authentifizierter HTTP-Client
- **WHEN** ein POST-Request an `/api/admin/clients/delete` mit leerem Body gesendet wird
- **THEN** antwortet der Server mit HTTP 401 oder 403

#### Scenario: T4: /api/admin/clients/roles-assign requires admin auth
- **GIVEN** ein nicht authentifizierter HTTP-Client
- **WHEN** ein POST-Request an `/api/admin/clients/roles-assign` mit leerem Body gesendet wird
- **THEN** antwortet der Server mit HTTP 401 oder 403

#### Scenario: T5: /registrieren page loads and shows registration form
- **GIVEN** ein Browser ohne aktive Sitzung
- **WHEN** die URL `/registrieren` aufgerufen wird
- **THEN** ist eine Überschrift mit dem Text „Registrieren" sichtbar

#### Scenario: T6: /api/auth/login redirects to Pocket ID (SSO)
- **GIVEN** ein nicht authentifizierter HTTP-Client ohne Weiterleitungsfolgen
- **WHEN** ein GET-Request an `/api/auth/login` gesendet wird
- **THEN** antwortet der Server mit HTTP 302 und einem `Location`-Header, der `openid-connect/auth` enthält

---

### Requirement: FA-07: Website API & Inhalte
<!-- source: fa-07-search.spec.ts -->

The system SHALL expose a health endpoint, a structured services listing, and a ticket status API with proper input validation, while keeping legal pages publicly reachable.

#### Scenario: T1: /api/health returns ok
- **GIVEN** der Website-Server läuft
- **WHEN** ein GET-Request an `/api/health` gesendet wird
- **THEN** antwortet der Server mit HTTP 200 und einem JSON-Body, in dem `ok` den Wert `true` hat

#### Scenario: T2: /api/leistungen returns JSON list with expected shape
- **GIVEN** der Website-Server läuft
- **WHEN** ein GET-Request an `/api/leistungen` gesendet wird
- **THEN** antwortet der Server mit HTTP 200 und einem JSON-Array, dessen Einträge die Felder `key`, `name` und `category` besitzen

#### Scenario: T3: /api/status rejects invalid ticket ID format
- **GIVEN** der Website-Server läuft
- **WHEN** ein GET-Request an `/api/status?id=INVALID` gesendet wird
- **THEN** antwortet der Server mit HTTP 400 und einem JSON-Body, der ein `error`-Feld enthält

#### Scenario: T4: /api/status returns 404 for non-existent ticket
- **GIVEN** der Website-Server läuft
- **WHEN** ein GET-Request an `/api/status?id=BR-20260101-0000` mit einer nicht existierenden Ticket-ID gesendet wird
- **THEN** antwortet der Server mit HTTP 404 oder HTTP 200 (leeres Ergebnis)

#### Scenario: T5: Legal and info pages are reachable
- **GIVEN** ein Browser ohne aktive Sitzung
- **WHEN** die Seiten `/impressum`, `/datenschutz` und `/agb` nacheinander aufgerufen werden
- **THEN** liefert jede Seite HTTP 200

---

### Requirement: FA-09: Service Catalog
<!-- source: fa-09-billing.spec.ts -->

The system SHALL display a service catalog page with categorized offerings and pricing information, and SHALL reject malformed invoice creation requests.

#### Scenario: T1: /leistungen page loads
- **GIVEN** ein Browser ohne aktive Sitzung
- **WHEN** die URL `/leistungen` aufgerufen wird
- **THEN** ist eine `<h1>`-Überschrift mit dem Text „Leistungen" sichtbar

#### Scenario: T2: All service categories visible
- **GIVEN** die Leistungsseite ist geladen
- **WHEN** die Seite `/leistungen` aufgerufen wird
- **THEN** enthält die Seite mindestens eine Überschrift (h2 oder h3) mit einem leistungsbezogenen Begriff und mindestens eine weitere Überschrift

#### Scenario: T3: Pricing displayed correctly
- **GIVEN** die Leistungsseite ist geladen
- **WHEN** die Seite `/leistungen` aufgerufen wird
- **THEN** enthält der Seitentext Preisinformationen (Euro-Zeichen, Stundenangaben oder Preisangaben)

#### Scenario: T4: POST /api/billing/create-invoice without data returns 400
- **GIVEN** ein nicht authentifizierter HTTP-Client
- **WHEN** ein POST-Request an `/api/billing/create-invoice` mit leerem Body gesendet wird
- **THEN** antwortet der Server mit HTTP 400

---

### Requirement: FA-10: Unternehmenswebsite (Astro) & Kontaktformular
<!-- source: fa-10-website.spec.ts -->

The system SHALL provide a fully navigable Astro-based website with a functional multi-step contact form that accepts submissions and confirms them to the user.

#### Scenario: T1: Landing page loads
- **GIVEN** ein Browser ohne aktive Sitzung
- **WHEN** die Startseite aufgerufen wird
- **THEN** antwortet der Server mit HTTP 200 und eine `<h1>`-Überschrift ist sichtbar

#### Scenario: T2: Subpages are reachable
- **GIVEN** ein Browser ohne aktive Sitzung
- **WHEN** die Unterseiten (Coaching, Beratung, Kontakt, Leistungen, Registrieren) nacheinander aufgerufen werden
- **THEN** liefert jede Unterseite HTTP 200

#### Scenario: T3: Navigation is functional
- **GIVEN** die Startseite ist geladen
- **WHEN** die Seite gerendert ist
- **THEN** ist ein `<nav>`-Element sichtbar und enthält einen Link auf `/kontakt`

#### Scenario: T4: Contact page loads
- **GIVEN** ein Browser ohne aktive Sitzung
- **WHEN** die URL `/kontakt` aufgerufen wird
- **THEN** ist eine `<h1>`-Überschrift mit dem Text „In 30 Minuten … wissen wir … ob es passt" sichtbar

#### Scenario: T5: Contact form has all required fields
- **GIVEN** die Kontaktseite ist geladen und alle Astro-Islands sind hydriert
- **WHEN** der Tab „Nachricht" angeklickt wird
- **THEN** sind die Felder „Wie kann ich helfen", Name, E-Mail und „Ihre Nachricht" sichtbar

#### Scenario: T6: Valid form submission succeeds
- **GIVEN** die Kontaktseite ist geladen, der Tab „Nachricht" ist aktiv und das Formular ist vollständig ausgefüllt
- **WHEN** der Button „Nachricht senden" geklickt wird
- **THEN** erscheint eine Bestätigungsmeldung mit dem Text „Vielen Dank"

#### Scenario: T7: Sidebar shows contact information
- **GIVEN** die Kontaktseite ist geladen
- **WHEN** die Seite gerendert ist
- **THEN** ist die Kontakt-E-Mail-Adresse sichtbar und entweder die Telefonnummer oder ein Verweis auf das Impressum ist vorhanden

---

### Requirement: FA-12: Claude Code AI Assistant (MCP-Infrastruktur)
<!-- source: fa-12-mcp.spec.ts -->

The system SHALL expose an authentication status endpoint that correctly reports unauthenticated sessions, protect MCP routes behind authentication, and serve the admin section without internal server errors.

#### Scenario: T1-T4: MCP pod readiness (kubectl, skipped without cluster context)
- **GIVEN** kein Kubernetes-Cluster-Kontext (`KUBECONFIG` oder `MCP_CLUSTER_CONTEXT`) ist gesetzt
- **WHEN** die Pod-Bereitschaftsprüfung ausgeführt wird
- **THEN** wird der Test übersprungen, da kubectl-Zugriff nicht verfügbar ist

#### Scenario: T5: /api/auth/me reports unauthenticated without session
- **GIVEN** ein Browser ohne aktive Sitzung
- **WHEN** ein GET-Request an `/api/auth/me` gesendet wird
- **THEN** antwortet der Server mit HTTP 200 (mit `authenticated: false`) oder HTTP 401

#### Scenario: T5b: Unauthenticated POST to a protected MCP route returns 401
- **GIVEN** ein nicht authentifizierter HTTP-Client
- **WHEN** ein POST-Request an `/api/mcp/auth` mit leerem JSON-Body gesendet wird
- **THEN** antwortet der Server mit HTTP 401, 403 oder 404

#### Scenario: T6: /admin page does not return Internal Server Error
- **GIVEN** ein Browser ohne aktive Sitzung
- **WHEN** die URL `/admin` aufgerufen wird
- **THEN** enthält die Seite weder den Text „Internal Server Error" noch „500" (Weiterleitung zu Pocket ID ist zulässig)

---

### Requirement: FA-13: Dokumentations-Service
<!-- source: fa-13-docs.spec.ts -->

The system SHALL serve a Docsify-based documentation site that is reachable via HTTP and renders its content in the browser without error pages.

#### Scenario: T1: docs deployment readiness (kubectl, skipped without cluster context)
- **GIVEN** kein Kubernetes-Cluster-Kontext ist gesetzt
- **WHEN** die Deployment-Bereitschaftsprüfung ausgeführt wird
- **THEN** wird der Test übersprungen, da kubectl-Zugriff nicht verfügbar ist

#### Scenario: T2-T3: internal cluster URL and ConfigMap check (skipped without cluster context)
- **GIVEN** kein Kubernetes-Cluster-Kontext ist gesetzt
- **WHEN** die interne Cluster-URL- und ConfigMap-Prüfung ausgeführt wird
- **THEN** wird der Test übersprungen, da kubectl-Zugriff nicht verfügbar ist

#### Scenario: T3: Docs URL is reachable via HTTP
- **GIVEN** der Dokumentations-Service läuft
- **WHEN** ein GET-Request an die Docs-URL gesendet wird (mit bis zu 3 Weiterleitungen)
- **THEN** antwortet der Server mit HTTP 200, 301 oder 302

#### Scenario: T4: Docsify-Startseite lädt im Browser
- **GIVEN** ein Browser ohne aktive Sitzung
- **WHEN** die Docs-URL aufgerufen wird
- **THEN** ist das Docsify-App-Element (`#app` oder `.app-nav`) sichtbar und die Seite enthält weder „502 Bad Gateway" noch „404 Not Found" noch „Internal Server Error"

---

### Requirement: FA-14: User Registration Flow
<!-- source: fa-14-registration.spec.ts -->

The system SHALL provide a user-facing registration page with all required form fields and SHALL perform client-side validation to prevent submission of incomplete forms.

#### Scenario: should load registration page and show form
- **GIVEN** ein Browser ohne aktive Sitzung
- **WHEN** die URL `/registrieren` aufgerufen wird
- **THEN** ist eine Überschrift mit „Registrieren" sowie die Felder Vorname, Nachname, E-Mail und ein Absende-Button sichtbar

#### Scenario: should show validation error for missing fields
- **GIVEN** die Registrierungsseite ist geladen und das Formular ist leer
- **WHEN** der Absende-Button geklickt wird
- **THEN** wird eine Validierungsfehlermeldung angezeigt oder mindestens ein Eingabefeld ist als ungültig markiert

---

### Requirement: FA-15: OIDC Website Login
<!-- source: fa-15-oidc.spec.ts -->

The system SHALL implement OIDC-based authentication for the website by redirecting login requests to Pocket ID, exposing a session status endpoint, and displaying the correct navigation elements based on authentication state.

#### Scenario: T1: /api/auth/login redirects to Pocket ID
- **GIVEN** ein nicht authentifizierter HTTP-Client
- **WHEN** ein GET-Request an `/api/auth/login` ohne Weiterleitung gesendet wird
- **THEN** antwortet das System mit HTTP 302 und einer `Location`-Header, der `openid-connect/auth` und `client_id=website` enthält

#### Scenario: T2: /api/auth/me returns unauthenticated when no session
- **GIVEN** kein aktives Session-Cookie im Request
- **WHEN** ein GET-Request an `/api/auth/me` gesendet wird
- **THEN** antwortet das System mit HTTP 200 und einem JSON-Body `{ authenticated: false }`

#### Scenario: T3: /api/auth/logout redirects
- **GIVEN** ein HTTP-Client ohne oder mit Session
- **WHEN** ein GET-Request an `/api/auth/logout` ohne Weiterleitung gesendet wird
- **THEN** antwortet das System mit HTTP 302

#### Scenario: T4: Nav shows Anmelden when not logged in
- **GIVEN** ein nicht eingeloggter Benutzer öffnet die Startseite
- **WHEN** die Seite vollständig geladen und der Auth-Check abgeschlossen ist
- **THEN** ist ein Link mit `href="/api/auth/login"` (Anmelden) in der Navigation sichtbar

#### Scenario: T5: Nav shows Registrieren when not logged in
- **GIVEN** ein nicht eingeloggter Benutzer öffnet die Startseite
- **WHEN** die Seite vollständig geladen und der Auth-Check abgeschlossen ist
- **THEN** ist ein Link mit `href="/registrieren"` (Registrieren) in der Navigation sichtbar

---

### Requirement: FA-16: Calendar Booking
<!-- source: fa-16-booking.spec.ts -->

The system SHALL provide a calendar booking API that returns structured availability slots on working days only, and SHALL reject booking requests for unavailable or invalid slots with appropriate HTTP error codes.

#### Scenario: T1: /api/calendar/slots returns JSON array
- **GIVEN** der Kalender-Service ist verfügbar
- **WHEN** ein GET-Request an `/api/calendar/slots` gesendet wird
- **THEN** antwortet das System mit HTTP 200 und einem JSON-Array als Body

#### Scenario: T2: Slots have correct structure
- **GIVEN** der Slot-Endpunkt gibt mindestens einen Eintrag zurück
- **WHEN** die Antwort des ersten Elements ausgewertet wird
- **THEN** enthält jedes Slot-Objekt die Felder `date`, `weekday`, `slots` (Array) mit den Unterfeldern `start`, `end` und `display`

#### Scenario: T3: Slots only on working days (Mon-Fri)
- **GIVEN** der Slot-Endpunkt gibt eine Liste von Tagen zurück
- **WHEN** alle zurückgegebenen Tage auf den `weekday`-Wert geprüft werden
- **THEN** enthält keiner der Tage den Wochentag `Samstag` oder `Sonntag`

#### Scenario: T4: /termin redirects to contact page with termin tab active
- **GIVEN** ein Benutzer navigiert zur URL `/termin`
- **WHEN** die Seite geladen wird
- **THEN** wird der Benutzer auf `/kontakt` weitergeleitet und ein Button mit dem Text „Termin buchen" ist sichtbar

#### Scenario: T5: POST /api/booking without data returns 400
- **GIVEN** ein Client sendet einen leeren Request-Body
- **WHEN** ein POST-Request an `/api/booking` mit leerem Objekt gesendet wird
- **THEN** antwortet das System mit HTTP 400

#### Scenario: T6: POST /api/booking with non-whitelisted slot returns 409
- **GIVEN** ein Client sendet einen Buchungsversuch für einen in der Vergangenheit liegenden, nicht verfügbaren Slot
- **WHEN** ein POST-Request an `/api/booking` mit gültiger Struktur aber ungültigem Slot-Datum gesendet wird
- **THEN** antwortet das System mit HTTP 409 und einer Fehlermeldung, die das Wort „verfügbar" enthält

---

### Requirement: FA-17: Meeting Lifecycle
<!-- source: fa-17-meeting.spec.ts -->

The system SHALL provide a reminders processing endpoint that reports the count of sent and pending reminders and exposes a pending reminder list — this requirement is currently deferred pending implementation of the `/api/reminders/process` endpoint.

#### Scenario: T1: Reminders process endpoint works
- **GIVEN** der Reminder-Endpunkt ist implementiert und erreichbar
- **WHEN** ein POST-Request an `/api/reminders/process` gesendet wird
- **THEN** antwortet das System mit HTTP 200 und einem JSON-Body mit den numerischen Feldern `sent` und `pending`

#### Scenario: T2: Reminders GET shows pending list
- **GIVEN** der Reminder-Endpunkt ist implementiert und erreichbar
- **WHEN** ein GET-Request an `/api/reminders/process` gesendet wird
- **THEN** antwortet das System mit HTTP 200 und einem JSON-Body mit den Feldern `pending` und `reminders` (Array)

---

### Requirement: FA-18: Live-Transkription (talk-transcriber)
<!-- source: fa-18-transcription.spec.ts -->

The system SHALL provide a live transcription service that reports its health status, verifies HMAC-signed webhook requests from Nextcloud Talk, and gracefully handles invalid signatures, missing tokens, and malformed payloads.

#### Scenario: T1: /health returns ok or degraded with expected shape
- **GIVEN** der talk-transcriber Service ist im Cluster erreichbar
- **WHEN** ein GET-Request an `/health` gesendet wird
- **THEN** antwortet der Service mit HTTP 200 und einem JSON-Body, der `status` (`"ok"` oder `"degraded"`), `pulseaudio` (Boolean) und `active` (Array) enthält

#### Scenario: T2: /webhook rejects missing HMAC signature with 401
- **GIVEN** der talk-transcriber Service läuft
- **WHEN** ein POST-Request an `/webhook` ohne `X-Nextcloud-Talk-Signature`-Header gesendet wird
- **THEN** antwortet der Service mit HTTP 401

#### Scenario: T3: /webhook rejects invalid HMAC signature with 401
- **GIVEN** der talk-transcriber Service läuft
- **WHEN** ein POST-Request an `/webhook` mit einem ungültigen HMAC-Wert im `X-Nextcloud-Talk-Signature`-Header gesendet wird
- **THEN** antwortet der Service mit HTTP 401

#### Scenario: T4: /webhook accepts valid HMAC and returns ok or started
- **GIVEN** der talk-transcriber Service läuft und der korrekte HMAC-Secret ist konfiguriert
- **WHEN** ein POST-Request an `/webhook` mit gültigem HMAC-signierten Body gesendet wird
- **THEN** antwortet der Service mit HTTP 2xx und `status` ist einer von `"started"`, `"ok"` oder `"rejected"`

#### Scenario: T5: /webhook with missing token returns ignored
- **GIVEN** der talk-transcriber Service läuft
- **WHEN** ein gültig signierter POST-Request an `/webhook` ohne das Feld `token` im Body gesendet wird
- **THEN** antwortet der Service mit HTTP 2xx und `status` ist `"ignored"`

#### Scenario: T6: /webhook rejects malformed JSON with 400
- **GIVEN** der talk-transcriber Service läuft
- **WHEN** ein POST-Request an `/webhook` mit ungültigem JSON-Body (aber gültigem HMAC) gesendet wird
- **THEN** antwortet der Service mit HTTP 400

#### Scenario: T7: /health reports active session after webhook trigger
- **GIVEN** der talk-transcriber Service läuft und ein `call_started`-Event wurde via Webhook übermittelt
- **WHEN** unmittelbar danach ein GET-Request an `/health` gesendet wird
- **THEN** enthält der Response-Body das Feld `active` als Array (Sitzungszustand wird korrekt erfasst)

---

### Requirement: FA-20: Meeting Finalization Pipeline
<!-- source: fa-20-finalize.spec.ts -->

The system SHALL provide a meeting finalization endpoint that validates required input fields, rejects incomplete requests with HTTP 400, and processes valid finalization data with a success response on the mentolder cluster.

#### Scenario: T1: POST /api/meeting/finalize without data returns 400
- **GIVEN** ein Client sendet einen leeren Request-Body
- **WHEN** ein POST-Request an `/api/meeting/finalize` mit leerem Objekt gesendet wird
- **THEN** antwortet das System mit HTTP 400

#### Scenario: T2: POST /api/meeting/finalize with valid data returns success
- **GIVEN** das Meeting-Schema ist im Cluster vorhanden und der Client sendet vollständige Meeting-Daten
- **WHEN** ein POST-Request an `/api/meeting/finalize` mit `customerName`, `customerEmail`, `meetingType` und `meetingDate` gesendet wird
- **THEN** antwortet das System mit HTTP 200 und einem JSON-Body `{ success: true, results: [...] }`

---

### Requirement: FA-21: Service Catalog & Billing
<!-- source: fa-21-billing.spec.ts -->

The system SHALL display the service catalog on the `/leistungen` page with booking links, enforce input validation on the billing API, and restrict access to the invoice portal to authenticated users.

#### Scenario: T1: /leistungen page displays services
- **GIVEN** ein Benutzer öffnet die Seite `/leistungen`
- **WHEN** die Seite vollständig geladen ist
- **THEN** ist eine Überschrift mit „Leistungen" oder „Services" sichtbar und die Seite enthält Angebotsbezeichnungen wie „Digital Cafe", „Coaching" oder „Beratung"

#### Scenario: T2: Service links point to booking page
- **GIVEN** ein Benutzer öffnet die Seite `/leistungen`
- **WHEN** die Seite vollständig geladen ist
- **THEN** ist mindestens ein Link mit `href` der `/termin` enthält vorhanden

#### Scenario: T3: Billing API validates input
- **GIVEN** ein nicht authentifizierter Client sendet einen leeren Request-Body
- **WHEN** ein POST-Request an `/api/billing/create-invoice` mit leerem Objekt gesendet wird
- **THEN** antwortet das System mit HTTP 400

#### Scenario: T4: portal invoice section is auth-protected
- **GIVEN** ein nicht eingeloggter Benutzer navigiert zu `/portal`
- **WHEN** die Seite lädt
- **THEN** wird der Benutzer auf eine andere URL weitergeleitet (kein Verbleib auf `/portal`)

---

### Requirement: FA-21 PR-A: Invoice Lifecycle (Partial/Full Payment)
<!-- source: fa-21-billing.spec.ts -->

The system SHALL manage invoice payment lifecycle correctly by transitioning status from open to partially paid to fully paid upon successive payment posts, and SHALL reject payment amounts that exceed the outstanding invoice balance.

#### Scenario: partial payment then full payment toggles status
- **GIVEN** ein Admin ist eingeloggt, eine Rechnung über 100 € wurde erstellt und finalisiert
- **WHEN** zuerst eine Teilzahlung von 40 € und danach eine Restzahlung von 60 € via POST an `/api/admin/billing/{id}/payments` gesendet werden
- **THEN** zeigt die Rechnungsliste nach der Teilzahlung den Status „Teilbezahlt" und nach der Restzahlung den Status „Bezahlt"

#### Scenario: payment overshoot rejected
- **GIVEN** ein Admin ist eingeloggt, eine Rechnung über 100 € wurde erstellt, finalisiert und mit 80 € teilbezahlt
- **WHEN** eine weitere Zahlung von 50 € (Überzahlung um 30 €) via POST an `/api/admin/billing/{id}/payments` gesendet wird
- **THEN** antwortet das System mit HTTP 400 und einer Fehlermeldung, die „exceeds outstanding" enthält

---

### Requirement: FA-23: Vaultwarden Passwort-Manager
<!-- source: fa-23-vaultwarden.spec.ts -->

The system SHALL host a functioning Vaultwarden instance that serves its login UI, provides an email input field, exposes an SSO login button for Pocket ID integration, and responds to its health endpoint with HTTP 200.

#### Scenario: T1: Vaultwarden login page loads
- **GIVEN** die Vaultwarden-Instanz ist im Cluster erreichbar
- **WHEN** die Root-URL des Vault aufgerufen wird
- **THEN** antwortet der Server mit HTTP 200

#### Scenario: T2: Login page has email input
- **GIVEN** die Vaultwarden-Loginseite wurde geladen
- **WHEN** das DOM der Seite analysiert wird
- **THEN** ist ein E-Mail-Eingabefeld im DOM vorhanden (als DOM-Element attached)

#### Scenario: T3: SSO login button visible
- **GIVEN** die Vaultwarden-Loginseite wurde geladen
- **WHEN** die Seite auf SSO-bezogene Schaltflächen geprüft wird
- **THEN** ist ein SSO- oder Single-Sign-On-Button sichtbar

#### Scenario: T4: /alive health endpoint returns 200
- **GIVEN** die Vaultwarden-Instanz ist im Cluster erreichbar
- **WHEN** der Endpunkt `/alive` aufgerufen wird
- **THEN** antwortet der Server mit HTTP 200

---

### Requirement: FA-24: Kollaboratives Whiteboard
<!-- source: fa-24-whiteboard.spec.ts -->

The system SHALL expose the collaborative whiteboard service on a reachable URL that responds without a server-side error.

#### Scenario: T1: Whiteboard service responds
- **GIVEN** das Whiteboard-Dienst unter BOARD_URL erreichbar ist
- **WHEN** ein HTTP-GET auf die Whiteboard-URL ausgeführt wird
- **THEN** antwortet der Dienst mit einem HTTP-Statuscode kleiner als 500

#### Scenario: T2: Whiteboard is not returning server error
- **GIVEN** das Whiteboard unter BOARD_URL bereitgestellt ist
- **WHEN** ein HTTP-GET auf die Whiteboard-URL ausgeführt wird
- **THEN** ist der HTTP-Statuscode weder 502 noch 503

---

### Requirement: FA-25: Mailpit E-Mail-Server
<!-- source: fa-25-mailpit.spec.ts -->

The system SHALL provide a Mailpit mail service whose web UI and API are reachable and return expected responses when accessed directly or via an authentication proxy.

#### Scenario: T1: Mailpit web UI loads
- **GIVEN** der Mailpit-Dienst unter MAIL_URL betrieben wird
- **WHEN** ein HTTP-GET auf die Mailpit-URL ausgeführt wird
- **THEN** antwortet der Dienst mit HTTP 200 (direkt erreichbar) oder HTTP 401 (hinter oauth2-proxy)

#### Scenario: T2: Web UI shows message list
- **GIVEN** Mailpit ist direkt ohne Authentifizierungsproxy erreichbar
- **WHEN** die Mailpit-Web-Oberfläche im Browser aufgerufen wird
- **THEN** ist die Nachrichtenliste sichtbar auf der Seite

#### Scenario: T3: Mailpit API returns messages endpoint
- **GIVEN** der Mailpit-Dienst ist erreichbar und kein Authentifizierungsproxy blockiert den Zugriff
- **WHEN** ein HTTP-GET auf `/api/v1/messages?limit=1` ausgeführt wird
- **THEN** antwortet der Dienst mit HTTP 200 und einem JSON-Body, der die Eigenschaft `messages` enthält

---

### Requirement: FA-26: Bug report API
<!-- source: fa-26-bug-report-form.spec.ts -->

The system SHALL validate all required fields of the bug-report endpoint and reject malformed or incomplete requests with HTTP 400, while accepting valid submissions and returning a ticket ID.

#### Scenario: POST /api/bug-report without description returns 400
- **GIVEN** der Bug-Report-Endpunkt ist verfügbar
- **WHEN** ein POST-Request ohne das Pflichtfeld `description` gesendet wird
- **THEN** antwortet der Endpunkt mit HTTP 400 und einem JSON-Body mit der Eigenschaft `error`

#### Scenario: POST /api/bug-report with invalid email returns 400
- **GIVEN** der Bug-Report-Endpunkt ist verfügbar
- **WHEN** ein POST-Request mit einer ungültigen E-Mail-Adresse gesendet wird
- **THEN** antwortet der Endpunkt mit HTTP 400 und einem JSON-Body mit der Eigenschaft `error`

#### Scenario: POST /api/bug-report with invalid category returns 400
- **GIVEN** der Bug-Report-Endpunkt ist verfügbar
- **WHEN** ein POST-Request mit einer ungültigen Kategorie gesendet wird
- **THEN** antwortet der Endpunkt mit HTTP 400 und einem JSON-Body mit der Eigenschaft `error`

#### Scenario: POST /api/bug-report with valid data returns 200 with ticketId
- **GIVEN** der Bug-Report-Endpunkt ist verfügbar und CRON_SECRET ist gesetzt
- **WHEN** ein POST-Request mit gültigem Beschreibungstext, E-Mail-Adresse und Kategorie gesendet wird
- **THEN** antwortet der Endpunkt mit HTTP 200, `success: true` und einer Ticket-ID im Format `T\d+`

#### Scenario: POST /api/bug-report with description too long returns 400
- **GIVEN** der Bug-Report-Endpunkt ist verfügbar
- **WHEN** ein POST-Request mit einer Beschreibung länger als 2000 Zeichen gesendet wird
- **THEN** antwortet der Endpunkt mit HTTP 400

#### Scenario: GET /api/status with valid ticket format — API responds correctly
- **GIVEN** der Ticket-Status-Endpunkt ist verfügbar
- **WHEN** ein GET-Request auf `/api/status?id=T000001` ausgeführt wird
- **THEN** antwortet der Endpunkt mit HTTP 200 oder 404 und einem JSON-Objekt als Body

---

### Requirement: FA-27: Systemisches Brett
<!-- source: fa-27-brett.spec.ts -->

The system SHALL provide the Brett service with reachable HTTP endpoints for health checks, board state, snapshots, customers, and figure presets, with proper input validation on all write operations.

#### Scenario: T1: Brett service is reachable
- **GIVEN** der Brett-Dienst ist unter BRETT_URL bereitgestellt
- **WHEN** ein HTTP-GET auf die Brett-URL ausgeführt wird
- **THEN** antwortet der Dienst mit HTTP 200, 301 oder 302

#### Scenario: T2: /healthz returns 200
- **GIVEN** der Brett-Dienst läuft
- **WHEN** ein HTTP-GET auf `/healthz` ausgeführt wird
- **THEN** antwortet der Endpunkt mit HTTP 200

#### Scenario: T3: /api/state returns JSON figures array for unknown room
- **GIVEN** der Brett-Dienst läuft
- **WHEN** ein HTTP-GET auf `/api/state` mit einer unbekannten Raum-ID ausgeführt wird
- **THEN** antwortet der Endpunkt mit HTTP 200 und einem JSON-Body mit einem `figures`-Array

#### Scenario: T4: /three.min.js static asset is served
- **GIVEN** der Brett-Dienst läuft
- **WHEN** ein HTTP-GET auf `/three.min.js` ausgeführt wird
- **THEN** antwortet der Dienst mit HTTP 200

#### Scenario: T5: POST /api/snapshots creates a snapshot (current schema)
- **GIVEN** der Brett-Dienst läuft
- **WHEN** ein POST-Request auf `/api/snapshots` mit einem gültigen Raum-Token, Namen und leerer Figurenliste gesendet wird
- **THEN** antwortet der Endpunkt mit HTTP 200 oder 201 und einem JSON-Body mit der Eigenschaft `id`

#### Scenario: T6: GET /api/snapshots without params returns 400
- **GIVEN** der Brett-Dienst läuft
- **WHEN** ein HTTP-GET auf `/api/snapshots` ohne Parameter ausgeführt wird
- **THEN** antwortet der Endpunkt mit HTTP 400 und einem JSON-Body mit der Eigenschaft `error`

#### Scenario: T7: GET /api/snapshots with room param returns array
- **GIVEN** der Brett-Dienst läuft
- **WHEN** ein HTTP-GET auf `/api/snapshots` mit einem Raum-Parameter ausgeführt wird
- **THEN** antwortet der Endpunkt mit HTTP 200 und einem JSON-Array

#### Scenario: T8: GET /api/snapshots/:id returns 404 for unknown UUID
- **GIVEN** der Brett-Dienst läuft
- **WHEN** ein HTTP-GET auf `/api/snapshots/<unbekannte-UUID>` ausgeführt wird
- **THEN** antwortet der Endpunkt mit HTTP 404

#### Scenario: T9: POST /api/snapshots validates missing state.figures
- **GIVEN** der Brett-Dienst läuft
- **WHEN** ein POST-Request auf `/api/snapshots` ohne das Pflichtfeld `state.figures` gesendet wird
- **THEN** antwortet der Endpunkt mit HTTP 400 und einer Fehlermeldung, die `state.figures` nennt

#### Scenario: T10: GET /api/customers returns array
- **GIVEN** der Brett-Dienst läuft
- **WHEN** ein HTTP-GET auf `/api/customers` ausgeführt wird
- **THEN** antwortet der Endpunkt mit HTTP 200 und einem JSON-Array

#### Scenario: T11: GET /presets returns array
- **GIVEN** der Brett-Dienst läuft
- **WHEN** ein HTTP-GET auf `/presets` ausgeführt wird
- **THEN** antwortet der Endpunkt mit HTTP 200 und einem JSON-Array

#### Scenario: T12: POST /presets creates preset and DELETE removes it
- **GIVEN** der Brett-Dienst läuft
- **WHEN** ein Preset per POST auf `/presets` angelegt und anschließend per DELETE entfernt wird
- **THEN** liefert POST HTTP 201 mit einem Body der die Eigenschaft `id` enthält, DELETE HTTP 204, und ein erneutes DELETE HTTP 404

#### Scenario: T13: POST /presets validates name length
- **GIVEN** der Brett-Dienst läuft
- **WHEN** ein POST-Request auf `/presets` mit einem Namen länger als 100 Zeichen gesendet wird
- **THEN** antwortet der Endpunkt mit HTTP 400 und einem JSON-Body mit der Eigenschaft `error`

---

### Requirement: FA-28: Website-Messaging (internes Chat-System)
<!-- source: fa-28-messaging.spec.ts -->

The system SHALL protect all messaging API endpoints from unauthenticated access and redirect unauthenticated browser sessions away from the portal chat interface.

#### Scenario: T1: website deployment readiness (kubectl, skipped without cluster context)
- **GIVEN** ein Kubernetes-Cluster-Kontext ist verfügbar
- **WHEN** der Deployment-Status des Website-Pods abgefragt wird
- **THEN** ist das Website-Deployment als bereit (ready) ausgewiesen

#### Scenario: T2: GET /api/portal/messages returns 401 without auth
- **GIVEN** kein Authentifizierungs-Token ist vorhanden
- **WHEN** ein HTTP-GET auf `/api/portal/messages` ausgeführt wird
- **THEN** antwortet der Endpunkt mit HTTP 401

#### Scenario: T3: GET /api/admin/messages returns 401 without auth
- **GIVEN** kein Authentifizierungs-Token ist vorhanden
- **WHEN** ein HTTP-GET auf `/api/admin/messages` ausgeführt wird
- **THEN** antwortet der Endpunkt mit HTTP 401 oder 403

#### Scenario: T4: GET /api/admin/rooms returns 401 without auth
- **GIVEN** kein Authentifizierungs-Token ist vorhanden
- **WHEN** ein HTTP-GET auf `/api/admin/rooms` ausgeführt wird
- **THEN** antwortet der Endpunkt mit HTTP 401 oder 403

#### Scenario: T5: POST /api/portal/messages with empty body returns 400 or 401
- **GIVEN** kein Authentifizierungs-Token ist vorhanden
- **WHEN** ein POST-Request mit leerem Body auf `/api/portal/messages` gesendet wird
- **THEN** antwortet der Endpunkt mit HTTP 400, 401 oder 403

#### Scenario: T6: SESSIONS_DATABASE_URL ConfigMap check (kubectl, skipped without cluster context)
- **GIVEN** ein Kubernetes-Cluster-Kontext ist verfügbar
- **WHEN** die ConfigMap des Website-Deployments auf die Variable `SESSIONS_DATABASE_URL` geprüft wird
- **THEN** ist `SESSIONS_DATABASE_URL` in der ConfigMap gesetzt

#### Scenario: T7: messaging schema tables exist (psql, skipped without cluster context)
- **GIVEN** ein Kubernetes-Cluster-Kontext mit Datenbankzugang ist verfügbar
- **WHEN** das Datenbankschema auf die Messaging-Tabellen geprüft wird
- **THEN** sind alle erforderlichen Messaging-Tabellen im Schema vorhanden

#### Scenario: T8: /portal redirects unauthenticated user away from portal
- **GIVEN** kein Benutzer ist eingeloggt
- **WHEN** ein Browser die URL `/portal` aufruft
- **THEN** wird der Benutzer umgeleitet oder es wird kein Chat-UI mit dem Text „Nachrichten senden" angezeigt

---

### Requirement: FA-52 · Arena banner is cross-brand
<!-- source: fa-52-arena-banner.spec.ts -->

The system SHALL propagate an arena lobby banner created on one brand (mentolder) to a logged-in viewer on a second brand (korczewski) within seconds, and SHALL persist the per-lobby dismissal state across page reloads.

#### Scenario: admin opens lobby on mentolder → banner appears on both brands
- **GIVEN** ein Admin ist auf `web.mentolder.de` eingeloggt und ein Benutzer ist auf `web.korczewski.de` eingeloggt
- **WHEN** der Admin auf der Arena-Admin-Seite die Lobby öffnet
- **THEN** erscheint das Banner `.arena-banner` mit dem Text „ARENA · LOBBY OPEN" auf der Korczewski-Seite innerhalb von 8 Sekunden, und nach dem Schließen und Neuladen bleibt das Banner ausgeblendet

---

### Requirement: FA-30: E-Rechnung / XRechnung (einvoice-sidecar)
<!-- source: fa-30-einvoice.spec.ts -->

The system SHALL provide the einvoice-sidecar service with reachable HTTP endpoints for PDF/A-3 embedding and XRechnung validation, rejecting invalid or missing payloads with a structured error response.

#### Scenario: T1: einvoice-sidecar service is reachable
- **GIVEN** EINVOICE_URL ist gesetzt und der Dienst ist per Port-Forward erreichbar
- **WHEN** ein HTTP-GET auf die einvoice-sidecar-URL ausgeführt wird
- **THEN** antwortet der Dienst mit einem HTTP-Statuscode (kein Netzwerkfehler)

#### Scenario: T2: POST /embed with missing payload returns 400
- **GIVEN** der einvoice-sidecar-Dienst läuft
- **WHEN** ein POST-Request auf `/embed` ohne gültigen PDF- und XML-Inhalt gesendet wird
- **THEN** antwortet der Endpunkt mit HTTP 400 oder 422

#### Scenario: T3: POST /validate endpoint returns a JSON response
- **GIVEN** der einvoice-sidecar-Dienst läuft
- **WHEN** ein POST-Request auf `/validate` ohne Payload gesendet wird
- **THEN** antwortet der Endpunkt mit HTTP 200, 400 oder 422 und einem `application/json`-Content-Type-Header

#### Scenario: T4: einvoice-sidecar landing page renders in browser
- **GIVEN** der einvoice-sidecar-Dienst läuft
- **WHEN** die Dienst-Startseite im Browser aufgerufen wird
- **THEN** ist der Body sichtbar und enthält weder „Internal Server Error" noch „502 Bad Gateway"

---

### Requirement: FA-53: System-test failure loop kanban
<!-- source: fa-53-systemtest-failure-loop.spec.ts -->

The system SHALL provide an authenticated admin kanban board for tracking system-test failures with four defined columns, protect the board and its API from unauthenticated access, and return a canonical JSON shape from the board API endpoint.

#### Scenario: T1: /admin/systemtest/board redirects unauthenticated users to login
- **GIVEN** kein Benutzer ist eingeloggt
- **WHEN** ein Browser die URL `/admin/systemtest/board` aufruft
- **THEN** wird der Benutzer auf eine Login-Seite weitergeleitet und nicht auf dem Board gelassen

#### Scenario: T2: /api/admin/systemtest/board requires admin auth
- **GIVEN** kein Authentifizierungs-Token ist vorhanden
- **WHEN** ein HTTP-GET auf `/api/admin/systemtest/board` ausgeführt wird
- **THEN** antwortet der Endpunkt mit HTTP 401 oder 403

#### Scenario: T3: kanban page renders all four column headers (admin)
- **GIVEN** ein Admin ist eingeloggt und das Kanban-Board ist aufgerufen
- **WHEN** die Seite vollständig geladen ist
- **THEN** sind alle vier Spaltenüberschriften „Offen", „Fix in PR", „Retest ausstehend" und „Grün (7 Tage)" sichtbar und es treten keine schwerwiegenden JavaScript-Fehler auf

#### Scenario: T4: /api/admin/systemtest/board returns canonical shape (admin session)
- **GIVEN** ein Admin ist eingeloggt
- **WHEN** ein HTTP-GET auf `/api/admin/systemtest/board` mit der Admin-Session ausgeführt wird
- **THEN** antwortet der Endpunkt mit HTTP 200 und einem JSON-Body mit den Feldern `columns` (mit den Schlüsseln `open`, `fix_in_pr`, `retest_pending`, `green` als Arrays) und `undelivered` als Zahl

---

### Requirement: FA-32: LLM-Router bge-m3 Embeddings
<!-- source: fa-32-llm-bge-m3.spec.ts -->

The system SHALL expose an embeddings endpoint that accepts bge-m3 model requests and returns a 1024-dimensional vector, and the LLM router base URL SHALL be reachable without gateway errors.

#### Scenario: T2+T3: bge-m3 embedding returns a 1024-dimensional vector
- **GIVEN** der LLM-Router ist unter `LLM_ROUTER_URL` erreichbar und nimmt JSON-Anfragen entgegen
- **WHEN** ein POST-Request an `/v1/embeddings` mit Modell `bge-m3` und dem Eingabetext `"test"` gesendet wird
- **THEN** antwortet der Endpunkt mit HTTP 200 und liefert ein Embedding-Array mit exakt 1024 Dimensionen zurück

#### Scenario: Browser: LLM router base URL is reachable
- **GIVEN** der LLM-Router ist gestartet und unter der konfigurierten Basis-URL erreichbar
- **WHEN** ein Browser die Basis-URL des LLM-Routers aufruft
- **THEN** ist der Seiteninhalt sichtbar und enthält keine `502 Bad Gateway`-Meldung

---

### Requirement: FA-33: LLM-Router voyage-multilingual-2
<!-- source: fa-33-llm-voyage.spec.ts -->

The system SHALL provide a voyage-multilingual-2 embedding endpoint that returns a 1024-dimensional vector independently of the local TEI service availability.

#### Scenario: T1: voyage-multilingual-2 embedding returns a 1024-dimensional vector
- **GIVEN** der LLM-Router ist erreichbar und das Voyage-Modell ist konfiguriert
- **WHEN** ein POST-Request an `/v1/embeddings` mit Modell `voyage-multilingual-2` und dem Text `"capital of germany"` gesendet wird
- **THEN** antwortet der Endpunkt mit HTTP 200 und liefert ein Embedding-Array mit exakt 1024 Dimensionen zurück

#### Scenario: T2: voyage-multilingual-2 available independently of TEI status
- **GIVEN** der LLM-Router ist erreichbar und der lokale TEI-Dienst ist nicht zwingend verfügbar
- **WHEN** ein POST-Request an `/v1/embeddings` mit Modell `voyage-multilingual-2` und einem deutschen Eingabetext gesendet wird
- **THEN** antwortet der Endpunkt mit HTTP 200 und ein gültiges 1024-dimensionales Embedding wird zurückgegeben, ohne dass TEI benötigt wird

#### Scenario: Browser: LLM router base URL is reachable
- **GIVEN** der LLM-Router ist gestartet und unter der konfigurierten Basis-URL erreichbar
- **WHEN** ein Browser die Basis-URL des LLM-Routers aufruft
- **THEN** ist der Seiteninhalt sichtbar und enthält keine `502 Bad Gateway`-Meldung

---

### Requirement: FA-34: LLM-Router strict-fail (kein silent fallback)
<!-- source: fa-34-llm-strict-fail.spec.ts -->

The system SHALL return HTTP 5xx for a bge-m3 embedding request when the TEI service is unavailable, and SHALL NOT silently fall back to an alternative embedding model.

#### Scenario: T1: TEI outage is configured externally via LLM_TEI_DOWN=true
- **GIVEN** die Testumgebung ist so konfiguriert, dass der TEI-Dienst ausgefallen ist (`LLM_TEI_DOWN=true`)
- **WHEN** die Vorbedingung des Tests geprüft wird
- **THEN** bestätigt die Umgebungsvariable `LLM_TEI_DOWN=true`, dass der TEI-Ausfall korrekt simuliert ist

#### Scenario: T2: bge-m3 embedding returns 5xx when TEI is down (no silent fallback)
- **GIVEN** der TEI-Dienst ist ausgefallen und der LLM-Router läuft ohne TEI-Backend
- **WHEN** ein POST-Request an `/v1/embeddings` mit Modell `bge-m3` und dem Header `X-Embedding-Purpose: index` gesendet wird
- **THEN** antwortet der Endpunkt mit einem HTTP-5xx-Statuscode und liefert keinen stillen Fallback auf ein alternatives Modell

#### Scenario: T3: TEI restore is a manual post-test step (documented only)
- **GIVEN** der Test T2 hat die bge-m3-Anfrage im TEI-Ausfall-Szenario ausgeführt
- **WHEN** der Test abgeschlossen ist
- **THEN** wird als dokumentierter manueller Schritt festgehalten, dass die TEI-Endpunkte vom Tester wiederhergestellt werden müssen

---

### Requirement: FA-35: LLM MixedEmbeddingModelError
<!-- source: fa-35-llm-mixed-error.spec.ts -->

The system SHALL explicitly reject knowledge queries that mix bge-m3 and voyage embedding model families in a single request, returning a structured error response instead of silently performing garbage retrieval.

#### Scenario: T1: /api/knowledge/query rejects mixed bge-m3 + voyage collection query
- **GIVEN** die Website-Knowledge-API ist gestartet und unter `WEBSITE_URL` erreichbar
- **WHEN** ein POST-Request an `/api/knowledge/query` mit Collections aus beiden Modell-Familien (`bge-m3-docs` und `voyage-knowledge`) gesendet wird
- **THEN** antwortet der Endpunkt mit einem Fehler-Statuscode (400, 401, 403, 404 oder 422) und bei HTTP 400 enthält der Body einen Hinweis auf das Mixed-Model-Problem

#### Scenario: T2: knowledge query with mixed model hint returns structured error, not 200
- **GIVEN** der Knowledge-Such-Endpunkt `/api/portal/knowledge/search` ist erreichbar
- **WHEN** ein POST-Request mit beiden Modelltypen (`bge-m3` und `voyage-multilingual-2`) im `models`-Feld gesendet wird
- **THEN** antwortet der Endpunkt nicht mit HTTP 500 (kein unbehandelter Absturz), und eine stille Rückgabe mit HTTP 200 trotz gemischter Modelle ist ausgeschlossen

#### Scenario: Browser: website homepage loads without script errors
- **GIVEN** die Website ist gestartet und unter `WEBSITE_URL` erreichbar
- **WHEN** ein Browser die Homepage aufruft und bis zum `networkidle`-Zustand wartet
- **THEN** treten keine kritischen JavaScript-Fehler auf, insbesondere keine Fehler bzgl. `MixedEmbeddingModelError` oder fehlender Modulauflösung

---

### Requirement: FA-36: Rerank-Endpunkt
<!-- source: fa-36-rerank.spec.ts -->

The system SHALL provide a rerank endpoint that correctly ranks a list of documents against a query, returning all input documents in ranked order with the semantically most relevant document at the top position.

#### Scenario: T1+T2: rerank returns berlin (index 1) as top result for "capital of germany"
- **GIVEN** der LLM-Router ist erreichbar und das Rerank-Modell ist geladen
- **WHEN** ein POST-Request an `/v1/rerank` mit der Anfrage `"capital of germany"` und den Dokumenten `["paris", "berlin", "hamburg", "munich"]` gesendet wird
- **THEN** antwortet der Endpunkt mit HTTP 200 und das erste Ergebnis hat `index: 1` (entspricht `"berlin"` im Eingabe-Array)

#### Scenario: All 4 documents are returned in rerank results
- **GIVEN** der Rerank-Endpunkt ist erreichbar und empfängt eine Liste von 4 Dokumenten
- **WHEN** ein POST-Request an `/v1/rerank` mit 4 Dokumenten gesendet wird
- **THEN** enthält die Antwort genau 4 Ergebnisse, sodass kein Dokument aus der Ausgabe fehlt

#### Scenario: Browser: LLM router base URL is reachable
- **GIVEN** der LLM-Router ist gestartet und unter der konfigurierten Basis-URL erreichbar
- **WHEN** ein Browser die Basis-URL des LLM-Routers aufruft
- **THEN** ist der Seiteninhalt sichtbar und enthält keine `502 Bad Gateway`-Meldung

---

### Requirement: FA-37: workspace-chat Roundtrip
<!-- source: fa-37-workspace-chat.spec.ts -->

The system SHALL process chat completion requests via the LLM router, returning coherent non-empty text responses, and SHALL support streaming mode without server-side errors.

#### Scenario: T1+T2: chat completions return sensible German text (> 30 chars)
- **GIVEN** der LLM-Router ist erreichbar und das Modell `qwen2.5:14b` ist verfügbar
- **WHEN** ein POST-Request an `/v1/chat/completions` mit der deutschen Benutzeranfrage `"Beschreibe die Stadt Hamburg in zwei Sätzen."` gesendet wird
- **THEN** antwortet der Endpunkt mit HTTP 200 und der Antworttext enthält mehr als 30 Zeichen ohne Fehlermeldungen im Inhalt

#### Scenario: Stream mode returns data chunks without 5xx
- **GIVEN** der LLM-Router unterstützt Server-Sent Events und das Modell `qwen2.5:14b` ist verfügbar
- **WHEN** ein POST-Request an `/v1/chat/completions` mit `"stream": true` gesendet wird
- **THEN** antwortet der Endpunkt mit HTTP 200 und liefert den Stream ohne serverseitigen Fehler

#### Scenario: Browser: LLM router base URL is reachable
- **GIVEN** der LLM-Router ist gestartet und unter der konfigurierten Basis-URL erreichbar
- **WHEN** ein Browser die Basis-URL des LLM-Routers aufruft
- **THEN** ist der Seiteninhalt sichtbar und enthält keine `502 Bad Gateway`-Meldung

---

### Requirement: FA-38: Arena game client
<!-- source: fa-38-arena-game-client.spec.ts -->

The system SHALL allow an authenticated admin user to open an Arena lobby, have bot players fill remaining slots automatically, complete a match, and display a results screen with rematch and back controls.

#### Scenario: admin opens lobby → lobby scene renders → bots fill → results screen shown
- **GIVEN** ein Admin-Nutzer mit gültigen `MENTOLDER_ADMIN_USER`- und `MENTOLDER_ADMIN_PW`-Credentials ist vorhanden und die Arena-Admin-Seite ist erreichbar
- **WHEN** der Admin sich einloggt, die Arena-Admin-Seite aufruft, einen Lobby-Button klickt und auf den Spielstart mit automatisch befüllten Bot-Slots wartet
- **THEN** rendert zunächst die Lobby-Szene mit dem Lobby-Code im Titel, danach erscheint der Ergebnisbildschirm mit genau 3 Bot-Labels sowie sichtbaren „Rematch"- und „Back"-Schaltflächen

---

### Requirement: FA-39: Arena DB-Schema und Service-Health
<!-- source: fa-39-arena-db.spec.ts -->

The system SHALL expose a `/healthz` endpoint on the arena server that returns `{"ok": true}` with HTTP 200, and the arena server base URL SHALL be reachable without gateway or internal server errors.

#### Scenario: T2: GET /healthz returns {"ok": true}
- **GIVEN** der Arena-Server ist gestartet und unter `ARENA_WS_URL` erreichbar
- **WHEN** ein GET-Request an `/healthz` gesendet wird
- **THEN** antwortet der Endpunkt mit HTTP 200 und dem JSON-Body `{"ok": true}`

#### Scenario: Browser: arena server base URL is reachable
- **GIVEN** der Arena-Server ist gestartet und unter der konfigurierten HTTP-URL erreichbar
- **WHEN** ein Browser die Basis-URL des Arena-Servers aufruft
- **THEN** ist der Seiteninhalt sichtbar und enthält weder eine `502 Bad Gateway`- noch eine `Internal Server Error`-Meldung

---

### Requirement: FA-54: Coaching-Sessions
<!-- source: fa-54-coaching-sessions.spec.ts -->

The system SHALL enforce authentication on all coaching-session pages and API endpoints, render the session overview and creation form with the correct structure, and provide a 10-step wizard with navigation, field-driven KI button activation, and session meta display.

#### Scenario: T1: /admin/coaching/sessions requires authentication
- **GIVEN** ein nicht authentifizierter Nutzer
- **WHEN** er `/admin/coaching/sessions` aufruft
- **THEN** wird er von der Seite weggelenkt (URL stimmt nicht mit dem Zielpfad überein)

#### Scenario: T2: /admin/coaching/sessions/new requires authentication
- **GIVEN** ein nicht authentifizierter Nutzer
- **WHEN** er `/admin/coaching/sessions/new` aufruft
- **THEN** wird er von der Seite weggelenkt (URL stimmt nicht mit dem Zielpfad überein)

#### Scenario: T3: GET /api/admin/coaching/sessions returns 401 without auth
- **GIVEN** kein gültiger Authentifizierungs-Token
- **WHEN** ein GET-Request an `/api/admin/coaching/sessions` gesendet wird
- **THEN** antwortet der Server mit HTTP 401 oder 403

#### Scenario: T4: POST /api/admin/coaching/sessions returns 401 without auth
- **GIVEN** kein gültiger Authentifizierungs-Token
- **WHEN** ein POST-Request an `/api/admin/coaching/sessions` gesendet wird
- **THEN** antwortet der Server mit HTTP 401 oder 403

<!-- merged from change delta software-factory.md on 2026-07-01 -->

<!-- merged from change delta software-factory.md on 2026-07-02 -->

<!-- merged from change delta software-factory.md (ccd8a2b60bd8) -->

<!-- merged from change delta software-factory.md (49b7f8de6f1f) -->

<!-- merged from change delta software-factory.md (3cef9c1225a1) -->

<!-- merged from change delta software-factory.md (85a753c0b53f) -->

<!-- merged from change delta software-factory.md (3d41d00e010b) -->

<!-- merged from change delta software-factory.md (1c6325b6ab26) -->

<!-- merged from change delta software-factory.md (85c77a003195) -->

<!-- merged from change delta software-factory.md (e9461e82f26c) -->

<!-- merged from change delta software-factory.md (1d652bd2f8cf) -->

<!-- merged from change delta software-factory.md (a6d00028e34a) -->

<!-- merged from change delta software-factory.md (4823a9f37e97) -->

<!-- merged from change delta software-factory.md (974a64c12ca4) -->

<!-- merged from change delta software-factory.md (dc644f760b15) -->

<!-- merged from change delta software-factory.md (cb30709cf41d) -->

<!-- merged from change delta software-factory.md (8796f9d72907) -->

<!-- merged from change delta software-factory.md (2037e622ac8d) -->

<!-- merged from change delta software-factory.md (8ac6cafe9a32) -->

<!-- merged from change delta software-factory.md (0df5d2f19300) -->

<!-- merged from change delta software-factory.md (7fa4daed6311) -->

<!-- merged from change delta software-factory.md (e6fd0834ae76) -->

<!-- merged from change delta software-factory.md (8ed6f8c1bc44) -->

<!-- merged from change delta software-factory.md (fcd09e84e92c) -->

<!-- merged from change delta software-factory.md (d3fa5638cdb8) -->

<!-- merged from change delta software-factory.md (4fb69a20a516) -->

<!-- merged from change delta software-factory.md (a4ecd2161360) -->

<!-- merged from change delta software-factory.md (99f56197f62c) -->

<!-- merged from change delta software-factory.md (4da4d4334551) -->

<!-- merged from change delta software-factory.md (34edcab2a35e) -->