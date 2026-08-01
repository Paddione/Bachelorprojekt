---
title: "llama-stack"
ticket_id: T002459
domains: [scripts]
status: plan_staged
---

# llama-stack — Implementation Plan

Gemma-Migration in den Linux-Loadout-Stack des `llm-proxy`, Autorestart für alle Loadouts über
systemd, Auto-Start-bei-Anfrage mit Konfliktschutz für GPU-exklusive Chat-Modelle. Deckt einen
Teilscope von Epic T002459 ab — Details, Korrekturen zum Ticket-Text und Nicht-Ziele in
`proposal.md`/`design.md`.

## File Structure

| Datei | Ist-Zeilen | Budget | Partial |
|---|---|---|---|
| `scripts/llm/loadouts.json` | 80 | kein S1-Gate (JSON) | P1 |
| `scripts/llm-proxy/loadouts.mjs` | 100 | 700 | P1 |
| `scripts/llm-proxy/runner.mjs` | 110 | 690 | P2 |
| `scripts/llm-proxy/server.mjs` | 398 | 402 | P3 |
| `scripts/llm/watchdog-llm-servers.ps1` | 234 | kein S1-Gate (.ps1) | P4 |
| `scripts/llm/install-startup-autostart.ps1` | 173 | kein S1-Gate (.ps1) | P4 |
| `scripts/llm-proxy/loadouts.test.mjs` | 106 | 694 | P5 |
| `scripts/llm-proxy/runner.test.mjs` | 125 | 675 | P5 |
| `scripts/llm-proxy/server.test.mjs` | 166 | 634 | P5 |
| `tests/spec/local-llm-proxy/gemma-loadout-autorestart-queue.bats` | 0 (neu) | kein S1-Gate (.bats) | P5 |
| `tests/spec/local-llm-proxy.bats` | bestehend, 1 Assertion angepasst | kein S1-Gate (.bats) | P5 |
| `website/src/data/test-inventory.json` | generiert | — | P5 |

## Partials

| id | tasks.d | Rolle | target_files | depends_on |
|----|---------|-------|---------------|------------|
| p1 | tasks.d/p1-loadout-schema.md | impl | `scripts/llm/loadouts.json`, `scripts/llm-proxy/loadouts.mjs` | |
| p2 | tasks.d/p2-runner-argv-restart.md | impl | `scripts/llm-proxy/runner.mjs` | |
| p3 | tasks.d/p3-server-auto-start-queue.md | impl | `scripts/llm-proxy/server.mjs` | p1, p2 |
| p4 | tasks.d/p4-windows-cutover.md | impl | `scripts/llm/watchdog-llm-servers.ps1`, `scripts/llm/install-startup-autostart.ps1` | p1, p2, p3 |
| p5 | tasks.d/p5-tests.md | tests | `scripts/llm-proxy/loadouts.test.mjs`, `scripts/llm-proxy/runner.test.mjs`, `scripts/llm-proxy/server.test.mjs`, `tests/spec/local-llm-proxy/gemma-loadout-autorestart-queue.bats`, `tests/spec/local-llm-proxy.bats` | p1, p2, p3 |

**Merge-Reihenfolge ist verbindlich, nicht nur eine Empfehlung:** P3 importiert `planAutoStart`
aus `loadouts.mjs` (P1) — fehlt der Export, bricht `server.mjs` bereits beim Modul-Laden. P4
(Cutover) braucht einen erfolgreichen Live-Smoke-Test gegen `gemma-factory`, der erst nach P1+P2+P3
existiert. P5 (Tests) ist bewusst RED geschrieben, bevor P1–P3 vollständig sind (Task P5.1),
läuft aber inhaltlich erst nach allen vier Implementierungs-Partials grün durch.

## Task — Cross-Partial-Reconciliation (bereits durch den Orchestrator erledigt)

Zwei Konflikte zwischen blind parallel geschriebenen Partials wurden vor dem Zusammenführen
aufgelöst (Diffs stehen bereits in den jeweiligen `tasks.d/*.md`, hier nur zur Nachvollziehbarkeit
protokolliert — kein offener Umsetzungsschritt):

1. **S1-Budget falsch berechnet** (P1, P2 gingen von `.mjs`-Limit 500 aus, korrekt ist 800 seit
   T002452, `docs/code-quality/gates.yaml` Zeile 62) — in P1 und P2 auf 700/690 korrigiert.
2. **`-kvu` fehlte** im `gemma-multiagent`-Loadout-Entwurf (P1), obwohl Delta-Spec und `design.md`
   D1 es für das Shared-Multi-Agent-Profil fordern — in P1 als `extraArgs: ["-kvu"]` ergänzt.
3. **Architektur-Konflikt P3/P5**: P5 braucht eine reine, ohne laufenden Proxy testbare
   Entscheidungsfunktion; P3 hatte die Konfliktprüfung ursprünglich direkt (und damit
   nicht-importierbar) in `server.mjs` gebaut. Aufgelöst: `planAutoStart({doc, model,
   activeSlugs})` lebt jetzt in `loadouts.mjs` (P1, neuer Task 3), `server.mjs` (P3) ruft sie nur
   noch auf.

## Task — Finale Verifikation (Gesamtplan)

Deckungsgleich mit dem letzten Task in `tasks.d/p5-tests.md` (Task P5.8) — hier zusätzlich im
Index verankert, damit STRUCT3 unabhängig vom Partial-Modus erfüllt ist.

Ein früher Task in `tasks.d/p5-tests.md` (Task P5.1) enthält bereits den geforderten
Rot→Grün-Failing-Test-Step:

```bash
node --test scripts/llm-proxy/loadouts.test.mjs scripts/llm-proxy/runner.test.mjs scripts/llm-proxy/server.test.mjs
# expected: FAIL — vor Umsetzung von P1/P2/P3 kennt parseLoadouts weder exclusiveGroup noch
#           mmprojPath, buildServerArgv kennt --spec-draft-model/--mmproj nicht, und
#           planAutoStart existiert in keinem Modul
```

Nach Abschluss aller fünf Partials:

```bash
task test:llm-proxy
tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy/gemma-loadout-autorestart-queue.bats
tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy.bats
task test:changed
task freshness:regenerate
task freshness:check
```

Zusätzlich, außerhalb der CI-Reichweite (Begründung: design.md D3-Risiko, kein GPU-Host/systemd
in CI) — Ergebnis gehört als Notiz in den PR-Body:

- P2, Task P2.5: `Restart=on-failure`/`--collect`-Zusammenspiel live gegen `gptoss-context`
  verifiziert.
- P4, letzter Task: Cutover-Smoke-Test gegen `gemma-factory` VOR dem Entfernen des
  Windows-Watchdog-Eintrags.
