# software-factory

<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-06-20 -->

Die Software Factory ist ein autonomes, mehrstufiges Pipeline-System, das Feature-Tickets
vom Backlog bis zum Production-Deploy verarbeitet. Sie besteht aus drei Kernkomponenten:
dem **Dispatcher** (Queue-Poll, Slot-Management, Tick-Orchestrierung), der **Pipeline**
(6-Phasen Scout→Design→Plan→Implement→Verify→Deploy pro Feature) und dem **Watchdog**
(Stale-Eskalation, Slot-Freigabe, Zombie-Cleanup). Der Autopilot läuft als systemd-USER-Timer
auf dem WSL-Host ohne offene Claude-Code-Session.

---

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

The system SHALL per Tick den Backlog per Brand pollen, freie Slots ermitteln und Features
atomar in den Status `in_progress` mit gesetztem `pipeline_slot` überführen. Ein Claim
gelingt nur, wenn `pipeline_slot IS NULL` und `status IN ('backlog','triage')` — Race-safe.

#### Scenario: Feature aus dem Backlog schedulen
- **GIVEN** Brand `mentolder` hat Slot 2 von 3 frei und Ticket T000500 im Status `backlog`
- **WHEN** der Dispatcher `schedule.sh` aufruft
- **THEN** T000500 erhält `pipeline_slot=2` und `status=in_progress`; das UPDATE liefert die Slot-Nummer zurück

#### Scenario: Alle Slots belegt
- **GIVEN** alle `FACTORY_SLOTS_PER_BRAND` (Default 3) Slots sind mit `in_progress`-Features belegt
- **WHEN** der Dispatcher `slots.sh next` aufruft
- **THEN** `slots.sh next` gibt eine leere Ausgabe zurück; kein neues Feature wird gestartet

---

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

The system SHALL pro Tick stale `in_progress`-Features (kein `updated_at`-Update seit
`FACTORY_STALE_MIN` Minuten, Default 30) zurück auf `triage` setzen, den Slot freigeben
und den verwaisten Worktree entfernen. `awaiting_deploy`-Features ohne Deployment seit
`FACTORY_AD_STALE_H` Stunden (Default 24) werden mit `attention_mode=needs_human`
markiert und erhalten einen Warn-Kommentar.

#### Scenario: Hung Pipeline (kein Phase-Heartbeat)
- **GIVEN** Ticket T000503 ist seit 35 Minuten `in_progress` ohne `ticket.sh touch`-Update
- **WHEN** `watchdog.sh` ausgeführt wird (FACTORY_STALE_MIN=30)
- **THEN** T000503 erhält `status=triage`; `pipeline_slot=NULL`; ein Kommentar wird hinzugefügt; der Worktree `/tmp/wt-sf-t000503` wird entfernt

#### Scenario: Stale awaiting_deploy
- **GIVEN** Ticket T000504 ist seit 26 Stunden im Status `awaiting_deploy`
- **WHEN** `watchdog.sh` ausgeführt wird (FACTORY_AD_STALE_H=24)
- **THEN** T000504 erhält `attention_mode=needs_human` und einen Warn-Kommentar; der Status bleibt `awaiting_deploy`

---

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
