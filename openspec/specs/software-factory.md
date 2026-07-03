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

The system SHALL detect when a live peer agent (identified via `AGENT_LOCK_FAKE_ALIVE` / real session IDs) has in-flight modifications to the same files as the current session. `--staged` prüft staged Files, `--all` zusätzlich unstaged; bei Kollision Exit 1 mit `COLLISION`-Ausgabe und Dateiname; `--quiet` unterdrückt Ausgabezeilen, behält aber den Exit-Code; tote oder eigene Sessions werden ignoriert (fail-open).

#### Scenario: Überlappende Staged-Datei ergibt Kollision
- **GIVEN** Peer-Session 2222 ist als lebendig markiert und hat `shared.txt` in Worktree B modifiziert; Session 1111 staged `shared.txt` in Worktree A
- **WHEN** `agent-collision.sh check --staged` in Worktree A ausgeführt wird
- **THEN** Exit 1; Ausgabe enthält `COLLISION` und `shared.txt`; `--quiet` gibt Exit 1 ohne Ausgabe

#### Scenario: Tote Session und fehlender Worktree sind fail-open
- **GIVEN** Peer-Session 2222 ist NICHT in `AGENT_LOCK_FAKE_ALIVE` (tot); oder Peer-Worktree-Pfad existiert nicht mehr
- **WHEN** `agent-collision.sh check --staged` ausgeführt wird
- **THEN** Exit 0 in beiden Fällen; eigene SID (1111) als Peer-Claim ergibt ebenfalls Exit 0 (keine Selbst-Kollision)

---

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

The system SHALL create Git worktrees via `scripts/worktree-create.sh` that bypass the `git-crypt` smudge/clean filter failure (which causes plain `git worktree add` to exit 128) by neutralizing `filter.git-crypt.clean=cat` und `filter.git-crypt.required=false` im per-Worktree-Config, sodass Commits und Follow-up-git-Ops gelingen. Bei vorhandenem Key werden Secrets entschlüsselt; ohne Key bleibt der Worktree benutzbar. `node_modules` werden per Symlink aus dem Basis-Checkout bereitgestellt wenn vorhanden.

#### Scenario: Entschlüsselter Worktree im unlocked Repo
- **GIVEN** das Haupt-Checkout hat einen gültigen git-crypt Key unter `.git/git-crypt/keys/default`
- **WHEN** `worktree-create.sh feature/x <path> HEAD` ausgeführt wird
- **THEN** Exit 0; `<path>/secret/data.yaml` enthält den entschlüsselten Wert; `git status` im Worktree gibt Exit 0; `filter.git-crypt.clean=cat` und `filter.git-crypt.required=false` sind im Worktree-Config gesetzt

#### Scenario: Locked Repo und node_modules Provisioning
- **GIVEN** kein Key vorhanden (gesperrtes Repo); Basis-Checkout hat `node_modules/cheerio/`
- **WHEN** `worktree-create.sh fix/z <path> HEAD` ausgeführt wird
- **THEN** Exit 0; Worktree ist benutzbar (`git status` Exit 0); `node_modules/cheerio/package.json` ist über Symlink erreichbar; fehlendes `node_modules` im Basis-Checkout führt zu keinem Fehler

---

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
- **GIVEN** `ci.yml` mit Scope-Allowlist `website, admin, db, ops, factory`
- **WHEN** `preflight-pr-scope.sh "feat(admin): add dashboard" <ci.yml>` aufgerufen wird
- **THEN** Exit 0; Titel ohne Scope (`"docs: update readme"`) gibt ebenfalls Exit 0 mit `"no scope"`-Meldung

#### Scenario: Ungültiger Scope und fehlende Workflow-Datei
- **GIVEN** Scope `cockpit` ist nicht in der Allowlist; oder `ci.yml` existiert nicht
- **WHEN** `preflight-pr-scope.sh "feat(cockpit): add view" <ci.yml>` bzw. mit ungültigem Pfad aufgerufen wird
- **THEN** ungültiger Scope gibt Exit non-0 mit `"NOT in the semantic-PR allowlist"` und listet gültige Scopes; fehlende Workflow-Datei gibt Exit 2; Breaking-Change `!` bei gültigem Scope gibt Exit 0

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

#### Scenario: Zombie-Lock durch abgebrochenen Worktree

- **GIVEN** Session C wurde abrupt beendet und hält einen Lock auf Branch `feature/dead`; der zugehörige Worktree `/tmp/wt-dead` existiert nicht mehr
- **WHEN** `bash scripts/agent-lock.sh reap` zu Skill-Start aufgerufen wird
- **THEN** der verwaiste Lock wird entfernt; `bash scripts/agent-lock.sh list` zeigt keinen Eintrag mehr für `feature/dead`; der Worktree-Eintrag wird via `git worktree prune` bereinigt

#### Scenario: Reap schlägt still fehl ohne Session-Abbruch

- **GIVEN** der Reap-Aufruf trifft auf einen Berechtigungsfehler oder ein kaputtes Lock-Verzeichnis
- **WHEN** `bash scripts/agent-lock.sh reap 2>/dev/null || true` in einem SessionStart-Hook ausgeführt wird
- **THEN** der Hook gibt Exit 0 zurück; die Session startet normal; kein Fehler bricht den Workflow ab

---

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

The system SHALL demonstrate technical feasibility by being reachable via HTTP/S for Keycloak, the main website, and Vaultwarden, and the website SHALL render without server-side errors.

#### Scenario: T3a: Keycloak ist erreichbar
- **GIVEN** ein Keycloak-Dienst ist unter der konfigurierten URL betrieben
- **WHEN** eine HTTP-GET-Anfrage an die Keycloak-URL gestellt wird
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

#### Scenario: T3e: Im Browser — Keycloak-Login-Seite rendert
- **GIVEN** Keycloak ist erreichbar und der Realm „workspace" ist konfiguriert
- **WHEN** die Keycloak-Account-Seite im Browser aufgerufen wird
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
- **THEN** erfolgt eine Weiterleitung weg von `/admin/app-catalog` (z. B. zur Login- oder Keycloak-Seite)

#### Scenario: T2: /admin/app-catalog page loads and renders catalog for authenticated admins
- **GIVEN** ein authentifizierter Administrator ist eingeloggt
- **WHEN** `/admin/app-catalog` aufgerufen wird
- **THEN** wird die Seite mit der Überschrift „App-Katalog" gerendert, die Whiteboard-Karte ist sichtbar, ein Klick auf „Details anzeigen" öffnet ein Modal mit dem Titel „Whiteboard — Installationsanleitung", und „Schließen" schließt das Modal

---

### Requirement: Arena Mentolder Auth Setup
<!-- source: arena-mentolder-auth-setup.spec.ts -->

The system SHALL support OIDC-based authentication for the Arena service via Keycloak so that a persistent browser session can be saved for subsequent test runs.

#### Scenario: authenticate mentolder arena admin
- **GIVEN** die Umgebungsvariable `E2E_ADMIN_PASS` ist gesetzt und der Arena-Server ist erreichbar
- **WHEN** ein Login über Keycloak für den Arena-Admin-Nutzer durchgeführt wird
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

#### Scenario: Brett redirects unauthenticated users to Keycloak
- **GIVEN** ein Browser ohne Auth-State (kein eingeloggter Nutzer)
- **WHEN** die Brett-URL direkt aufgerufen wird
- **THEN** wird der Browser zur Keycloak-Auth-URL (`auth.` oder `realms/workspace`) weitergeleitet

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

The system SHALL authenticate users against brett.mentolder.de via Keycloak OIDC (oauth2-proxy) and persist a valid session state for subsequent test runs.

#### Scenario: authenticate mentolder brett admin
- **GIVEN** der Brett-Healthcheck-Endpunkt ist erreichbar und gültige Admin-Zugangsdaten sind vorhanden
- **WHEN** der Admin-Benutzer sich über den Keycloak-OIDC-Flow einloggt
- **THEN** gibt `/healthz` den HTTP-Status 200 zurück und der Session-State wird als JSON-Datei gespeichert

---

### Requirement: Brett Mobile (Android)
<!-- source: brett-mobile.spec.ts -->

The system SHALL render the Brett 3D board correctly on mobile viewports, handle touch events without errors, and enforce OAuth2 authentication for unauthenticated mobile users.

#### Scenario: T1: unauthenticated visit redirects to Keycloak
- **GIVEN** ein unauthentifizierter Browser ohne gespeicherten Session-State
- **WHEN** die Brett-URL direkt aufgerufen wird
- **THEN** wird der Nutzer zu einer Keycloak-Authentifizierungsseite weitergeleitet (URL enthält `auth.` oder `realms/workspace`)

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
- **THEN** ist ein Talk-, Login- oder Keycloak-Authentifizierungselement auf der Seite sichtbar

#### Scenario: T4: HPB Signaling-Server erreichbar
- **GIVEN** die Signaling-Server-URL ist konfiguriert und der NATS-Backend-Dienst ist verfügbar
- **WHEN** ein GET-Request an `/api/v1/welcome` des Signaling-Servers gesendet wird
- **THEN** antwortet der Server mit HTTP 200 und die JSON-Antwort enthält das Feld `version`

#### Scenario: T5: Talk-Link ohne Login aufrufbar (Gast)
- **GIVEN** ein unauthentifizierter Browser und die Nextcloud-URL ist konfiguriert
- **WHEN** `/apps/spreed` (oder `/index.php/apps/spreed`) aufgerufen wird
- **THEN** wird eine Login-Seite oder ein Keycloak-Authentifizierungsformular angezeigt, was bestätigt dass die URL erreichbar und korrekt behandelt wird

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

The system SHALL protect all client management API endpoints behind admin authentication and provide SSO-based login by redirecting to Keycloak.

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

#### Scenario: T6: /api/auth/login redirects to Keycloak (SSO)
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
- **THEN** enthält die Seite weder den Text „Internal Server Error" noch „500" (Weiterleitung zu Keycloak ist zulässig)

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

The system SHALL implement OIDC-based authentication for the website by redirecting login requests to Keycloak, exposing a session status endpoint, and displaying the correct navigation elements based on authentication state.

#### Scenario: T1: /api/auth/login redirects to Keycloak
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

The system SHALL host a functioning Vaultwarden instance that serves its login UI, provides an email input field, exposes an SSO login button for Keycloak integration, and responds to its health endpoint with HTTP 200.

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