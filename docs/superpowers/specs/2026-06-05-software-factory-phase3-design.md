# Spec: Software Factory — Phase 3 (Full Auto-Pilot)

**Vorhaben-Ticket:** T000413
**Grilling-Ticket:** T000428
**Datum:** 2026-06-05
**Status:** design-approved
**Branch:** feature/software-factory-phase3
**Vorgänger:** P1 (pipeline, #1326) + P2 (dispatcher, #1330) — beide LIVE

> Diese Spec entstand aus einem Grilling (T000428, empfohlene Defaults) + einem Multi-Agent-Design-Panel
> (5 Ground-Truth-Investigations → 3 Architektur-Entwürfe → adversariale Kritik). Das Panel hat **mehrere
> Annahmen des Grillings faktenbelegt widerlegt**; diese Korrekturen sind hier eingearbeitet (Abschnitt 2).

---

## 1. Ziel & Scope

Phase 3 macht die Software Factory zum **Full Auto-Pilot**: Ein neu erstelltes Feature-Ticket
(`type=feature`, `status=backlog`) wird **ohne menschliche Intervention** gescoutet → geplant →
implementiert → gemergt (PR squash) → auf **beide Brands** deployed → live gesmoket; bei Fehler
eskaliert es (`status=blocked`) und benachrichtigt per PushNotification. Der Zustand ist live auf einem
internen Dashboard sichtbar. **Ein reproduzierbarer, autonomer End-to-End-Lauf = Beweis (DoD).**

**In Scope (ganz P3, ein Plan, sequenziert):**
1. Persistenter Dispatcher (ohne offene Session)
2. Event-Trigger auf neue Feature-Tickets
3. Canary-Deploy + Auto-Rollback (Layer 4)
4. Selbst-heilende Retry-Loops
5. Feature-Flags / Dark-Launch
6. Live-Metrik-Dashboard
7. **Adaptive Agent-Provisioning** — ideales Modell · Effort-Profil (ultracode) · passender Kontext pro Subagent
   - Directory-Level-Konflikt-Heuristik
   - Harte Sicherheits-Guards (Querschnitt)

**Out of Scope (bewusst):** echtes Traffic-Splitting-Canary (5/25/100 %); ein dedizierter in-cluster
Dispatcher-Service/Deployment; ein langlebiger LISTEN/NOTIFY-Consumer; Cross-Brand-atomarer Rollback;
groups-Claim-/Realm-Mapper-SSO für das Dashboard; GPU-Embedding-Backfill (bleibt separates, blockiertes
Ticket — P3 ist **GPU-unabhängig**, Scout degradiert sauber ohne Ähnlichkeitssuche).

---

## 2. Faktenbelegte Korrekturen am Grilling (load-bearing)

Das Design-Panel hat folgende Grilling-Annahmen widerlegt. Sie sind in dieser Spec bereits korrigiert:

| # | Grilling-Annahme | Befund (verifiziert) | Korrektur in dieser Spec |
|---|---|---|---|
| **A1** | „CronCreate-Routine (`/schedule`)" als persistenter Dispatcher | **Gebrochen.** CronCreate = lokal/session-gebunden (stirbt mit der REPL); `/schedule`/RemoteTrigger = remote auf claude.ai → **kein Repo-Checkout, kein git-crypt-Key, keine Worktrees, kein fleet-Kubeconfig**. P2 hatte remote bereits verworfen. | **WSL-Host systemd-User-Timer → headless `claude -p`** mit Workflow-Tool. Einziger Locus mit Repo + git-crypt + Kubeconfig + Workflow. **Spike als Task 0** (s. u.). |
| **A2** | Postgres LISTEN/NOTIFY als Trigger | **Nicht konsumierbar.** Die Datenebene ist one-shot `kubectl exec … psql` (`lib.sh:31-35`); LISTEN braucht eine gehaltene Verbindung (Advisory-Lock-Limit bereits in `dispatcher.js:15` dokumentiert). | **Cron-Poll IST der Trigger** (über `schedule.sh`, bereits live). `pg_notify`-Trigger nur als **inerte, dokumentierte Zukunfts-Plumbing** (nicht im kritischen Pfad). |
| **B1** | „`feature-promote.sh` smoke-gate erweitern" | **Nicht wiederverwendbar as-is.** Smoke't **DEV** und gated *Eintritt* zu Prod (Abort-vor-Prod), kein Live-Prod-Smoke, Rollback nur bei Rollout-Status-Fehler; `prod_ctx()` zielt auf **tote Kontexte** `mentolder`/`korczewski`; kennt nur `{website,brett,arena,docs}`. | **Net-new** `observe_prod()` (Live-Prod-Smoke + `rollout undo`), Kontext strikt via `env-resolve.sh → ENV_CONTEXT=fleet`. roll()/smoke-grep-Resolver werden als Bausteine gehoben. |
| **C** | „Retry-Loop erweitern" | **Existiert nicht.** `pipeline.js` hat **null** Retry-Code; „nach 2 Versuchen" (`pipeline.js:319-320`) ist Prosa an einen LLM-Agenten. | Strukturierter ≤2-Loop **neu gebaut**, strikt getrennt vom Verify-HIGH/CRITICAL-Sofort-Block (`:277-289`). |
| **C/Schema** | „`retry_count`-Spalte hinzufügen" genügt | `pipeline.js` fährt **nie rohes SQL** — alles über `ticket.sh`. | Spalte **+** neuer `ticket.sh`-Subcommand. |
| **F** | Directory-Heuristik in den `@>`-Query | `@>` ist exakte Element-Containment, **kein** Prefix. Naiver Prefix **überfeuert** → `schedule.sh:39` (rc=1 = hard skip) **verhungert den 3-Slot-Pool**. | `@>` bleibt Basis; Prefix nur für **geschlossene Allowlist** `{k3d/, prod*, environments/, Taskfile*}`, `website/src/pages/` **hart ausgenommen** (+ Regressions-BATS). |
| **E1** | Dashboard „hinter SSO `/dev-access`-Gruppe" | Website-Session trägt **keinen** groups-Claim; `/dev-access` existiert nur am oauth2-proxy vor *separaten* Pods. | **`isAdmin()`-Username-Allowlist** wiederverwenden (Entscheidung des Users) — Abweichung von der Spec-Formulierung **explizit dokumentiert**. |
| **Both-Brands** | „eine Schema-Änderung erreicht beide Brands" | Jeder Brand hat **eigene** `shared-db`; die Änderung greift erst, wenn **dessen** Website-Image neu deployt; Cross-Brand-Query = ECONNREFUSED (reverted-centralization-Bug). | Jede Schema-Änderung + Verifikation in **beiden** Namespaces (`workspace` + `workspace-korczewski`); **fail-closed** bei Lesefehler. |
| **dispatcher.js:88** | (im Grilling nicht erfasst) | Pipeline-Ergebnisse werden **verworfen**, Fehler von `.catch` (`:105-106`) **geschluckt** → bricht Eskalation + Dashboard-KPI. | Result-Array **einfangen** + an PushNotification/KPI routen. |

---

## 3. Entscheidungen (final)

- **D-PERSIST:** Persistenter Dispatcher = **WSL-Host systemd-User-Timer** (`OnUnitInactiveSec`, re-armt erst
  nach Tick-Ende → bewahrt Single-Flight; `Persistent=true` überlebt Reboot/verpasste Ticks;
  `RuntimeMaxSec` killt hängende Runs) → `wakeup.sh` → **headless `claude -p`** mit Workflow-Tool.
  **Gated durch Task 0 (Spike).** Fallback bei No-Go: lokales `/loop` (bereits geliefert, schwächere Persistenz).
- **D-DASH:** Dashboard-Auth = bestehende **`isAdmin()`-Username-Allowlist** (`PORTAL_ADMIN_USERNAME`). Null
  Realm-Arbeit. Die Abweichung von „/dev-access" ist eine **bewusste, dokumentierte** Entscheidung.
- **Spine:** Safety-first-Entwurf („Inversion of Intelligence") + eingepflanzt: layered reversibility
  (default-OFF-Flag als 1. Rückroll-Schicht), systemd-User-Timer-Primitiv, Spike-first-Ordering,
  geteilte `classify-paths`-Quelle, capture-pre-deploy-revision, infra-minimal-Disziplin (null neue Pods/Ingress).

---

## 4. Querschnitt-Sicherheitsmodell („Inversion of Intelligence")

Der Wakeup-Mechanismus ist **bewusst dumm** (trägt nur die `dry_run`-Policy). **Alle** Gates werden
**pro Tick frisch aus jeder Brand-DB** gelesen, in `dispatcher.js` PREP, **bevor** Pipelines genestet werden:

- **Kill-Switch** (global) + **Daily-Deploy-Cap** + **Per-Ticket „dry-run-first"-Marker** → in neuer Tabelle
  `tickets.factory_control` (`key`, `brand` NULL=global, `value`, `set_by`, `updated_at`), gelesen via
  `guards.sh` (kubectl-exec-psql). Kill-Switch umgelegt ⇒ in ≤10 min wirksam, **kein Redeploy**.
- **Fail-closed:** Lesefehler einer Brand-Control-Tabelle ⇒ `prep.launch=[]` (kein Launch).
- **Layered reversibility:** (1) Feature ist **default-OFF** hinterm Flag (Flag aus = sofort, kein Redeploy)
  → (2) `kubectl rollout undo` auf die **erfasste Pre-Deploy-Revision** → (3) verpflichtender Per-Ticket-Dry-Run vorab.
- **Eskalation niemals still:** PushNotification an **allen vier** Stellen (`pipeline.js` Conflict `:172-174`,
  Verify `:278-289`, Retry-Cap (neu, ersetzt `:319-320`), Canary-Rollback) **plus** ein neuer Dispatcher-Level-
  Notify nach Einfangen des bisher verworfenen `parallel()`-Ergebnisses (`dispatcher.js:88`). PushNotification ist
  ein **deferred Harness-Tool** → nur aus dem Workflow-Runtime (`dispatcher.js`/`pipeline.js`), **nie** aus `.sh`;
  jede Aufrufstelle lädt es zuerst per `ToolSearch select:PushNotification`.

---

## 5. Datenmodell-Erweiterungen

Alle in **einer** Stelle: `initTicketsSchema()` in `website/src/lib/tickets-db.ts`, idempotent
(`CREATE/ALTER … IF NOT EXISTS`), greifen pro Pod-Boot je Brand. **Es gibt keinen SQL-Migration-Runner** —
Auslieferung = Website-Image auf **beide** Brands neu deployen.

```sql
-- (1) retry_count: direkt nach dem pipeline_slot-ALTER (tickets-db.ts:105)
ALTER TABLE tickets.tickets ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;

-- (2) factory_control: globaler Kill-Switch + Daily-Cap + Dry-Run-Marker
CREATE TABLE IF NOT EXISTS tickets.factory_control (
  key        TEXT NOT NULL,
  brand      TEXT,              -- NULL = global
  value      TEXT NOT NULL,
  set_by     TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (key, brand)
);

-- (3) feature_flags: Dark-Launch (tags-brand-FK-Idiom, near tickets.tags :350-363)
CREATE TABLE IF NOT EXISTS tickets.feature_flags (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,  -- exaktes id-Idiom aus tickets.tags spiegeln
  brand      TEXT NOT NULL,           -- FK public.brands via DO-block ADD CONSTRAINT (tags-Idiom)
  key        TEXT NOT NULL,
  enabled    BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  set_by     TEXT,
  UNIQUE (brand, key)
);
```

TS-Helper `isFeatureEnabled(brand, key)` in `tickets-db.ts` (nutzt `pool`), **nicht** in
`systemtest/feature-flag.ts` (Env-Var-Kill-Switch, falsches Zuhause). Views `v_factory_metrics` +
`v_active_features` **existieren bereits** (FA-SF-04) — als Read-Targets nutzen, ggf. um Eskalations-/
Slot-Usage-KPIs **erweitern**, nicht neu schreiben.

Neue `ticket.sh`-Subcommands (Dispatch-Case `scripts/ticket.sh:431-442`, kubectl-exec-psql, **beide** Brands):
`retry-count get|incr|reset`, `factory-control get|set`, `dryrun-mark|dryrun-check`, `feature-flag set|get|list`.

---

## 6. Komponenten (mit konkreten Plug-in-Punkten)

### Phase 0 — Spike (Go/No-Go-Gate, FIRST)
- **`headless-workflow-spike`** — Beweise, dass `claude -p --allowedTools …` das **Workflow-Tool headless**
  freigibt und `workflow({scriptPath:'scripts/factory/pipeline.js'})`-Nesting **ohne Permission-Prompt**
  erlaubt. 0-Agent-`dry_run`-Lauf, der den Dispatcher sauber zurückkehren lässt. **Bevor irgendetwas anderes
  gebaut wird.** No-Go ⇒ Fallback lokales `/loop`, Rest der Spec bleibt gültig.

### Phase 1 — Autonomie-Kern
- **Hard-Guard-PREP-Gate** — `dispatcher.js` PREP (nahe `FACTORY_GLOBAL_CAP=3`, `:64`): Kill-Switch +
  Daily-Cap + Dry-Run-first je Brand via neuer `guards.sh`; bei Auslösung `prep.launch=[]` → bestehender
  Early-Return `:82-84`. NEU `scripts/factory/guards.sh`.
- **Self-healing Retry-Loop** — `pipeline.js` Deploy: Prosa `:319-320` ersetzt durch strukturierten ≤2-Loop;
  `retry_count` via `ticket.sh`; Klassifikation **zwei-gated** (Failure-Class **und** touched_files-Path-Class —
  bei `sql/k3d/environments/realm` ⇒ direkt `blocked`); Per-Retry-Ticket-Kommentar mit diff+log; bei
  `retry_count>=2` ⇒ blocked + PushNotification. Verify-HIGH/CRITICAL (`:277-289`) bleibt **separater** Sofort-Block.
  NEU `scripts/factory/classify-failure.sh`. `retry_count` resettet beim Slot-Claim.
- **Canary + Auto-Rollback (Layer 4)** — NEU `observe_prod()` in `feature-promote.sh` (hebt roll()-`rollout undo`/
  `rollout status` `:212-219` + smoke-grep-Resolver `:160-169`, zielt aber auf **Live-Prod** `web.<brand>.de`
  **nach** set-image, ~5-min-Re-Probe-Loop; Kontext via `env-resolve.sh → ENV_CONTEXT=fleet`, **nie** `prod_ctx()`).
  Aufgerufen aus `pipeline.js` Deploy nach `:333`, **pro Brand**; bei Rot ⇒ `rollout undo` + Flag **OFF** +
  blocked + PushNotification. NEU `tests/e2e/smoke/website.txt` (**nur unauth.** Greps, z. B. `fa-07-/fragebogen`).
  Rollback-Trigger = `rollout status` (readiness `/api/health`) **oder** Live-Smoke rot.
- **Directory-Heuristik** — `conflict-check.sh:110`: `@>`-Prädikat **augmentieren** (nicht ersetzen) in der
  bestehenden `WITH new_files`-CTE: zweiter Zweig `EXISTS (… unnest(t.touched_files) tf WHERE tf LIKE prefix||'%')`
  nur für die Allowlist-VALUES-Liste `{k3d/, prod*, environments/, Taskfile*}`; `website/src/pages/` **ausgeschlossen**.
- **Deploy-Phase-Guards** — `pipeline.js` Deploy vor `:313`/`:321`/`:329`: WORK_BRANCH-Regex `feature/*|fix/*`;
  `git diff --shortstat origin/main...HEAD` > `FACTORY_MAX_DIFF (~800)` ⇒ HARD block; `cd ${REPO}` (MAIN_REPO) +
  explizites `ENV=mentolder|korczewski` (nie bare context). NEU `guards.sh check_diff_size`.
- **Escalation-Routing** — `dispatcher.js:88`: `parallel()`-Return in `const results` einfangen; neuer Post-Launch-
  Step: bei `error`/`status:'blocked'` ⇒ `ToolSearch select:PushNotification` → notify + Eintrag am Vorhaben-Ticket.
- **Adaptive Agent-Provisioning (Modell · Effort · Kontext)** — NEU `scripts/factory/provision.js`
  (Workflow-Runtime-Helper, von `pipeline.js` importiert/inlined): reine Funktion `provision(task) → {model, effort, context}`,
  gespeist von Scouts `complexity`/`risk` + Task-Rolle + Workflow-`budget`. Plug-in: `pipeline.js` Scout setzt
  `complexity`; Plan/Implement/Verify rufen `provision()` **pro gespawntem Agent** und reichen `{model, effort}`
  an `agent(prompt, {model})` bzw. an die Fan-out-Struktur weiter. Formalisiert die „Komplexitäts-Skalierung"
  der Vorgänger-Spec (§3) in echte Logik. Drei Achsen:
  - **Modell (ideal):** `(complexity × Rolle) → Tier`. simple→`haiku` (mechanisch), medium→`sonnet`, complex→`opus`;
    Review/Security/Adversarial-Rollen **immer `opus`** (korrektheits-kritisch); im Zweifel **omit/inherit**
    (Main-Loop-Default, gemäß ultracode-Guidance: Modell nur setzen, wenn man sicher ist).
  - **Effort (ultracode-Profile):** `complexity → Orchestrierungs-Tiefe`. `quick` (1 Implementer + 1-Vote-Verify) /
    `standard` (2–3 parallele Implementer + 1 Review-Pass) / `ultra` (Fan-out-Implementer + **3-Vote-adversariale**
    Verify-Panel + Completeness-Critic + loop-until-dry). Profil wählt sich aus `complexity`/`risk`; die Tiefe
    **skaliert am Workflow-`budget`** (Token-Cap pro Feature) und respektiert den Daily-Deploy-/Kosten-Cap.
  - **Kontext (passend & KOMPAKT):** `buildContext(ticket, task)` montiert: Vorhaben-T000413-Pack
    (Vision/Konventionen/Footguns) + Ticket-Spec/Attachments (`ticket.sh get-attachments`) + `touched_files` +
    relevante Ziel-Code-Auszüge + (**nur bei verfügbarem GPU-Embedding**) pgvector-ähnliche Tickets — **degradiert
    sauber ohne GPU**. **Harte Regel:** Kontext wird **verdichtet** in den Agent-Prompt injiziert, **nie als Roh-JSON-
    Dump** (Lehre aus dem P3-Design-Panel: ein 162k-Zeichen-Prompt ließ den Synth-Agenten scheitern).

### Phase 2 — Trigger / Service
- **Persistenter Dispatcher-Wakeup** — NEU `scripts/factory/wakeup.sh` (`cd` Repo; bei Bedarf
  `task secrets:unlock`; `flock /tmp/factory-tick.lock`; `exec claude -p '<self-contained Dispatcher-Prompt>'`
  mit Workflow-Tool + Permission-Allowlist + `dry_run`-Policy). NEU `scripts/factory/factory.timer` +
  `factory.service` (User-Timer `OnUnitInactiveSec`, `Persistent=true`, `RuntimeMaxSec`) **oder** dokumentierte
  crontab-Zeile. NEU Taskfile-Targets `factory:autopilot:install|uninstall|status`.
- **Event-Trigger** — Kein neuer Consumer: Wakeup-Timer + `schedule.sh`-Queue-Poll **ist** der Cron-Poll-Trigger.
  OPTIONAL inerter `AFTER INSERT … WHERE type='feature'`-`pg_notify`-Trigger in `tickets-db.ts` **mit
  explizitem Kommentar + README-Notiz**, dass er in P3 **nicht** konsumiert wird.

### Phase 3 — Sichtbarkeit (Dashboard + Flags)
- **Feature-Flags / Dark-Launch** — `tickets.feature_flags` + `isFeatureEnabled()` + `ticket.sh feature-flag*`;
  `pipeline.js` Implement/Deploy: Implement-Agenten gaten neues Verhalten hinter `isFeatureEnabled(brand,'<slug>')`
  und seeden eine default-OFF-Zeile beim Merge.
- **Live-Dashboard** — NEU `website/src/pages/api/factory-metrics.ts` (Klon `api/timeline.ts`: `prerender=false`,
  GET; **plus** `getSession` + `isAdmin()`-Gate → 401 wie `api/admin/monitoring.ts`); Helper
  `listFactoryMetrics()/listActiveFeatures()/listActiveFlags()` in `website/src/lib` über den **per-Brand-`pool`**;
  NEU `website/src/pages/dev-status.astro` (server-seitiges Gate `getSession`→`getLoginUrl`, SSR-seed, Island
  `client:load`); NEU `website/src/components/FactoryDashboard.svelte` (KPIs + ~15s-Polling via
  **`LiveCockpit.svelte`**-Muster `onMount(setInterval)/onDestroy(clearInterval)`, **nicht** Timeline-Paging).
  **Beide Brands = gleicher Code, zwei Images**, jeweils eigene `shared-db` (nie cross-namespace).

---

## 7. Testplan

- Erweiterungen an `tests/local/FA-SF-30` (Dispatcher-Struktur-Grep) für neue Guards/Retry-Asserts.
- NEU `FA-SF-3x`: Retry-Loop-Klassifikation, Directory-Heuristik (insb. **Regression: zwei
  `website/src/pages/`-Features bleiben PARALLEL**), Canary/Rollback-Kontrakt, `factory_control`/`feature_flags`-
  Schema (beide Namespaces), Dashboard-Route-Kontrakt (401 ohne Session).
- NEU `provision.js`-Routing-Test (reine Funktion): `(complexity × Rolle) → {model, effort}`-Mapping deterministisch
  (z. B. simple→haiku/quick, complex→opus/ultra, Review-Rolle→opus immer), Budget-Skalierung, GPU-Degradation.
- Jede Test-Ergänzung ⇒ Eintrag in `website/src/data/test-inventory.json` (CI `task test:inventory` diff-gated).
- Spike (Task 0) liefert ein dokumentiertes Beweis-Artefakt (headless Workflow-Nesting Go/No-Go).

---

## 8. Definition of Done (Akzeptanz-Beweis)

Ein **ein** reproduzierbarer 10-min-Tick beweist P3:
1. systemd-Timer feuert `wakeup.sh` → `claude -p` headless → `dispatcher.js` (**keine offene Session nötig**).
2. PREP liest je Brand `factory_control` (Kill-Switch OFF, Daily-Cap nicht erreicht) → pollt Backlog → findet
   das frische `type=feature`-Ticket → Konflikt-Gate (inkl. Directory-Heuristik) + Slot-Claim.
3. `pipeline.js` Scout→…→Deploy: implementiert hinter default-OFF-Flag, Deploy-Guards grün, dry-run-first erfüllt,
   PR squash-merge aus MAIN_REPO mit explizitem `ENV=`, Rollout auf **beide** Brands, `observe_prod()` ~5 min.
4. Status live auf `dev-status` (≤15s). Bei Fehler: `blocked` + PushNotification + Per-Retry-Kommentare; Canary rot
   ⇒ Flag OFF + `rollout undo` auf die erfasste Pre-Deploy-Revision.

---

## 9. Risiken & Mitigationen (aus dem adversarialen Panel)

- **Headless-Workflow unverifiziert (load-bearing):** Der ganze Persistenz-Kern hängt daran, dass `claude -p`
  das Workflow-Tool headless freigibt. ⇒ **Task 0 Spike zuerst**; Fallback lokales `/loop`.
- **Rollback-vs-CI-Build-Race (`:latest`/Digest-Pin):** `build-website*.yml` rollt nach Merge automatisch das neue
  `:latest` → `rollout undo` könnte auf eine RS mit bereits neuem Code zurückrollen. ⇒ **Pre-Deploy-Revision erfassen
  und auf genau diese zurückrollen** **+** default-OFF-Flag als primäre Reversibilität (beide kombiniert).
- **Schema erreicht nur einen Brand:** ⇒ **beide** Namespaces deployen+verifizieren als expliziter DoD-Schritt;
  fail-closed bei Control-Read-Fehler.
- **Directory-Prefix überfeuert → Slot-Pool verhungert:** ⇒ geschlossene Allowlist, `website/src/pages/`-Carve-out,
  Regressions-BATS.
- **Dashboard-Gating-Spec-Mismatch:** ⇒ `isAdmin()` + dokumentierte Abweichung.
- **Live-Prod-Smoke hinter SSO:** ⇒ Canary-Grep **nur** unauth. (eigene `tests/e2e/smoke/website.txt`, nicht der
  built-in-Default mit `.*-auth-setup`).

---

## 10. Verwandte Dokumente & Infrastruktur

- Vorgänger-Spec: `docs/superpowers/specs/2026-06-01-software-factory-design.md` (Abschnitt 7+8 = P3-Roadmap)
- `scripts/factory/` (dispatcher.js, pipeline.js, conflict-check.sh, slots/queue/schedule/watchdog/metrics .sh, lib.sh)
- `website/src/lib/tickets-db.ts` (`initTicketsSchema()`, Views), `scripts/ticket.sh`, `scripts/feature-promote.sh`
- `website/src/components/LiveCockpit.svelte` (Polling-Muster), `website/src/pages/api/timeline.ts` (API-Muster),
  `api/admin/monitoring.ts` (Gate-Muster)
- Tests: `tests/local/FA-SF-*.bats`, `website/src/data/test-inventory.json`
- Panel-Rohmaterial (zur Plan-Erstellung): `/tmp/sf-p3-panel/all.json`
