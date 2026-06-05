# Spec: Software Factory — Phase 2 (Dispatcher / Tier 1)

**Vorhaben-Ticket:** T000413 (Metrik-Sink) · **Vorgänger:** Phase 1 (T000420, PR #1326)
**Datum:** 2026-06-05
**Status:** design-approved
**Branch:** `feature/sf-dispatcher`

---

## 1. Vision & Kontext

Phase 1 ("Augmented Single-Feature", T000420/#1326) lieferte das Fundament: das lauffähige 6-Phasen-`pipeline.js`-Workflow-Script (Scout → Design → Plan → Implement → Verify → Deploy), die brand-aware `conflict-check.sh` (file-level Overlap), die `findSimilarTickets`-Suche, sowie das DB-Schema (`touched_files`, `pipeline_slot`, `ticket_embeddings` + HNSW, `fn_find_similar`, `v_factory_metrics`, `v_active_features`).

**Phase 2 baut Tier 1 — den Dispatcher.** Er macht aus dem manuell-invokierten Single-Feature-Lauf eine **autonome, wiederkehrende Multi-Feature-Orchestrierung**: er pollt die Feature-Queue, analysiert Konflikte, weist Slots zu, startet Pipelines parallel, überwacht ihre Liveness und schreibt Metriken — ohne menschliche Intervention im Happy Path.

P2 **erfindet nichts neu**; es **verdrahtet** die P1-Primitiven zu einem Loop. Die Spec dieses Loops war in `2026-06-01-software-factory-design.md` §4 bereits skizziert; dieses Dokument legt die konkreten, in der Planung getroffenen Entscheidungen fest.

### Grundsatz-Entscheidungen (in der Planung gelockt)

| Achse | Entscheidung | Begründung |
|---|---|---|
| **Launch-Topologie** | **Modell A** — ein Dispatcher-Workflow nestet die Pipelines via `workflow('pipeline', …)` | Wörtliche „Dispatcher-as-Workflow"-Lesart; eine Metrik-Sicht, in-process Koordination |
| **Trigger** | **`/loop` self-paced** (`ScheduleWakeup`), lokal, + `pg_advisory_lock` Single-Flight | Re-armt sich jeden Zyklus (kein CronCreate-3-Tage-Ablauf); natürliche Überlappungsfreiheit (Wake erst nach Run-Ende); Pipelines brauchen lokale Worktrees + Fleet-Kubeconfig (Remote-Routine scheidet aus) |
| **Slots** | **Per-Brand-Pools (je 3) + globaler Gesamt-Deckel (start 3)** | `pipeline_slot` lebt physisch je Brand-DB; `conflict-check` ist strukturell per-brand; Deckel schützt den geteilten Modell-A-Agent-Cap |
| **Watchdog-Signal** | **`updated_at`-Sweep + Phasengrenzen-Progress-Writes** | `fn_lifecycle_ts`-Trigger bumpt `updated_at` bei jedem Row-Write gratis → Heartbeat-Semantik ohne Schema-Änderung auf beiden Brands |
| **Layer-4 Canary** | **Auf P3 verschoben** | Spec §7 + `pipeline.js:25-27` markieren es als P2-out-of-scope; `feature:promote` hat Smoke+Rollback bereits auf Deploy-Ebene |
| **Test-Seeding** | **`factory-test-fixtures.sh` + `is_test_data=true` + `SF-TEST-`-Prefix + `fn_purge_test_data()`** | Folgt dem bestehenden Purge-Muster; keine neue Test-Infra |
| **Semantische Suche** | **Fail-soft beibehalten; `embedTicket`-Wiring + Backfill = eigenes Follow-up** | GPU-Host down → Embeddings leer; Dispatcher-Kern (touched_files-Overlap) ist GPU-unabhängig |

---

## 2. Architektur

Der Dispatcher ist **ein Workflow-Run pro Tick** (Modell A), getrieben durch `/loop` self-paced. Wegen des **1000-Agent-Lifetime-Caps pro Run** ist er **kein ewiger Einzel-Run**, sondern ein frischer, gebundener Run je Tick.

```
/loop wake ──▶ [pg_advisory_lock frei?] ──nein──▶ no-op exit (anderer Run aktiv)
                     │ ja
                     ▼
        dispatcher.js  (Modell-A Workflow, 1 Run/Tick)
          ① PREP-Agent  (1 Agent, deterministisch, schema-validierter Output):
                watchdog.sh → stale-sweep (updated_at>30min) + eskaliere + Slot freigeben
                queue.sh    → v_active_features je Brand (Prio→FIFO)
                schedule.sh → conflict-check (file-level) + atomarer Slot-Claim
                └─▶ LAUNCH-PLAN: [{brand, external_id, slug, slot}], ≤ Gesamt-Deckel
          ② LAUNCH       parallel( plan.map(f => () => workflow('pipeline', f)) )
          ③ METRICS-Agent  metrics.sh → Markdown-Kommentar an T000413
                     │
                     ▼  (Run kehrt zurück; der äußere /loop-Turn ruft)
        ScheduleWakeup(1200s)  ← erst NACH Run-Ende → natürliche Single-Flight
```

### Warum PREP gebündelt ist (kein literal-phasenweiser POLL/CONFLICT/SCHEDULE)

Workflow-Scripts haben **kein direktes Bash** — nur `agent()`/`parallel()`/`pipeline()`/`workflow()`. Deterministische bash-Primitiven müssen von einem Agenten ausgeführt werden. Statt pro SQL-Query einen Agenten zu verbrennen (Agent-Cap-Druck + Latenz), bündelt **ein PREP-Agent** `watchdog.sh`+`queue.sh`+`schedule.sh` und gibt den fertigen, schema-validierten Launch-Plan zurück. Agent-Ökonomie pro Run: **1 PREP + N Pipeline-Sub-Workflows + 1 METRICS**.

### Warum MONITOR nicht in-process ist

Das Workflow-Harness bietet **kein Timeout-Primitiv** für `await`. Eine hängende Pipeline würde ein in-process `MONITOR` (und damit den ganzen Dispatcher-Run) blockieren. Stattdessen ist der Watchdog ein **DB-Poll-Sweep zu Beginn des *nächsten* Runs** (im PREP-Agenten): er findet in-flight Features aus früheren Runs, die `updated_at > 30min` stale sind, und eskaliert sie. Das ist robust gegen hängende Pipelines und passt zur `/loop`-Kadenz.

### Modell-A-Konsequenz: geteilte Ressourcen

Per `workflow()` genestete Kinder **teilen sich** den Concurrency-Cap (`min(16, cores-2)`), das Token-Budget und das 1000-Agent-Lifetime-Limit des Parents (Workflow-Tool-Semantik). Deshalb: **globaler Gesamt-Deckel** auf gleichzeitige Pipelines (start: 3), unabhängig davon, dass jeder Brand nominell 3 Slots hat. „3 Slots/Brand" ist die *Buchhaltungs*-Obergrenze je Brand; der *globale Deckel* ist die physische Concurrency-Grenze.

---

## 3. Komponenten & Verträge

Jede Einheit hat einen klaren Zweck, kommuniziert über JSON/Exit-Codes und ist isoliert testbar.

### 3.1 `scripts/ticket.sh` (erweitern) — **zuerst**

Neue Subcommands (das CLI hat heute nur `create`, `update-status`, `add-comment`, `archive-plan`, `get-attachments`):

- **`get --id <external_id>`** → JSON eines Tickets (für Dispatcher-State-Reads). Niemals `ticket_plans.content` selektieren.
- **`set-touched-files --id <external_id> --files <csv>`** → schreibt `tickets.touched_files`. **Fixt einen latenten P1-Bug:** `pipeline.js:113` ruft `set-touched-files` bereits auf, aber das Subcommand existiert nicht (Scout→touched_files-Pfad heute stumm gebrochen).
- **`set-pipeline-slot --id <external_id> --slot <int|null>`** und **`release-slot --id <external_id>`** → Slot-Verwaltung.
- **`--is-test-data` Flag** auf `create` → setzt `is_test_data=true` für purge-fähige Test-Tickets.

Alle neuen Pfade nutzen das bestehende advisory-lock-Muster des CLI und respektieren `WORKSPACE_NAMESPACE`/`BRAND`.

### 3.2 `scripts/factory/slots.sh` (neu)

Slot-Buchhaltung gegen `tickets.tickets.pipeline_slot`. Subcommands: `claim <brand>` (atomares `UPDATE … SET pipeline_slot=<n>, status='in_progress' WHERE external_id=… AND pipeline_slot IS NULL RETURNING` — race-frei ohne expliziten Lock), `release <external_id>`, `count <brand>` (belegte Slots je Brand), `count-global` (Summe über beide Brands gegen den Gesamt-Deckel). Env: `BRAND`→ns (wie `conflict-check.sh`), `FACTORY_CTX`, `FACTORY_DRY_RESOLVE`.

### 3.3 `scripts/factory/queue.sh` (neu)

Pollt `v_active_features` **je Brand** und gibt schedulebare `backlog`-Features als JSON aus (geordnet Prio `hoch→mittel→niedrig`, dann `created_at` — die View liefert das bereits). **Erster Konsument** von `v_active_features`. Read-only (nur Metadaten-Spalten, nie `content`).

### 3.4 `scripts/factory/schedule.sh` (neu)

Je Kandidat aus `queue.sh`: ruft `BRAND=<brand> conflict-check.sh <external_id> <touched_files…>` (file-level, brand-aware, **unverändert** aus P1). Bei Exit 0 (kein Konflikt) **und** freiem Slot (per-Brand-Pool **und** globaler Deckel nicht erreicht) → `slots.sh claim`. Gibt den **Launch-Plan** aus: `[{brand, external_id, slug, slot}]`. Konfliktierende/slot-lose Kandidaten bleiben `backlog`.

### 3.5 `scripts/factory/watchdog.sh` (neu)

Sweep über `v_active_features` WHERE `status='in_progress' AND updated_at < now() - interval '30 min'` (Schwelle aus Spec §4, konfigurierbar). Pro Treffer: Eskalation gemäß §4 (Status setzen, Kommentar mit Kontext, Slot via `release-slot` freigeben). Läuft **je Brand**.

### 3.6 `scripts/factory/metrics.sh` (neu)

Liest `v_factory_metrics` (+ optional `v_active_features`), formatiert eine Markdown-Zusammenfassung (features_shipped/Tag, avg_cycle_time_h, Eskalationen, aktive Slots) und schreibt sie via `ticket.sh add-comment --id T000413`. **Erster Konsument** von `v_factory_metrics`. Läuft je Brand, eine konsolidierte Sicht.

### 3.7 `scripts/factory/dispatcher.js` (neu)

Der Modell-A-Workflow. `export const meta` mit Phasen `Prep`/`Launch`/`Metrics`. PREP-Agent führt watchdog→queue→schedule aus und gibt den schema-validierten Launch-Plan zurück; LAUNCH = `parallel(plan.map(f => () => workflow(<pipeline-ref>, f)))`; METRICS-Agent führt `metrics.sh` aus. **Resume-safe:** nutzt `args.timestamp`, **kein** `Date.now()`/`Math.random()`. Wird vom Workflow-Tool ausgeführt, **nicht** `node`.

> **`<pipeline-ref>` muss in der Plan-Phase geklärt werden:** `workflow(name)` löst nur **registrierte** Workflows auf (Registry = `.claude/workflows/`), aber dieses Verzeichnis **existiert heute nicht** (Recon-Befund). Zwei Wege: (a) `pipeline.js` als benannten Workflow in `.claude/workflows/` registrieren und per Name referenzieren, **oder** (b) direkt `workflow({scriptPath: 'scripts/factory/pipeline.js'}, f)` aufrufen. **(b) ist der defaultlose, robustere Weg** (keine neue Registry-Konvention) und wird empfohlen, sofern der Plan nichts dagegen findet.

### 3.8 `scripts/factory/pipeline.js` (modifizieren)

An jeder Phasengrenze (Scout→Design→…→Deploy) ein leichter Progress-Write via `ticket.sh` (Status-Touch / kurzer Kommentar) → `fn_lifecycle_ts` bumpt `updated_at` gratis → echte Pipeline-Liveness für den Watchdog ohne Schema-Änderung. Keine sonstige Verhaltensänderung an P1.

### 3.9 `Taskfile.factory.yml` (erweitern)

Neuer Task `factory:dispatch`: dokumentiert die Invocation von `dispatcher.js` via `/loop` + Workflow-Tool (analog zum bestehenden `factory:run`). Reiner Doku-/Lint-Task — der Dispatcher läuft über das Harness, nicht über `node`.

---

## 4. Daten- & State-Modell

- **Status-Übergänge:** `backlog` →(Slot-Claim, atomar)→ `in_progress` →(Verify-Phase)→ `in_review` →(Deploy)→ `done` · Eskalation → `blocked` · Crash/Timeout → `triage` (zurück in Queue, Slot frei).
- **`pipeline_slot`:** gesetzt beim Claim, geleert bei Completion/Eskalation. **Per-Brand-Pool** (1..3 je Brand-DB). **Globaler Deckel** (start 3) gegen Modell-A-Cap-Übersubscription; tunebar über eine ENV/Konstante.
- **Locks:** `pg_advisory_lock(<dispatcher_key>)` für Dispatcher-Single-Flight (belt-and-suspenders über der natürlichen `/loop`-Single-Flight). Slot-Claim braucht **keinen** expliziten Lock — das atomare conditional `UPDATE … WHERE pipeline_slot IS NULL` serialisiert konkurrierende Claims race-frei.
- **Brand-Isolation:** Jeder Brand hat eine **eigene** `shared-db` (ns `workspace` / `workspace-korczewski`). Es gibt **keine** Cross-DB-Koordination; der Dispatcher iteriert beide Brands sequenziell innerhalb eines Runs, hält aber eine konsolidierte Metrik-Sicht.

---

## 5. Fehlerbehandlung & Eskalation (Spec §4)

| Fall | Aktion |
|---|---|
| Test-Fail nach 2 Retries (in `pipeline.js`) | Ticket → `blocked` + Kommentar mit Fehlerlog |
| Merge-Konflikt nicht auflösbar | Ticket → `blocked` + Diff |
| Pipeline-Crash / Session-Timeout | Ticket → `triage` (zurück in Queue), Slot via `release-slot` frei |
| Watchdog: stale > 30min | Eskalation wie Crash (triage + Slot frei + Kommentar) |
| HIGH/CRITICAL Review-Finding (Verify, P1) | Ticket → `blocked` + Eskalation an Mensch |
| `conflict-check` Overlap | Kandidat bleibt `backlog`, kein Slot-Claim (sequenziert sich von selbst) |

---

## 6. Testing

Drei-Schichten-Split (wie P1) bleibt erhalten:

1. **Offline-Logik** (`slots.sh`/`queue.sh`/`schedule.sh`/`dispatcher.js`-Kontrakt): gegen Mocks + `FACTORY_DRY_RESOLVE`, kein Cluster. `dispatcher.js` per `node --check` + grep-Kontrakt (analog FA-SF-20: Phasen vorhanden, `args.timestamp`, kein `Date.now`/`Math.random`, `workflow('software-factory-pipeline'`).
2. **Live-Read** (`watchdog.sh`-Sweep, Schema-Parität beider Brands): `kubectl exec`+psql gegen Fleet, `FACTORY_NS` überschreibbar.
3. **Seed** (slot-claim, queue-order, watchdog-eskalation, die echte Rows brauchen): neue **`tests/lib/factory-test-fixtures.sh`** mit `seed_test_feature()` → `ticket.sh create --is-test-data --title 'SF-TEST-…'`; Teardown via bestehende `fn_purge_test_data()` (löscht `is_test_data=true`).

**Parallel-Seed-Kollision:** Factory-BATS **seriell gepinnt** (`JOBS=1`) **oder** disjunkte synthetische Pfade je Test, damit `conflict-check` nicht legitim zwischen Test-Features Konflikt meldet. Neue IDs (`FA-SF-NN`) in `test-inventory.json` registriert (CI-diff-gated via `task test:inventory`).

---

## 7. Scope

**In Scope (P2):** Dispatcher-Loop (`dispatcher.js`), bash-Primitiven (slots/queue/schedule/watchdog/metrics), `ticket.sh`-Erweiterung (get/set-touched-files/set-pipeline-slot/release-slot/--is-test-data), `pipeline.js`-Progress-Writes, per-Brand-Slots + globaler Deckel, `updated_at`-Watchdog, `/loop`-Trigger + advisory-lock Single-Flight, Metriken an T000413, FA-SF-Tests + Fixtures, Doku.

**Out of Scope (P3):** Layer-4 Canary-Smoke + Auto-Rollback · Verzeichnis-Level-Konflikt-Heuristik (`conflict-check` bleibt file-level) · semantisches Dedup-Gate · `embedTicket`-Verdrahtung in `ticket.sh create` + Backfill (GPU down → eigenes Follow-up; Scout bleibt fail-soft `[]`) · Event/Webhook-Trigger · dediziertes Dispatcher-Deployment · Live-Dashboard.

---

## 8. Bekannte Risiken & Gaps (aus Recon)

1. **Geteilter Modell-A-Cap** — N Pipelines + Agenten teilen `min(16,cores-2)`. Mitigiert durch globalen Gesamt-Deckel (start 3, tunebar).
2. **Latenter P1-Bug** — `pipeline.js:113` ruft `ticket.sh set-touched-files`, das nicht existiert. **Erste P2-Task fixt das.**
3. **`ticket_embeddings` leer + GPU down** — Scout-Semantik bleibt fail-soft (`[]`); Dispatcher-Kern GPU-unabhängig. Wiring/Backfill = Follow-up.
4. **Dual-Brand-Schema-Parität** — vor Launch verifizieren, dass die Factory-Objekte auf **beiden** `shared-db` (workspace + workspace-korczewski) live sind (idempotenter Website-Boot-Init).
5. **Slot-Doppelzuweisung** — durch atomares conditional `UPDATE` (nicht durch Lese-dann-Schreib) ausgeschlossen.
6. **`/loop` session-gebunden** — endet die Session, schläft der Loop bis zum manuellen Neustart. Akzeptiert für P2; daemon-hafter Trigger ist P3.
7. **Stale `feature/sf-dispatcher`-Annahmen** — P2 startet frisch von `origin/main` (verifiziert: Worktree von `origin/main` angelegt).
8. **`workflow()`-Referenz auf `pipeline.js`** — kein `.claude/workflows/`-Registry vorhanden; Plan klärt Name-Registrierung vs. `{scriptPath}` (Empfehlung: `{scriptPath}`, s. §3.7). Verifizieren, dass ein per `{scriptPath}` genesteter Workflow korrekt als ein-Level-Kind läuft.

---

## 9. Verwandte Specs & Infrastruktur

- `docs/superpowers/specs/2026-06-01-software-factory-design.md` — Gesamt-Spec (§4 Dispatcher-Loop, §5 Views, §6/§7 Layer-4/Phasen)
- `docs/superpowers/plans/2026-06-05-software-factory-phase1.md` — P1-Plan (T000420), out-of-scope-Liste = dieser P2-Scope
- `scripts/factory/pipeline.js`, `scripts/factory/conflict-check.sh`, `scripts/ticket.sh` — P1-Primitiven
- `website/src/lib/tickets-db.ts` — Schema (`pipeline_slot`, `v_active_features`, `v_factory_metrics`, `fn_lifecycle_ts`-Trigger)
- `tests/local/FA-SF-*.bats` + `scripts/build-test-inventory.sh` — Test-Inventar-Muster
- `/loop` Skill (`ScheduleWakeup`) + Workflow-Tool (`workflow()`-Nesting: ein Level, geteilter Cap/Budget)
