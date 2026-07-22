---
title: "parallel-partial-plans — Design"
ticket_id: T002074
status: approved
date: 2026-07-22
---

# Design: Parallele Partialplan-Pipeline

> Brainstorm-Ergebnis (Session 2026-07-22, User-approved). Erstanwendung der neuen
> Konvention: Design lebt als `design.md` im Change-Ordner — nicht mehr unter
> `docs/superpowers/specs/`. SSOT-Langzeit-Wahrheit bleibt `openspec/specs/`.

## Kontext & Ziel

`dev-flow-plan` (Claude Code) und `opencode-flow-plan` (opencode) delegieren das
Plan-Schreiben heute an **einen** Subagenten; die Factory zerlegt Pläne erst zur
Laufzeit (`plan:decompose` in `pipeline.js`). Ziel: Die Zerlegung wandert in die
**Plan-Phase** — 1–3 Partialpläne mit disjunkten Dateilisten, jeder Subagent
erhält nur den Kontext, den er für seine Aufgabe braucht. Die Factory startet
die Bearbeitung erst, wenn **alle** Partialpläne einen aktiven Factory-Slot
bekleiden (Gang-Scheduling). Physisches Substrat: Ternary-Bonsai-27B auf
llama.cpp (Windows, `:8093`, `-np 4`, 262k `--kv-unified`).

## Entscheidungen (mit Alternativen)

| # | Entscheidung | Verworfene Alternativen |
|---|---|---|
| 1 | **1 Ticket, 1 Change, 1 Branch/Worktree, 3 Plan-Dateien** (`tasks.d/p1..p3.md`), Ticket claimt atomar N Slots | 3 Sub-Tickets mit batch_id (3 PRs, Cross-Ticket-Atomicity); Laufzeit-Zerlegung (Aufteilung unsichtbar beim Plan-Review) |
| 2 | **Rollen-Rotation im Ticket**: DB-Slots bleiben bis Ticket-Ende gebunden; fertiger Subagent meldet Completion, Server-Kontext wird frei, p3-Tests-Agent rotiert zum Reviewer | Sofortige DB-Freigabe (Brand-Pool mischt zwei Tickets); Hybrid-Freigabe nach Review |
| 3 | **Dynamisch 1–3 Partials, Tests-Partial Pflicht** (letztes Partial = Tests, trägt STRUCT2-Failing-Test, rotiert zur Review-Rolle); Slots geclaimt = N | Immer exakt 3 (künstliche Schnitte); frei nach Subsystem (kein dedizierter Test-Agent) |
| 4 | **Bonsai für Implement + Review** (`provider_config`/`factory_model_slots`: `llamacpp @ :8093`, `max_concurrent=3`); Scout/Plan behalten heutiges Routing | Review auf qwythos/Claude (Modellwechsel verliert p3-KV-Kontext); Claude-Subagenten wie heute (kein lokaler 3-Slot-Bezug) |
| 5 | **`-np 4` Slot-Budget: 3 Worker + 1 Orchestrator** — Orchestrierung (opencode-Hauptsession, Scout/Decompose/Eskalation) läuft auf demselben Modell; Factory-DB-Pool bleibt 3 | `-np 3` (Orchestrator konkurriert mit Workern um Slots) |
| 6 | **SSOT: Design in `openspec/changes/<slug>/design.md`**, kein Doppel unter `docs/superpowers/specs/` mehr (Alt-Bestand bleibt) | Bisheriges Doppel (zwei driftende Wahrheiten) |
| 7 | **Hybrid-Kontext-Transfer**: deterministischer jq-Filter der `intel.json` (typisierte Wahrheit, korrektheitskritisch) + Embedding-Retrieval (`openspec-embed.mjs` → pgvector → `openspec_find_similar`) für narrativen Kontext | Alles per Prompt-Kopie (Kontext-Bloat); alles per Embedding (verlustbehaftet für Typen/Signaturen) |
| 8 | **E2E-Nachweis: synthetisches Mini-Feature** (3 Domänen: API + UI + Tests), echt mergebar | Bestehendes plan_staged-Ticket (echte Arbeit als Versuchskaninchen); Dry-Run (kein Code-Beweis) |

## 1. Plan-Format — `tasks.d/`-Erweiterung

`openspec/changes/<slug>/tasks.md` bleibt Pflicht-Index:

- Frontmatter (F1/F2), H1 `# <slug> — Implementation Plan`, `## File Structure`
  (Union aller Partials), finaler Verify-Task (STRUCT3: `task test:changed`,
  `task freshness:regenerate`, `task freshness:check`).
- **Neu:** `## Partials`-Manifest-Tabelle: Partial-ID, Datei (`tasks.d/pX-*.md`),
  Rolle (`impl` | `tests`), disjunkte `target_files`-Liste, Kontext-Hinweise.

`tasks.d/p1-<name>.md` … `p3-<name>.md`: je eigene Task-Liste, nur eigene
`target_files`. Das **letzte Partial ist immer `tests`** und enthält den
rot→grün-Failing-Test-Step (`expected: FAIL`).

`scripts/plan-lint.sh` — neuer Partial-Modus (aktiv wenn `tasks.d/` existiert):

- Index-Checks (F1/F2/STRUCT1/STRUCT3) auf `tasks.md`; STRUCT2 im Tests-Partial;
  P1/B1a/B1b pro Partial-Datei.
- **Neu D1 (Disjunktheit):** keine Datei in zwei Partials (`validateDisjoint`-
  Logik aus `pipeline-decompose.cjs` als Lint-Regel).
- Degeneriert sauber: ohne `tasks.d/` gilt der heutige Single-Plan-Modus.

## 2. Skill-Änderungen (dev-flow-plan + opencode-flow-plan symmetrisch)

Schritt 3.7 wird zweistufig:

- **(a) Decompose:** Orchestrator erzeugt aus `intel.json` (`impact_files`) das
  Partial-Manifest (1–3 Partials, disjunkte Dateilisten, letztes = Tests).
- **(b) Fan-out:** N parallele Plan-Subagenten. Kontext pro Subagent NUR:
  `proposal.md`, sein Manifest-Eintrag, jq-gefilterte `intel.json`-Ausschnitte
  für seine `target_files` (neuer Helper `scripts/plan-intel-filter.sh`),
  plan-quality-gates-Referenz. Jeder schreibt seine `tasks.d/pX.md`;
  Orchestrator schreibt den `tasks.md`-Index.

Stage: `stage-plan` (ticket.sh + ticket-mcp) bekommt `--partials N` → DB-Feld
für das Gang-Gating. Nach dem Stage: `node scripts/openspec-embed.mjs --slug
<slug>` indiziert den Change nach pgvector (Embedding-Transfer für die
Execute-/Factory-Phase). Branch/Worktree/Commit-Konventionen unverändert
(ein Branch, ein Worktree). `design.md` ersetzt die
`docs/superpowers/specs/`-Spec in beiden Skills; `vda.sh frontmatter` wird auf
`design.md` umgestellt.

## 3. Factory — Gang-Scheduling

- **Schema:** `tickets.tickets` + `slot_count int NOT NULL DEFAULT 1`.
  Slot-Accounting wechselt von Slot-Nummern auf `SUM(slot_count)`
  (`pipeline_slot` bleibt als Marker „hat Slots" erhalten).
- **`slots.sh claim-gang <ext_id> <n>`:** eine atomare SQL-Transaktion —
  claim nur wenn `SUM(slot_count) + n <= FACTORY_SLOTS_PER_BRAND`, sonst
  Exit 1 und **nichts** geclaimt. Damit ist „Start erst, wenn alle
  Partialpläne einen aktiven Slot bekleiden" per Konstruktion erfüllt.
- **`schedule.sh` Head-of-Line-Blocking:** Ist der vorderste Queue-Kandidat
  ein N-Partial-Ticket und sind < N Slots frei, werden KEINE nachrangigen
  Tickets vorgezogen (sonst Gang-Starvation).
- **`pipeline.js`:** liest bei vorhandenem `tasks.d/` die Partials direkt
  (Verallgemeinerung des `batch_mode`-Pfads); der Laufzeit-`plan:decompose`
  bleibt Fallback für Alt-Pläne ohne Partials.

## 4. Subagent-Lifecycle & Rotation

- **Completion:** Jeder Partial-Agent endet mit strukturiertem Ergebnis;
  `record_phase_event` (`implement` / `partial-done`, detail = Partial-ID,
  Dateien, Testergebnis) → sichtbar auf dem Factory-Floor.
- **Kontext-Freigabe:** Server-Slot wird mit Request-Ende frei (llama.cpp);
  zusätzlich `provider_health`-Release über die bestehende
  `route-provider.sh`-Mechanik.
- **Rotation:** Wenn alle Impl-Partials `partial-done` sind, startet der
  Review als Fortsetzung des p3-Agenten: gleicher Prompt-Präfix wie sein
  Test-Lauf (llama-server Prompt-Cache-Hit — der Reviewer kennt die Tests
  wirklich) + Diffs von p1/p2 + Embedding-Abgleich gegen archivierte Changes
  (`openspec_find_similar`).
- Danach Verify → PR-Gate → Auto-Merge → `slot_count` released, Ticket `done`
  (Merge = Abschluss, unverändert).

## 4b. PR-Gate & CI-Babysit-Loop (Orchestrator)

**Faustregel (gilt auch für manuelle Zwischenschritte):** Ein PR wird erst
erstellt, wenn `task test:all && task freshness:check` **lokal grün** sind UND
der Review (rotierter p3-Agent) abgeschlossen ist. Alles davor bleibt
Branch-Push ohne PR.

Ablauf (event-getrieben, ticket-scoped — ergänzt den repo-weiten
`babysit-prs.sh`-Scanner, ersetzt ihn nicht):

1. **Factory → Orchestrator-Signal:** Nach grünem lokalem Verify + Review
   emittiert die Pipeline ein Phase-Event (`verify` / `pr-ready`). Erst dieses
   Event autorisiert die PR-Erstellung.
2. **PR + Automerge-Queue:** Der Orchestrator erstellt den PR (`gh-axi`) und
   queued Auto-Merge (`gh pr merge --squash --auto`).
3. **CI-Watch:** Der Orchestrator überwacht die GitHub-Actions-Checks des PR
   (Actions-API via `gh-axi run/checks`, Polling-Kadenz aus `ci-fix-loop.md`).
4. **Roter Check → Fix-Subagent:** Bei einem fehlschlagenden Check dispatcht
   der Orchestrator einen Fix-Subagenten mit Details (Check-Name, Job-Log-
   Auszug, betroffene Dateien) und **wartet auf dessen Rückkehr**.
5. **Re-Check vor Requeue:** Nach dem Fix prüft der Orchestrator ERNEUT alle
   Checks — weitere inzwischen rot gewordene CIs werden zuerst gefixt
   (zurück zu 4.), bevor Auto-Merge erneut gequeued wird. Kein Requeue mit
   bekannt-rotem Check.
6. Merge → Ticket `done`, `slot_count` released (wie §4).

## 5. Provider-Registrierung + llama.cpp

- **Erledigt (2026-07-22):** `start-bonsai-server.ps1` — Vision Tower
  (`--mmproj`) entfernt, `-c 262144` (voller Pool), `-np 4` (3 Worker +
  1 Orchestrator), Neustart via `powershell.exe`, healthy verifiziert
  (`n_ctx: 262144`).
- **Neu:** `provider_config`/`factory_model_slots`-Registrierung:
  `phase=implement` und `phase=verify`(Review) → `llamacpp @
  http://127.0.0.1:8093/v1`, `max_concurrent=3` (idempotentes Setup-Skript).
- **llama-cpp-Skill:** repo-spezifische Referenz „Bonsai-Server (Windows)":
  Zugriff via `powershell.exe`, Reboot-Skript
  `C:\Users\PatrickKorczewski\.lmstudio\start-bonsai-server.ps1`, Port 8093,
  Health-/Props-Checks, Log-Pfade, Slot-Budget.

## 6. Tests & E2E-Nachweis

- BATS `tests/spec/software-factory.bats`: Gang-Claim-Atomarität (N frei →
  ok; N−1 frei → nichts geclaimt), Release, Head-of-Line-Blocking,
  plan-lint-Partial-Modus inkl. D1-Disjunktheit.
- E2E: synthetisches Mini-Feature (z. B. `/api/factory/parallel-status` +
  /dev-status-Anzeige + Tests) durch den kompletten Durchstich:
  dev-flow-plan → 3 Partials → Gang-Claim → 3 Bonsai-Subagenten →
  Rotation → PR.

## Risiken

- **Bonsai-27B-Implementierqualität** auf echten Factory-Tasks ist unerprobt
  (Q2_0-Quant; Factory-Prompt ~37k). Der E2E-Lauf ist der Testgegenstand.
  Fallback: bestehendes Provider-Routing (Circuit-Breaker → nächster
  Kandidat).
- **kv-unified-Kontention:** 4 gleichzeitig sehr lange Sequenzen drosseln die
  effektive Kontextlänge pro Slot; Slot-Budget-Konvention (3+1) mildert das.
- **Tooling-Abhängigkeiten auf `docs/superpowers/specs/`** (frontmatter-Hook,
  plan-context.sh): Umstellung auf `design.md` muss diese Pfade mitziehen.
