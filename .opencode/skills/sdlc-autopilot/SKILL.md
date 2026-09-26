---
name: sdlc-autopilot
description: 'Autonomer SDLC-Loop: sammelt Specs fuer Tickets ohne Spec, priorisiert Ticket-Abarbeitung und haelt den Kontext kompakt. Triggers on sdlc autopilot, autopilot loop, tickets autonom abarbeiten, specs akkumulieren, spec-less tickets, faehr alle Tickets, autonomous ticket resolution.'
---

# sdlc-autopilot — autonomer SDLC-Loop

> **Mishap Tracking:** Führe während dieses Skills ein `MISHAP_LOG` und rufe am Ende
> `mishap-tracker` auf — Eintragsformat und Ablauf: siehe `mishap-tracker` §Input.

Fährt die Pipeline ticket-triage → dev-flow-plan → Factory selbstständig ab, bis das
Queue-Material erschöpft ist oder menschliche Freigabe fehlt.

## Voraussetzungen

- **Native Auto-Compact statt Eigenbau:** `freetoken-active` advertised dem
  Alias bis zu `SDLC_CONTEXT_CEILING` (Default 200000) Kontext, solange die
  Engine läuft und das residente Modell Headroom hat. opencode kompaktiert
  nativ bei 95% davon (~190k). Serverseitig muss der KV-Pool mitwachsen
  (`ft ctl cache --kv <n>` — Kontext auf Kosten der MoE-Slot-Caches); siehe
  Skill `freetoken-setup`. Wirksam nach opencode-Neustart.
- Sauberes Haupt-Checkout (kein anderer Session-Lock); Planning-Arbeit darf im
  Haupt-Checkout passieren, Implementierung erzeugt Worktrees wie immer.

## Der Loop

Pro Iteration, in dieser Reihenfolge:

0. **WIP-Lage** — `bash scripts/wip-glance.sh` (read-only, ~1 s) zeigt alle
   Worktrees, Locks, offenen PRs, unmerged Branches und Stashes mit Zustand
   `live` / `unlocked-dirty` / `abandoned` / `idle`. Nichts davon wird
   angefasst. Steht ein `abandoned`-Eintrag drin, erst Schritt W des
   WIP-Aufraeumens, dann weiter — ein liegengebliebenes Ticket-Repo darf
   den Loop nicht stillstehen lassen.
1. **Inventur** — `ticket-mcp_list_tickets` (Status `triage`/`planning`) plus
   `factory-mcp_factory_status` + `factory_queue`. Baue die Arbeitsliste:
   Tickets mit `spec_skizziert=false` zuerst (Spec-Rückstand), dann bereits
   plan_staged/backlog.
2. **Priorisierung** — Sortiere nach: `needs_human`/`blocked` ans Ende bzw.
   überspringen; dann `planning_rank` (niedrig = wichtiger), `severity`,
   `depends_on`-Kette (Dependencies zuerst). Bündel gleiche `areas` ohne
   Dateikonflikt zu Batch-Gruppen wie in ticket-ops Phase 2.
3. **Spec akkumulieren** — für das oberste Ticket ohne Spec:
   - Kontext holen (`get_ticket`, Attachments, verwandte Tickets), Code-Recherche
     mit codebase-memory-mcp.
   - OpenSpec-Skizze anlegen (Phase A aus dev-flow-plan) oder bei Chores direkte
     Pfad-Wahl; danach `set_readiness_flag spec_skizziert=true`.
   - Echte Ermessensfragen maximal EINMAL gebündelt per `question` stellen;
     Antwort verweigert/nicht eindeutig → Ticket als `needs_human` markieren,
     weiter mit dem nächsten.
4. **Plan + Staging** — dev-flow-plan Phasen B/C: Worktree + Branch, Partial-Plan
   schreiben, `stage_plan --no-hold` (oder `enqueue_ticket`). Pipeline-Prinzip:
   sobald ein Plan steht, sofort stagen — die Factory arbeitet parallel, während
   der Loop das nächste Ticket plant.
5. **Factory füttern** — nach dem Stagen `factory_trigger`; Fortschritt via
   `factory_recent` prüfen. Merge schließt das Ticket (Merge = closure).

Dann zurück zu 1.

## W. Abandoned-WIP aufraeumen (bis clean)

Zwei Skripte, beide fail-closed [T900481]:

| Kommando | Wirkung |
| --- | --- |
| `bash scripts/wip-glance.sh` | read-only Uebersicht; `--json`, `--quiet`, `--stale-hours N` (Default 24) |
| `bash scripts/wip-finish.sh` | **Planlauf**: Kandidaten + vorgeschlagene Aktion, aendert nichts |
| `bash scripts/wip-finish.sh --apply --allow <aktion>` | nur die genannten Aktionen ausfuehren |

- **Standard ist Planlauf.** `--apply` ohne `--allow` fuehrt nichts aus.
- Ein 4B-Rail **triagiert nur** (2. GPU `127.0.0.1:1920` = Qwen3.5-4B-MTP,
  PK-Tablet via `ssh pk-tablet` → LM Studio `:1234`; `--rails host:port`).
  Es antwortet mit `ACT=<aktion>|REASON=<kurz>` und schreibt NIE Repo-Inhalt —
  Grundlage ist der Benchmark `scripts/llm/measurements/`, in dem 4B-Modelle
  beim Orchestrieren unter 60 % liegen.
  Antwortet die Rail mit einer nicht angebotenen Aktion, wird sie **verworfen**
  und die deterministische Heuristik gilt.
- `commit-dirty` ist die einzige Schreibaktion und verlangt einen Lock, den der
  Aufrufer selbst haelt, plus einen sauberen Git-Zustand (kein Merge/Rebase).
- `review-stash`, `open-pr`, `remove-worktree` werden geplant, aber nie
  automatisch ausgefuehrt — Stashes und fremde Branches sind zu
  datenverlust-anfaellig fuer einen autonomen Loop.
- "Bis clean" heisst: **planbar ist clean**, wenn kein `abandoned` mehr da ist.
  `live` und `unlocked-dirty` sind per Definition *nicht* abandoned. Endet der
  Loop hier, nennt der Endbericht die uebrigen Kandidaten explizit.

## Abbruchbedingungen

- Keine dispatchbaren Tickets mehr → Endbericht (erledigt / needs_human / blocked).
- `wip-glance.sh --quiet` meldet `abandoned=0` → kein WIP-Aufraeumen noetig;
  sonst vor dem Ticket-Lauf einmal `wip-finish.sh` planen (Schritt W).
- Zwei aufeinanderfolgende Iterationen ohne Statusänderung → Stop statt Doom-Loop
  (Permission `doom_loop` steht auf deny).
- User-Interrupt jederzeit respektieren.

## Kontext-Hygiene (PFLICHT)

- State lebt in der DB (Tickets, Flags, Plans) — **nicht** im Gesprächskontext.
  Nach jeder Compaction reicht der DB-Stand, um bei Schritt 1 fortzusetzen.
- Pro Iteration nur EIN Ticket voll durchdringen; Ergebnisse sofort persistieren.
- Alte Tool-Outputs nicht rekapitulieren — Referenzen auf Ticket-IDs genügen.
