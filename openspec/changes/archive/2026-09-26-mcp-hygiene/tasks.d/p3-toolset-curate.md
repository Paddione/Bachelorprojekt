---
title: "p3 — Curate the toolset registry and resolve harness drift"
ticket_id: T900479
domains: [mcp, repo-hygiene]
status: active
---

# p3 — Curate the toolset registry and resolve harness drift

Files: `docs/agent-guide/registry/capabilities.yaml`, `docs/agent-guide/registry/mcp.yaml`, `.claude/settings.json`, `.claude/skills/references/mcp-tool-guide.md`, `.opencode/skills/references/mcp-tool-guide.md`, `docs/agent-guide/maps/toolset-map.md`, `docs/agent-guide/20-werkzeuge.md`, `components/website/src/lib/agent-guide.generated.json` (target_files dieses Partials; disjunkt zu p1, p2, p-tests).

Sequencing: Erst nach Merge von PR #5966 ausführen (dort wird
`mcp-tool-guide.md` ebenfalls bearbeitet).

## Task 3.1: MCP-Instanzen kuratieren

1. In `docs/agent-guide/registry/capabilities.yaml`, Fähigkeit
   `dokumentations-lookup`: `plugin:context7@claude-plugins-official` auf
   `suppressed` setzen mit reason „Doppelt mcp:context7; der Plugin-Endpoint
   verlangt Auth, der MCP-Server funktioniert anonym."; `mcp:context7` als
   `canonical` eintragen mit use_when „Aktuelle Doku zu Bibliotheken,
   Frameworks, SDKs und CLIs statt aus dem Gedächtnis.", avoid_when
   „Refactoring, Business-Logik, allgemeine Programmierkonzepte.", roles
   [all], tier safe. (Genau eine kanonische Instanz je Fähigkeit.)
2. Neue Fähigkeit `tresor-zugriff` im Security-Abschnitt (nach
   `secure-coding-guidance`) anlegen mit `mcp:warden` als `canonical`:
   use_when „Persönliche Tresor-Credentials lesen; Schreiben nur nach
   Rückfrage.", roles [orchestrator, bachelorprojekt-security], tier caution.
3. In Fähigkeit `repo-hygiene` das `use_when` um „, Factory-Queue" kürzen;
   der Sektionskommentar „Tickets, Factory, Pläne" wird zu „Tickets und
   Pläne". Den `session-tracing`-reason (`tickets.factory_phase_events`)
   NICHT anfassen — die Tabelle wurde in #5933 bewusst erhalten.
4. Prüfen: `node scripts/toolset/check.mjs` meldet `mcp:context7` und
   `mcp:warden` nicht mehr als unreviewed.

## Task 3.2: Skill-Triage (22 Instanzen, keine Rate-Verdikte)

Alle Einträge in `docs/agent-guide/registry/capabilities.yaml`; ungenutzte
oder ungeklärte Skills je als eigene Einzelinstanz-Fähigkeit (Name = Slug).

1. `suppressed` mit Begründung: `skill:sdlc-autopilot` („Opencode-only
   (AGENTS.md); kein Claude-Pfad."), `skill:opencode-git-workflow`
   („Opencode-Harness-Skill, Fehlplatzierung im Claude-Skill-Verzeichnis."),
   `skill:skill-creator` („Doppelt superpowers:writing-skills (wie das
   gleichnamige Plugin).").
2. `canonical`: `skill:find-skills` (Fähigkeit `skill-discovery`, use_when
   „Installierbare Skills zu einer Aufgabe finden.", roles [orchestrator],
   tier safe); `skill:freetoken-setup` (Fähigkeit `lokales-modell-serving`,
   use_when „FreeToken-MoE-Backend starten, Modell wechseln, Caches
   dimensionieren.", roles [orchestrator], tier caution).
3. `unreviewed` mit Klärungsauftrag: `skill:hf-mem` („Klärung: nutzt der
   freetoken-Flow Speicherschätzung? Falls ja canonical [orchestrator], sonst
   suppressed."); alle zwölf `skill:huggingface-*` („Vendor-Drop ohne
   belegten Repo-Konsumenten; bei Trainings-/Eval-Bedarf (scripts/finetune/)
   einzeln kuratieren."); `skill:skill-craft` („Klärung: Verhältnis zu
   superpowers:writing-skills (kanonischer Skill-Pfad).");
   `skill:train-sentence-transformers`, `skill:transformers-js`,
   `skill:trl-training` („Vendor-Drop; Klärung gegen scripts/finetune/ und
   Website-Stack, dann canonical oder suppressed.").
4. Prüfen: `node scripts/toolset/check.mjs` zeigt danach keine der drei
   suppressed- und keine der zwei canonical-Skills mehr als unreviewed;
   17 verbleibende unreviewed mit reason sind gewollt (CI-grün).

## Task 3.3: Plugin-Drifts auflösen

1. In `.claude/settings.json` (`enabledPlugins`) deaktivieren:
   `playwright@claude-plugins-official` und
   `skill-creator@claude-plugins-official` (jeweils `true` → `false`).
   Begründung: Die Registry-Suppressions tragen geprüfte Reasons (Duplikat
   zu chrome-devtools-Pfad/CLI bzw. superpowers-Pfad); die MCP-Server und
   CLI-Pfade bleiben die genutzten Wege. Reversibel via `/plugin`.
2. In `capabilities.yaml`, Fähigkeit `ausgabestil`:
   `plugin:learning-output-style@claude-plugins-official` auf `suppressed`
   setzen mit reason „Vom Operator deaktiviert; kein aktiver Ausgabestil."
   (Settings-Seite bleibt `false` — Nutzerpräferenz.)
3. Prüfen: `node scripts/toolset/check.mjs` meldet keine „not enforced"
   Plugin-Entscheidungen mehr.

## Task 3.4: Registry-Kommentare und Tool-Guide

1. In `docs/agent-guide/registry/mcp.yaml` den P6-Kommentar („Old Go/Python
   sources are deprecated") ersetzen durch: „Go-Quellen unter
   scripts/ticket-mcp/go bleiben Build- und Test-Artefakt
   (ticket-mcp:build/test, CodeQL, Doctor-Check); Harnesses nutzen den
   Node-Port." Als Kommentarblock vor `clients:` eine User-Scope-Notiz
   ergänzen: glimmer-worker-mcp und comfy-image-mcp installieren per
   Taskfile.llm.yml nach `~/.config/muse/settings.json` (User-Scope, nicht
   Registry-verwaltet); mailbox-mcp ist vendored und unregistriert.
2. In `.claude/skills/references/mcp-tool-guide.md` einen Warden-Abschnitt
   in der Form der bestehenden Server-Abschnitte ergänzen (Tresor-Reads,
   ask-Gating mutierender Tools, Credentials aus
   `~/.config/warden-mcp/server.env`, bw-Version-Hinweis aus der
   mcp.yaml-Note). Danach den Inhalt per `cp` auf
   `.opencode/skills/references/mcp-tool-guide.md` übertragen (Hardlink-Paar;
   Edit löst den Link, `cp` stellt Inhaltsparität her) und mit `cmp` die
   Byte-Identität beider Pfade nachweisen.
3. Prüfen: `grep -ci warden` auf dem Guide ist größer 0 (G-AGENTIC12).

## Task 3.5: Registry-Sync und Derivate

1. `node scripts/toolset/sync.mjs`, `node scripts/toolset/check.mjs`
   (Exit 0), `node scripts/toolset/emit-map.mjs`, `task agent-guide:emit`.
2. Die generierten Derivate (`docs/agent-guide/maps/toolset-map.md`,
   `docs/agent-guide/20-werkzeuge.md`,
   `components/website/src/lib/agent-guide.generated.json`) plus alles, was
   `task freshness:regenerate` zusätzlich berührt, mitcommitten.

## Verify (Partial)

```bash
node scripts/toolset/check.mjs
task test:changed
task freshness:regenerate
task freshness:check
```
