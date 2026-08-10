---
title: Cross-Harness-Planungs-Guardrails — „Gleiche Karten für alle"
ticket_id: T003267
domains: [infra, test]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Cross-Harness-Planungs-Guardrails — „Gleiche Karten für alle"

## Zweck

Der Planungs-Flow (Plan erstellen, Ticket stagen) existiert heute dreimal getrennt als
Skill-Prosa — `dev-flow-plan` (Claude Code), `opencode-flow-plan` (opencode, von agy als
maßgeblich behandelt) — plus ein vierter headless Pfad in der Factory
(`scripts/factory/pipeline.mjs` `plan:decompose`). Gepflegt wird nur der Claude-Pfad:
ein Audit (2026-08-10, dieser Change) fand ~16 Guard-Drift-Punkte im opencode/agy-Pfad,
darunter zwei mit realem Schadenspotential (Fix-Pfad staged vor dem Commit → T002673-Klasse,
`touched_files` bleibt still leer; Feature-Loop staged ohne `--hold` → Factory kann
dispatchen, bevor der Operator freigibt). Der einzige Parity-Guard
(`tests/spec/harness-workflow-split.bats`) prüft nur Skill-Existenz und Token-Abwesenheit,
nie Guard-Inhalte.

Ziel: Durchsetzbare Prozess-Guards wandern aus Markdown in gemeinsame fail-closed Skripte,
die jede Runtime identisch aufruft; ein deklarativer Parity-Guard verhindert künftige
Prosa-Drift; die opencode-Prosa wird einmalig nachgezogen. Schwächere Modelle bekommen die
Plan-Qualitätsregeln **vor** dem Schreiben deterministisch injiziert statt sie erst vom
roten Linter zu lernen.

## Vorentscheidungen (User, 2026-08-10)

1. **Ansatz:** Skripte + Parity-Guard — kein Registry-Generator für die Skill-Prosa,
   kein reiner Prosa-Sync.
2. **Scope:** Alle Runtimes inkl. Factory-/Lokalmodell-Pfade.
3. **`stage-plan`-Vertrag:** `--hold` oder `--no-hold` wird Pflicht; fehlt beides → Exit 1.
   Bestehende Call-Sites werden im selben Change explizit umgestellt.
4. **`touched_files`-Härtung:** Leere Ableitung wird harter Fehler (Exit 1, Hinweis auf
   T002673); Override `--allow-empty-touched` für legitime Sonderfälle.

Prior-Art (Schritt 0.7): `openspec/specs/dev-flow-plan.md:206-262` erklärt beide
Plan-Skills für symmetrisch (deckt bisher nur die Partial-Mechanik ab);
`docs/superpowers/specs/2026-07-27-agent-resources-rework-design.md` wählte für
Agent-Ressourcen „Registry + fail-closed BATS-Test" und verwarf Symlinks. Dieses Design
weitet die bestehende Symmetrie-Entscheidung aus, es kehrt keine um.

## Komponenten

### 1. `scripts/plan-preflight.sh` (neu) — Guard-Bündel als Subkommandos

Fail-closed, harness-agnostisch, reine Bash ohne LLM. Ersetzt die Copy-Paste-Snippets im
Skill-Markdown durch je einen Einzeiler:

- `plan-preflight.sh pre-commit --ticket <TICKET_EXT_ID>` — die drei Checks aus
  dev-flow-plan Schritt 5 [T001268]: (a) HEAD ist nicht `main`, (b) `git status
  --porcelain` leer, (c) agent-lock-Claim vorhanden und Branch-Match — ticket-scoped
  `ticket__<id>.json` ODER branch-scoped `branch__<slug>.json` (T003102).
- `plan-preflight.sh pre-worktree --ticket <TICKET_EXT_ID>` — Wrapper um
  `scripts/agent-lock.sh check-merged` (T002279) mit durchgereichten Exit-Codes.

Fehlermeldungen: eine Zeile Klartext — was fehlt + welcher Befehl es behebt.
Exit-Codes: 0 = alle Checks grün, 1 = Check verletzt, 2 = Usage-Fehler.

### 2. `stage-plan.sh`-Härtung (`scripts/vda/ticket/stage-plan.sh`)

- **Explizite Hold-Entscheidung:** weder `--hold` noch `--no-hold` übergeben → Exit 1 mit
  Usage-Hinweis. `--no-hold` behält das heutige Verhalten (Force-Tick +
  `factory.service`-Start). Umzustellende Call-Sites werden zur Implementierungszeit per
  `grep -rn 'stage-plan' scripts/ .claude/ .opencode/ taskfiles/` vollständig erhoben;
  zum Design-Zeitpunkt bekannt: `opencode-flow-plan/SKILL.md` (Feature-Loop C.2d und
  Fix-Pfad) sowie die dev-flow-Skill-Snippets. Factory-seitige Aufrufer erhalten
  `--no-hold`, interaktive Skill-Snippets `--hold`.
- **`touched_files`-Härtung:** Ergibt die Ableitung (`scripts/plan-touched-files.sh`)
  null Pfade, bricht `stage-plan` mit Exit 1 ab: „Plan im Branch-Commit ist noch das
  propose-Skeleton? Erst committen, dann stagen (T002673)". Override:
  `--allow-empty-touched`.
- `plan-touched-files.sh` selbst bleibt fail-soft (bewusste Arbeitsteilung: das Gate ist
  `stage-plan`, nicht der Parser).

### 3. `plan-lint.sh --rules` (neu) — kanonische Regel-Prosa aus dem Linter

Neuer Modus, der die Hard Rules (F1, F2, STRUCT1–3, STRUCT-PARTIAL, D1, D2, I1, P1,
B1a/B1b, Token-Limit T002453-C) als kompakten, prompt-tauglichen Text auf stdout ausgibt —
inhaltlich gebunden an dieselben Konstanten/Meldungen, die der Prüfmodus verwendet. Alle
Plan-Schreiber injizieren diesen Output statt eigener Abschriften:

- Claude Code: Plan-Subagent-Prompt (Schritt 3.7) bindet `plan-lint.sh --rules` zusätzlich
  zur bestehenden Referenz `plan-quality-gates.md` ein.
- opencode: der Decompose-/Plan-Prompt des Orchestrators injiziert denselben Output.
- Factory: `pipeline.mjs` hängt den Output an den `plan:decompose`-Prompt an — das lokale
  Modell (`gemma26-factory`) kennt die Regeln damit vor dem ersten Schreibversuch; die
  bestehende Schleife „plan-lint → eine LLM-Fix-Iteration → Block" bleibt unverändert als
  Netz darunter.

`plan-quality-gates.md` bleibt als menschenlesbare Tiefenreferenz bestehen; die
maschinennutzbare Kurzform hat ihren SSOT im Linter.

### 4. Parity-Guard (deklarativ, fail-closed)

- **`docs/agent-guide/registry/plan-guards.yaml`** (neu): Katalog der Prozess-Guards.
  Pro Eintrag: `id` (z. B. `T002673`), `anchor` (Grep-Token, z. B. der Ticket-Code oder
  eine wörtliche Kernphrase), `applies_to` (Dateiliste). Asymmetrien sind deklarierbar —
  opencodes `agent-collision.sh`-Guard (T002444) gilt z. B. nur dort. Kein Generator:
  die Registry ist Prüfgrundlage, nicht Quelle der Prosa.
- **`tests/spec/dev-flow-plan/guard-parity.bats`** (neu): iteriert die Registry, prüft
  jeden Anker in jeder deklarierten Datei. Zusätzlich Stale-Modell-Check: jeder
  Modell-Slug, der in den Flow-Skills genannt wird, muss in
  `scripts/llm/loadouts.json` oder `.opencode/agent-models.jsonc` existieren (hätte den
  toten `gemma9-factory`-Verweis sofort gefangen). Header-Kommentar dokumentiert den
  Grep-Prüfmodus als T002448-M4-Ausnahme (Prüfobjekt ist Dokumentations-Konvention).

### 5. Einmaliger Prosa-Sync + Skill-Umbau

- `.opencode/skills/opencode-flow-plan/SKILL.md`: alle Audit-Drift-Punkte nachziehen —
  u. a. Fix-Pfad-Reihenfolge (stage **nach** Commit, T002673), `--hold` im Feature-Loop,
  Schritt 0.7 Prior-Art (T002829), `check-merged`-Preflight (T002279), Lock-Fallback
  (T003102), Übergabe-/STOPP-Abschnitt inkl. „kein fertig aussehender PR" (T002816),
  Rotphasen-Binary-Guard (T002820), Symptom-vs-Hypothese (T002448-M5),
  plan-quality-gates-Einbindung im Subagent-Prompt, `scripts/plan-intel.sh`-Pflicht,
  Modelltabelle gegen `loadouts.json` aktualisiert, toten `lavish`-Verweis bereinigt,
  Ticket-Suffix-Inkonsistenz (`feature/<slug>-T<id>`) behoben,
  `chore(plans):`-Begründung + Guard-Nennung.
- Beide Flow-Skills ersetzen ihre Inline-Guard-Snippets durch die
  `plan-preflight.sh`-Aufrufe (Prosa erklärt das Warum, das Skript erzwingt das Was).
- agy erbt den Sync automatisch („treat the opencode path as authoritative"); `GEMINI.md`
  braucht keine Änderung.

### 6. OpenSpec-Delta auf `openspec/specs/dev-flow-plan.md`

- Symmetrie-Klausel („symmetric") ausweiten: von Partial-Mechanik auf Guard-Parity
  (Registry-Pflicht für Prozess-Guards) + Preflight-Skript-Aufrufe.
- Nebenbefund fixen: toter Pfad `.agents/skills/dev-flow-plan/SKILL.md` → realer Pfad
  `.claude/skills/dev-flow-plan/SKILL.md`.

## Fehlerbehandlung

- Preflight/Stage-Fehler sind Exit ≠ 0 mit einzeiliger Ursache + Abhilfe-Befehl; keine
  stillen stderr-Warnungen bei gleichzeitigem Erfolgs-Exit (genau die T002673-Falle).
- `stage-plan` bleibt idempotent (SQL-UNION der `touched_files`); die neuen Pflicht-Flags
  ändern daran nichts.
- Factory-Verhalten bei rotem plan-lint bleibt unverändert (eine Fix-Iteration, dann
  `plan-lint-block` + Phase-Event).

## Tests (Output-Verifikation, T002448-M4)

Unter `tests/spec/dev-flow-plan/` (Verzeichnis-Konvention T002416), je Vorgang eine Datei:

- `plan-preflight.bats` — führt das Skript gegen Temp-Git-Fixtures aus: auf `main` → rc 1;
  dirty tree → rc 1; fehlender Lock → rc 1; branch-scoped Lock → rc 0; Positiv-Anker
  (T002356-M1) in jedem Negativtest.
- `stage-plan-contract.bats` — ohne Hold-Flag → rc 1; `--no-hold` → bisheriges Verhalten;
  Skeleton-Plan → rc 1 mit T002673-Hinweis; `--allow-empty-touched` → rc 0. DB-abhängige
  Teile mit Verfügbarkeits-Guard (`command -v psql` / erreichbare DB → sonst `skip`,
  T002820).
- `plan-lint-rules.bats` — `--rules` liefert rc 0, nennt jede Hard-Rule-ID; formatfreie
  Proben (`grep -qF`, keine Zeilenanker — Semantik statt Darstellung, T002716).
- `guard-parity.bats` — siehe Komponente 4 (Grep-Modus, dokumentierte Ausnahme).

## Nicht im Scope (YAGNI)

- Kein Generator für Skill-Prosa (bewusst gegen „Registry + Generator" entschieden).
- Keine Änderung an `plan-context.sh`-Fail-soft-Verhalten (T002322 bleibt dokumentierte
  Eigenschaft).
- Keine Vereinheitlichung der Execute-Flows (`dev-flow-execute` vs.
  `opencode-flow-execute`) — eigener, späterer Change; dieses Design deckt Planen + Stagen.
- Kein Umbau von `plan-qa-check.sh` (bleibt advisory).
