---
title: "factory-muse-spark-qwen-moe — Implementation Plan"
ticket_id: T900210
domains: [factory, scripts]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# factory-muse-spark-qwen-moe — Implementation Plan

_Ticket: T900210_

Single plan (kein tasks.d-Fan-out): kleine, gekoppelte Änderung — RED-Test und
Implementierung müssen atomar landen. Vorgänger: docs/superpowers/specs/
2026-09-17-factory-muse-spark-qwen-moe-design.md (D1–D5). SSOT-Delta:
specs/software-factory.md (MODIFIED REQ-SF-EXECUTOR-001, ADDED
REQ-SF-EXECUTOR-003/004). Scope = Orchestrator switch (D2): umliegende
Agenten bleiben unverändert. Caller-Scope: scripts/factory/wakeup.sh,
scripts/factory/dispatcher-bridge.sh, scripts/factory/opencode-exec.sh,
scripts/factory/dsh-exec.sh und die Run-Pfade scripts/factory/run-dispatcher.sh,
scripts/factory/pipeline.mjs bleiben unberührt (D3/D4-Tests sichern das ab).

## File Structure

```
.opencode/agent-models.jsonc                  # 357 Zeilen, kein statisches Limit (JSONC): +2 Model-Einträge, +1 Agent (planner-muse), Orchestrator-model neu
.opencode/prompts/orchestrator.md              # Prompt-Text, kein statisches Limit: Modell-Selbstbeschreibung + Budget-Sätze
scripts/factory/dispatcher-bridge.sh           # 208/800, nicht-baselined → Budget 592: Default-Flip + resolve_executor() + FACTORY_MODE
scripts/factory/opencode-exec.sh               # 331/800, nicht-baselined → Budget 469: OPENCODE_BIN-Doku + Prompt-Satz
scripts/factory/wakeup.sh                      # 382/800, nicht-baselined → Budget 418: Header, 3 Env-Knobs dokumentieren
tests/spec/software-factory/factory-mode.bats  # NEU (0 Zeilen): RED-Test für Default + Routing
tests/spec/dsh-harness-integration/executor.bats  # Bestand (bats, kein Limit): Guard-Erwartungen an neuen Default anpassen
AGENTS.md                                      # 147 Zeilen, kein statisches Limit: Orchestrator-Zeile auf Muse Spark
```

Disjunkte Partials (D1): Single plan — alle Dateien in genau einem Partial.
Der RED-Test (Schritt 0) liegt im Stage-Commit vor und ist gegen den
ungefixten Stand rot verifiziert (`expected: FAIL`).

## F1 / F2 / STRUCT1–3 (aus specs/software-factory.md, unverändert gültig)

- **F1:** `FACTORY_EXECUTOR` unset/unknown → weiterhin opencode-Pfad (Fail-closed, kein 127).
- **F2:** `FACTORY_MODE` unset/unknown → `mixed`; jeder Slot routet deterministisch.
- **STRUCT1:** Neues Verhalten liegt in Funktion(en), kein Inline-Code im Loop.
- **STRUCT2:** Kein duplizierter Spawn-Pfad (ein Aufrufort pro Executor).
- **STRUCT3:** `resolve_executor` ist rein (kein ENV lesen, keine Seiteneffekte) und direkt per bats testbar.

## Partial P1 — Schritt 0: RED, failing test zuerst (`expected: FAIL`)

Neues `tests/spec/software-factory/factory-mode.bats`:
1. `FACTORY_EXECUTOR` unset → resolved `opencode` (bricht HEUTE: resolved `claude`).
2. `FACTORY_MODE` unset → `mixed`.
3. `FACTORY_MODE=bogus` → `mixed` + Warnung auf stderr (bricht HEUTE: Variable existiert nicht).
4. Matrix local/api/mixed × executor claude/opencode/dsh → erwarteter Gewinner laut
   REQ-SF-EXECUTOR-003-Szenarien (bricht HEUTE: keine Routing-Funktion).
Nachweis: `bats tests/spec/software-factory/factory-mode.bats` → alle 4 rot.
Erst danach Schritt 1–5. Kein Produktions-Code vor diesem Nachweis.

## Partial P1 — Schritt 1: Registry, Muse-Spark-Varianten + planner-muse (D1, D2)

In `.opencode/agent-models.jsonc`:
1. `opencode-go.models`: Eintrag `muse-spark-1.3-contributor` nach dem
   `deepseek-v4-pro`-Block (Z. 67–73) einfügen, vor der schließenden `}` (Z. 74):
   Name `Muse Spark 1.3 Contributor (OpenCode Go, 1M ctx, 131k output)`,
   `limit.context` 1000000, `limit.output` 131072 (Katalogwerte; kein apiKey-Feld —
   Auth liegt in `~/.local/share/opencode/auth.json`, Muster Z. 47–49).
2. `opencode-zen.models`: Eintrag `muse-spark-1.3-contributor-free` nach dem
   `laguna-s-2.1-free`-Block (Z. 103–109), vor `}` (Z. 110): gleiche Limits,
   Name mit Free-Tier-Hinweis (Muster Z. 104). baseURL bleibt
   `https://opencode.ai/zen/v1` (kein `/go`-Pfad — Go- und Zen-Kataloge sind
   getrennt, Z. 42–45, 76–80).
3. Neuer Agent `planner-muse` (`mode: primary`, hinter dem `orchestrator`-Block,
   Z. 244–267, vor dem big-pickle-Kommentar Z. 268): Modell Beide-Varianten mit
   Fallback Free-zuerst/Go-danach — Mechanismus nach dem Schema prüfen, das die
   Registry hergibt (Vorbild Dual-Rail `deepseek-helper-go`/`deepseek-helper`);
   Akzeptanz: Free-Variante ist Default, Go-Variante erreichbar/fallback-dokumentiert.
4. `orchestrator.model` (Z. 247) `opencode-zen/laguna-s-2.1-free` →
   Muse-Spark-Default aus (3); `description` (Z. 245) Modellnennung + Limits
   aktualisieren. `local`, `reviewer`, Eskalations-Rails: unverändert (D5).
Akzeptanz: beide Varianten-Keys + `planner-muse` + Orchestrator-`model` zeigen auf
Muse Spark (JSONC — per opencode-Config-Load oder manuellem Review verifizieren).

## Partial P1 — Schritt 2: Orchestrator-Prompt auf Muse Spark (D2)

In `.opencode/prompts/orchestrator.md` (per `model`-Prompt-Referenz Z. 248 angebunden;
Datei-Existenz zu Schrittbeginn verifizieren):
Modell-Selbstbeschreibung + Kontext-Budget-Sätze Laguna/256k → Muse Spark/1M ctx,
131k Output umschreiben. Alle Sätze über den lokalen Qwen-MoE-Executor
(single-flight, Proxy-Queue ≤3, ≤200k served KV, Budget-Pakete) unverändert lassen (D5).
Akzeptanz: kein `laguna`/`256k` mehr im Prompt; Qwen-MoE-Dispatch-Sätze intakt.

## Partial P1 — Schritt 3: dispatcher-bridge.sh, Default-Flip + FACTORY_MODE (D3)

1. Z. 179: `executor="${FACTORY_EXECUTOR:-claude}"` → `:-opencode`; Kommentar
   Z. 175–178 auf neuen Default + beibehaltenen claude-Fallback aktualisieren.
2. Neue reine Funktion `resolve_executor()` VOR dem Loop (STRUCT1/STRUCT3):
   Signatur `resolve_executor <mode> <executor>` → echo `claude|opencode|dsh`;
   Semantik: `local` → `opencode`; `api` → übergebenen Executor (claude-Pfad bleibt
   für API-Betrieb erhalten); `mixed` (Default) → `opencode`, außer explizit
   `claude` übergeben. Unbekannter Mode → Warnung + `mixed`-Verhalten (F2-Muster
   analog Z. 180–184).
3. `FACTORY_MODE="${FACTORY_MODE:-mixed}"` am Loop-Kopf; der `case` (Z. 180–184)
   bleibt für unbekannte Executor-Werte bestehen (F1); Spawn-Zweige Z. 186–196
   unverändert — ein Aufrufort pro Executor (STRUCT2).
4. `tests/spec/dsh-harness-integration/executor.bats`: Guard-Erwartungen, die den
   alten `claude`-Default festschreiben, auf `opencode`-Default umstellen; der
   unknown→Fallback-Guard bleibt (jetzt: Warnung + opencode-Pfad).
Akzeptanz: Schritt-0-Tests grün; bestehende Suite
`bats tests/spec/dsh-harness-integration/executor.bats tests/spec/software-factory/`
grün; `bash -n` sauber; Datei ≤ 800 Zeilen (Budget 592).

## Partial P1 — Schritt 4: opencode-exec.sh, OPENCODE_BIN-Doku + Prompt-Satz (D4)

1. Kommentarblock Z. 30–33: dokumentieren, dass `OPENCODE_BIN` der einzige
   Binary-Override ist (Override > PATH > `$HOME/.npm-global/bin/opencode`),
   Exit 2 bei Fehlen — kein neuer Code, ein Satz (D4: env/docs only).
2. Prompt-Bau Z. 168–206: einen Dispatch-Satz ergänzen — Modus aus
   `FACTORY_MODE` übernehmen (Default `mixed`), `local` bedeutet strikt
   sequenzielle Qwen-MoE-Dispatches (bestehende Sätze Z. 174–180 bleiben).
   Run-Zeile Z. 217 (`--agent orchestrator`) unverändert — der Orchestrator ist
   per Schritt 1 bereits Muse-Spark-gestützt.
Akzeptanz: `bash -n` sauber; Datei ≤ 800 Zeilen (Budget 469); D4-Test:
`OPENCODE_BIN=/bin/false` → Exit 2 mit Ursachenmeldung (Bestand, sichern via bats
oder manuellem Lauf).

## Partial P1 — Schritt 5: Docs, Sync, Verify

1. `AGENTS.md`: Orchestrator-Zeile der Routing-Tabelle → Muse Spark
   (`opencode-go/muse-spark-1.3-contributor`, Fallback Zen-free); Qwen-MoE-Zeilen
   (`local`, `qwen38-primary`) unverändert. Gesamt ≤ 160 Zeilen.
2. `scripts/factory/wakeup.sh`-Header (Env-Knobs Z. 18–27): `FACTORY_EXECUTOR`
   (Default `opencode`), `FACTORY_MODE` (Default `mixed`), `OPENCODE_BIN`
   ergänzen; `_usage` (Z. 37–39, `sed -n '2,26p'`) Range ggf. erweitern, damit die
   neuen Knobs in `--help` erscheinen.
3. Verify: `bash scripts/openspec.sh validate`, `task test:changed`,
   `task freshness:check`, `task freshness:regenerate`,
   `task workspace:validate`; C.4-Risiko: Embed-Post-Commit-Hook braucht Backend
   (am 2026-09-17 `:18235` unerreichbar, Proxy auf devmesh per T900191) — bei
   Fehlschlag als Risiko im Enqueue-Kommentar vermerken statt zu blockieren.
