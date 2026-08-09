# ticket-ops — Prozeduren

Referenz zu [`ticket-ops`](../ticket-ops/SKILL.md). Der Skill-Body führt den Phasen-Ablauf und
alle Invarianten (Enum-Werte, DoR-vs-Factory-Gate, Escalation-Cap, Approval-Gate); hier stehen
die ausformulierten Schritte, Queries und Rubriken.

---

## Ticket-Modell & GitHub-Linkage

The internal Postgres tracker — `tickets.tickets` on `mentolder` (`website` DB) — is the **single source of truth for issues**. This repo does **not** use GitHub Issues (`gh issue`); the website admin at `https://web.mentolder.de/admin/bugs` is the UI over the same table. If a GitHub issue ever does appear, treat it as intake (see GitHub Issue Intake): copy it into a `tickets.tickets` row, then close the GitHub issue referencing the new `external_id`.

GitHub **PRs are the CI/CD merge mechanism** and link back to a ticket by convention — there is **no `ticket_id` FK on PRs**. The link lives in three soft channels:
- the `[T000XXX]` tag in the PR/commit title and the `fix/tNNNN-…` / `feature/…` branch name,
- `tickets.ticket_plans.pr_number` (written when a plan is archived by `dev-flow-execute`),
- a closing row in `tickets.ticket_comments` (`PR #N merged …`).

**Ticket-to-ticket dependencies** live in two places — read **both** in Phase 3:
- `tickets.tickets.depends_on` — a `text[]` of blocking `external_id`s on the row itself.
- `tickets.ticket_links` — normalised edges (`to_id` is `NOT NULL`, `kind ∈ blocks|blocked_by|duplicate_of|relates_to|fixes|fixed_by`). Never use `ticket_links` for PR references — it is ticket→ticket only.


**DB-Zugriff:** Reads MCP-first via `mcp__mcp-postgres__query`; der `psql()`-Fallback-Helper
(zugleich Pflichtweg für Writes) und die `tickets.ticket_plans`-`SELECT *`-Warnung sind SSOT im
[`MCP-Tool-Guide`](mcp-tool-guide.md) §mcp-postgres — alle `psql -c`-Aufrufe unten setzen diesen
Helper voraus.

---

## Phase 1 — Completeness Triage

The triaging agent **autonomously decides** severity, component, areas, and readiness flags using the rubrics below. Only **significant decisions** that genuinely need human judgement are escalated via `attention_mode='needs_human'`. Use all available subagents (`bachelorprojekt-test`, `bachelorprojekt-infra`, `bachelorprojekt-security`, `bachelorprojekt-website`, etc.) to validate and complete ticket data in parallel up until plans are staged.

**Prüfkriterium "Ticket hat einen Plan" [T002873]:** Nicht `tickets.ticket_plans` abfragen —
`scripts/vda/ticket/stage-plan.sh` legt dort **keine** Zeile an; die entsteht erst beim
Archivieren. Maßgeblich ist der `FACTORY-PLAN-REF branch=… plan=…`-Kommentar, den `stage-plan.sh`
beim regulären Staging schreibt (so wie `reconcile-ticket-status.sh` Pattern 4 es bereits prüft).
Ein frisch gestagtes Ticket zeigt `status=plan_staged`, `ticket_plans`-Zeilenzahl `0` und
`branch=null` — das ist der Normalfall, kein Defekt.

### Decision Rubric (AI-Autonomous)

| Field | Autonomous Default Values | Escalate to Human When... |
|-------|---------------------------|---------------------------|
| **severity** | `trivial` (bug type=minor description), `minor` (type=medium/unclear), `major` (clear impact: broken deploy, security leak, data loss), `critical` (CI failure, production blocker) | Ambiguous business impact, unclear scope boundary |
| **component** | Infer from title keywords (auth→auth, db→database, ci→ci, infra→infra, chat→chat, website→website, brain→brain, tools→tools, secrets→security), use `null` if truly unclear | Cross-cutting without clear owner |
| **areas** | Extract from component + title context (e.g., "sealed-secret" → ["infra","security"], "oauth2-proxy" → ["auth"], "deployment" → ["infra"]), default to ["ops"] for generic tasks | Multi-area with no clear focus |
| **readiness.flags** | `spec_skizziert: true` if description ≥ 100 chars, `aufwand_geschaetzt: false`, `abhaengigkeiten_klar: true` (if depends_on null/empty), `offene_fragen_geklaert: false` (default) | Description too thin (<30 chars) or explicitly asks clarifying questions |

### Step 1.0: Prosa-Blocker-Erkennung [T002771]

Vor oder parallel zur Vollständigkeitsprüfung: Jede Ticket-Beschreibung auf Schlüsselwörter
scannen, die auf einen Blocker hinweisen:

| Muster | Regex | Aktion |
|--------|-------|--------|
| `BLOCKIERT VON` | `(?i)blockiert\s+von` | Extrahiere folgende PR#- und T000XXX-Referenzen |
| `hängt an` | `(?i)h(ä|ae)ngt\s+an` | Extrahiere folgende PR#- und T000XXX-Referenzen |
| `ABHÄNGT VON` | `(?i)abh(ä|ae)ng(ig|t)\s+von` | Extrahiere folgende PR#- und T000XXX-Referenzen |

Gefundene Referenzen:
- **T000XXX**: In `depends_on` überführen, falls noch nicht vorhanden
- **PR #N**: Via `gh pr view N --json state,mergedAt` prüfen:
  - `state=MERGED` → Blocker ist aufgelöst; `abhaengigkeiten_klar=true` setzen
  - `state=OPEN` → PR-ID in `depends_on` als Prosa notieren (kein FK möglich)

**Positiv-Anker:** Ein Ticket mit `depends_on` nicht NULL **und** in der Beschreibung
`BLOCKIERT VON:` **und** der referenzierte PR `state=MERGED` → `depends_on` bleibt
unverändert (der Blocker wurde bereits formal erfasst).

### Step 1.1: Fetch open tickets (enriched)

**MCP-first** (`mcp-postgres`, read-only): pass the query below to `mcp__mcp-postgres__query({ sql: "…" })`. Fallback: `psql -c "<query>"` via the `psql()` helper above.

> **JSON-Ausgabe statt Pipe-Spalten [T002422].** Früher lieferte die Query
> `psql -t`-Spalten mit `-A -F '|'`. Lange Titel verschoben die Spalten, sodass
> `desc_len` Titelfragmente und `priority` den `created_at`-Wert enthielt. Die
> JSON-Ausgabe unten ist spaltenausrichtungsinvariant — das Ergebnis wird mit
> `jq -r '.result[]'` verarbeitet, nicht mit Split-by-Pipe.

> **Das `ORDER BY` steht INNERHALB des Aggregats [T002481].** Mit einem äußeren
> `ORDER BY` scheitert die Query an einem GROUP-BY-Fehler: `json_agg` aggregiert
> über alle Zeilen, die Sortierspalten liegen danach nicht mehr einzeln vor.
> `json_agg(… ORDER BY …)` ist die gültige Form und erhält zugleich die eine
> JSON-Zeile aus T002422 — der äußere `ORDER BY` war der Fehler, nicht die
> Aggregation.

```sql
SELECT json_agg(json_build_object(
  'external_id', external_id,
  'title', title,
  'type', type,
  'status', status,
  'priority', priority,
  'severity', severity,
  'component', component,
  'areas', areas,
  'depends_on', depends_on,
  'attention_mode', attention_mode,
  'planning_rank', planning_rank,
  'readiness', readiness,
  'desc_len', COALESCE(length(trim(description)), 0),
  'created_at', created_at::text
) ORDER BY CASE priority WHEN 'hoch' THEN 1 WHEN 'mittel' THEN 2 WHEN 'niedrig' THEN 3 ELSE 4 END,
           created_at ASC)::text AS result
FROM tickets.tickets
WHERE status NOT IN ('done','archived')
  -- [T002375-p6] E2E-Testdaten ausschliessen. T002348 tauchte im Triage auf und kostete
  -- eine volle Untersuchungsschleife — es war kein Fehler: Titel und Beschreibung stammen
  -- woertlich aus einer inzwischen geloeschten E2E-Testdatei (historischer Beleg), und der
  -- Marker-Mechanismus aus T001453 hatte korrekt gegriffen (is_test_data = true). Diese
  -- Query filterte ihn nur nicht, obwohl der Produktivcode es durchgaengig tut (siehe
  -- website/src/pages/sdlc/api/cockpit/container-count.ts:16).
  AND is_test_data = false;
```

> **Die Uebersichtstabelle darf kuerzen — vor jedem Dispatch wird die Beschreibung
> VOLLSTAENDIG gelesen [T002338-M1].** Die Triage-Abfrage lief einmal mit
> `left(description, 700)`. Bei T002308 stand der entscheidende Hinweis jenseits der 700
> Zeichen: der Fix sei bei einem anderen Ticket ohnehin mit abzuhandeln. Genau das trat
> ein — Kosten: ein Worktree, ein Agent-Lauf, rund 134k Token.
>
> Der Grund ist strukturell und nicht auf dieses eine Ticket beschraenkt: **Tickets tragen
> ihre wichtigsten Einschraenkungen typischerweise am ENDE der Beschreibung** — dort landet,
> was beim Schreiben zuletzt einfiel, und das ist oft die Abgrenzung.

### Step 1.2: Compute the `missing[]` list per ticket

**Tier A — every ticket** (a NULL/empty here is a gap):
- `priority IS NULL` → `priority`
- `type = 'fix' AND severity IS NULL` → `severity`
- `desc_len < 30` → `description` (too thin to act on)
- `component IS NULL AND (areas IS NULL OR areas = '{}')` → `area/component`

**Tier B — only `type='feat' AND status='planning'`** — for each DoR flag not `true` in `readiness`, add `dor:<flag>`. `dorScore < 4` ⇒ incomplete. (A feature can also still hit Tier-A gaps.)

A ticket with an empty `missing[]` is **ready**. *Do not touch `in_progress` tickets referencing a live plan branch.*

### Step 1.3: Load OpenSpec status & render the triage table

```bash
OMAP_FILE="$REPO/website/src/data/openspec-status.json"
[[ -f "$OMAP_FILE" ]] || bash "$REPO/scripts/openspec-status-map.sh"   # regen if missing
get_openspec_status() { jq -r --arg id "$1" '.[$id] // [] | map("\(.status):\(.slug)") | join(", ")' "$OMAP_FILE" 2>/dev/null || echo ""; }
```

Render one row per ticket with a `missing[]` column (use `get_openspec_status "$ext_id"`, `—` when empty):
```
T000953 | Cockpit Fullscreen   | plan_staged | hoch    | DoR 4/4 | —              | READY
T000959 | Status-Badge         | planning    | mittel  | DoR 2/4 | spec, aufwand  | READY (openspec…)
T000738 | Unbekanntes Feature  | backlog     | niedrig | —       | description    | needs_human?
```

### Step 1.4: Classify (resolution × completeness)
- **Already resolved** (PR merged, work shipped): mark `done` + `fixed` (or `shipped` for features), cite the PR.
- **Obsolete** (e.g. decommissioned service): mark `done` + `obsolete`.
- **Ready** (`missing[]` empty): eligible for the Phase 3 masterplan. If it is an AI-fixable feature/bug with no human decisions left, set `attention_mode='ai_ready'`.
- **Incomplete** (`missing[]` non-empty): if the gaps are AI-fillable (e.g. auto-triage can guess priority/severity/component), fill them and re-check. If a gap genuinely needs your judgement, set `attention_mode='needs_human'` — it becomes a candidate for Phase 2.

*Phase-1 writes are bookkeeping only* — `attention_mode`, and `done`/`obsolete` for tickets with **cited** merge/decommission evidence. Anything ambiguous is left untouched and surfaces as a Phase-2 question. The only approval-gated action in this whole skill is the wave-1 dispatch in Step 3.5.

---

## Phase 2 — Human Escalation Round

Escalate to the user **only for significant decisions** that AI cannot resolve autonomously: ambiguous business impact, unclear scope boundaries, multi-area conflicts without clear owner. All other tickets proceed with AI-decided values. Use subagent dispatch when validation/clarification requires domain expertise.

### Step 2.1: Select escalation set (filtered, capped)
Eligible = `missing[]` non-empty **AND** (`attention_mode = 'needs_human'` OR ambiguous severity/component/areas). Escalate at most ~3 tickets per round for human decision. All others proceed autonomously with AI-decided values.

### Step 2.2: Subagent Dispatch for Validation
For autonomous decisions, dispatch specialized subagents to validate and enrich ticket data in parallel:
- `bachelorprojekt-test` → test-related tickets (severity, areas)
- `bachelorprojekt-infra` → infra/security/deploy tickets
- `bachelorprojekt-security` → secrets/OIDC/tickets
- `bachelorprojekt-website` → website/frontend/admin tickets
- `database-specialist` → DB/schema tickets

Each subagent returns validated severity, component, areas, and readiness flags. Consolidate results before proceeding to Phase 3.
(`planning_rank = 0` is the explicitly **promoted next-candidate** — `planning-office.ts::promoteItem` sets it; `NULL`/large ranks mean *not* promoted.)
Process at most **~6 tickets per round**, highest priority first. Any eligible ticket beyond the cap is listed explicitly as **DEFERRED** in your summary — never silently dropped.

### Step 2.3: Derive the questions

Mirror `website/src/lib/sdlc/clarification-questions.ts` (`deriveSections`) — the source of truth. Map each gap to a concrete question:

| Gap | Question(s) |
|---|---|
| `dor:abhaengigkeiten_klar` | Welche Tickets müssen vorher fertig sein? Externe Dienste nötig (DB-Schema / Sealed-Secret / OIDC-Client)? |
| `dor:spec_skizziert` | Kern-Flow / Hauptablauf? Was ist explizit NICHT im Scope? |
| `dor:offene_fragen_geklaert` | Bereichsspezifisch nach `areas` — brett (Rollen/Mobile/Disconnect), website (Routen/Auth), chat (Realtime/Scope), infra (Brands/Deploy), auth (Flow/Claims), ai (Modell-Klasse/Fallback). Keine `areas` → generisch: offene Fragen + Akzeptanzkriterium. |
| `dor:aufwand_geschaetzt` | Aufwand: klein / mittel / gross? |
| `priority` / `severity` | Priorität (hoch/mittel/niedrig)? Severity (critical/major/minor/trivial)? |
| `area/component` | Welcher Bereich/Component ist betroffen? |

### Step 2.4: Ask via the interactive question tool
Use the framework-appropriate question tool:
- **Claude Code:** `AskUserQuestion` — one round per ticket (≤4 questions per call), in priority order. Use the radio/checkbox option sets from `clarification-questions.ts` where they exist; free-text otherwise.
- **opencode:** `question` tool — same workflow, same constraints.
If you are running without an interactive question tool (e.g. dispatched as a subagent without one), fall back to one consolidated plain-text question per ticket.

### Step 2.5: Write answers back to the DB

**MCP-first** (`ticket-mcp` lifecycle, where a wrapper exists — these shell out to `ticket.sh`, the sanctioned write path, NOT via the read-only `mcp-postgres`): set DoR flags via `set_readiness_flag` (one per flag) or `prepare_feature`; set effort/areas/depends_on via `set_plan_meta`; append the clarification comment via `add_comment`.

> `mcp__ticket-mcp__set_readiness_flag({ id: "T000XXX", flag: "spec_skizziert", value: true })`
> `mcp__ticket-mcp__set_plan_meta({ id: "T000XXX", effort: "mittel", depends_on: "T000YYY" })`
> `mcp__ticket-mcp__add_comment({ id: "T000XXX", body: "## Klärungsrunde …" })`

**CLI path** (ticket-mcp nicht erreichbar, oder im Worktree — `ticket.sh` ist dasselbe Backend, das auch der MCP-Wrapper ruft): Der korrekte Subcommand heisst `add-comment` (nicht `comment`):

> ```bash
> bash scripts/ticket.sh add-comment --id T000XXX --body "## Klärungsrunde …"
> ```

> ⚠️ `add-comment` ist der einzige CLI-Weg — `bash scripts/ticket.sh comment` existiert nicht und scheitert mit `Unknown command`.

**psql-Fallback** (weder MCP noch `ticket.sh` verfügbar — nur für Bulk-Operationen oder Felder ohne Wrapper, z.B. ein direkter `priority`-Set + JSONB-Readiness-Merge). Der psql-Pfad erfordert manuelle `author_label`-Setzung und ist fehleranfälliger als die beiden vorigen Wege. Per ticket:

```bash
psql -c "
UPDATE tickets.tickets
   SET readiness   = COALESCE(readiness,'{}'::jsonb) || '{"spec_skizziert":true,"aufwand_geschaetzt":true}'::jsonb,
        effort      = 'mittel',
        depends_on  = ARRAY['T000YYY'],
        priority    = 'hoch',
        updated_at  = now()
 WHERE external_id = 'T000XXX';
-- AUTHOR_LABEL: Set platform-agnostic. Claude Code → 'claude-code', opencode → 'opencode'
INSERT INTO tickets.ticket_comments (ticket_id, author_label, body, visibility)
SELECT id, 'claude-code',
       E'## Klärungsrunde $(date +%F)\n| Frage | Antwort |\n|---|---|\n| Kern-Flow | … |\n| Aufwand | mittel |',
       'internal'
  FROM tickets.tickets WHERE external_id = 'T000XXX';"
```
After write-back, re-run the Tier-A/Tier-B check on those tickets — the ones now at `missing[] = []` join the ready set for Phase 3.

---

## Phase 3 — Parallelization Masterplan

Take the **ready** tickets (empty `missing[]`, AI-actionable) and plan the maximum safe parallelism.

### Step 3.1: Build the dependency graph
Edges come from two sources — merge both:
- `depends_on` array (already fetched in 1.1): `B.depends_on = [A]` ⇒ edge `A → B`.
- `ticket_links`:
  ```sql
  SELECT f.external_id AS a, t.external_id AS b, l.kind
  FROM tickets.ticket_links l
  JOIN tickets.tickets f ON f.id = l.from_id
  JOIN tickets.tickets t ON t.id = l.to_id
  WHERE l.kind IN ('blocks','blocked_by');
  ```
  `kind='blocks'` ⇒ `a → b` (a must finish first). `kind='blocked_by'` ⇒ `b → a`.

**Soft conflict edges:** two ready tickets that share any `areas` entry have a file-collision risk → they may not sit in the **same** wave (serialise them). This is conservative by design (the approved heuristic); flag it rather than hide it.

### Step 3.2: Topologically sort into waves
- **Wave N** = every ready ticket whose hard dependencies are all satisfied by waves `< N` **and** which has no `areas` conflict with another ticket already placed in wave N.
- **Maximise wave width** (the goal is "as much in parallel as possible") subject to those two constraints.
- Order ties by `priority` (hoch > mittel > niedrig), then smaller `effort` first (quick wins).
### Step 3.3: Pre-Check — Lock-Status der Wave-1-Tickets prüfen

> **Pre-Check-Invariante [T002422]:** Vor dem ersten `claim`-Aufruf wird für jedes Wave-1-Ticket
> `agent-lock.sh check ticket <id>` ausgeführt. Bereits belegte Tickets (Status `held`) werden
> vor dem Worktree-Setup gemeldet und zurückgestellt — teure Worktree-Erstellung für blockierte
> Tickets entfällt. [T002424]
>
> **Lock-Scope-Vollständigkeit [T002498-M6]:** `check ticket <id>` allein greift strukturell
> nicht: die dev-flow-*-Skills locken BRANCH-scoped (`agent-lock.sh claim branch <branch>`),
> der ticket-Scope bleibt dabei leer (beobachtet bei T002497 — `check ticket` → `free`, der
> zugehörige Branch-Lock `fix/vitest-main-red-T002497` → `held`). Ein dev-flow-verarbeitetes
> Ticket meldet sich gegenüber ticket-ops also IMMER als frei. Der Pre-Check prüft deshalb
> BEIDE Scopes und zusätzlich die Lock-Bestände:

0. **Pre-Check:** For each wave-1 ticket, run `bash scripts/agent-lock.sh check ticket <ext-id>`.
   Collect all tickets that return `held` and report them:
   ```
   LOCK-KONFLIKT: T002XXX bereits gehalten von claude (sid …, worktree …, …)
   LOCK-KONFLIKT: T002YYY bereits gehalten von gemini (sid …, worktree …, …)
   ```
   Remove held tickets from the wave set. Proceed only with free tickets.

   **[T002498-M6] Scope-übergreifende Prüfung** — `check ticket` ergänzen um:
   ```bash
   # 1) Branch-Scope des geplanten Arbeitstickets (dev-flow-*-Skills locken hier).
   bash scripts/agent-lock.sh check branch "fix/<slug>-<ext-id>"   # "held" → LOCK-KONFLIKT
   # 2) Jeden Lock-Bestand nach der Ticket-ID durchsuchen — Locks JEDES Scopes,
   #    deren Branch- oder Worktree-Feld die ID trägt.
   bash scripts/agent-lock.sh list | grep -E "<ext-id>"
   # 3) Dirty Worktrees mit der ID im Verzeichnisnamen (der einzige verlässliche
   #    Beleg für ungestaged Arbeit einer laufenden Session).
   for wt in .worktrees/*"<ext-id>"*; do [ -d "$wt" ] && { git -C "$wt" status --porcelain | grep -q . \
     && echo "DIRTY-WORKTREE: $wt"; }; done
   ```

### Step 3.4: Route each ticket (plan vs. execute with subagent orchestration)

The dev-flow contract splits the parallel unit, orchestrated by all available subagents:
- `status = 'plan_staged'` → **execution wave**: dispatch `dev-flow-execute` via relevant subagent (`website-specialist`, `bachelorprojekt-test`, etc.)
- `attention_mode = 'ai_ready'` / DoR-complete → **planning wave**: dispatch `dev-flow-plan` via domain-specific subagent for plan creation and staging
- **Any other ready ticket** → **parallel planning wave**: all available subagents work in parallel to create plans, set readiness flags, stage branches. No ready ticket is left without a route or owner.

Any subagent that lands a `type='feat'` ticket in `status='backlog'` must, in the same pass, populate `requirements_list` and > **Wichtig [T002471-M3]:** Vor `lastenheft lock` muss `requirements_list` gefüllt sein:
>   `bash scripts/ticket.sh plan-meta set --id <id> --requirements "req1|req2|req3"`
>   Trennzeichen ist `|` (Pipe), nicht Komma. Bei leerer `requirements_list` schlägt `lastenheft lock` fehl.
 A ticket without the lock is invisible to `queue.sh`/`dispatcher-bridge.sh` and will silently never dispatch.

All subagents report back with: ticket_id, decisions made, branch created, plan staged, **lastenheft locked (y/n)**. Consolidate for Phase 3 masterplan completion.

### Step 3.5: Present the masterplan
```
WELLE 1  (parallel · keine offenen Abh.)
  T000953  Cockpit Fullscreen   hoch   area:website  plan_staged → execute (wt-A)
  T000801  DB-Index Backfill    hoch   area:db       plan_staged → execute (wt-B)
WELLE 2  (nach T000953)
  T000959  Status-Badge         mittel area:website  ai_ready    → plan    (wt-C)  ⊳ depends T000953
⚠ KONFLIKT: T000953 & T000961 beide area:website/admin → seriell (T000961 → Welle 2)
LOCK-KONFLIKTE: [T002424]  (erscheint nur bei Konflikten)
  T002XXX bereits gehalten von claude (sid …, label …, seit …)  → deferred
DEFERRED (needs_human, ungeklärt): T000738
```

### Step 3.6: Dispatch wave 1 (after the user approves)

For each remaining wave-1 ticket, in parallel (use `dispatching-parallel-agents`):
1. `bash scripts/agent-lock.sh claim ticket <ext-id> --branch <b> --worktree <wt> --label ticket-ops` (skip/coordinate on exit 1 — a live session already owns it).
2. Create the worktree: `bash scripts/worktree-create.sh <branch> .worktrees/<slug>`.
3. Hand to `dev-flow-execute` (plan_staged) or `dev-flow-plan` (unplanned) inside that worktree.

Merge = Abschluss: each ticket closes on its own green auto-merge; the masterplan tracks dispatch, not prod-live.

---

## Entscheidungshierarchie & Subagent-Matrix

### Decision Hierarchy

```
┌─────────────────────────────────────────────────────────────┐
│                    Open Tickets (N=17)                       │
└─────────────────────┬───────────────────────────────────────┘
                      │
          ┌───────────┴───────────────────────────────────────┐
          │                                                   │
    Autonomous AI Decisions                          Significant Human Decisions
    (severity/component/areas/readiness)                    ↑
          │                                                  │
    Dispatch subagents for validation &             └────────┘
    enrichment                                        Escalation gate
          │
    Set attention_mode = 'ai_ready' or              (ambiguous impact, unclear scope)
    add to missing[] list                          → needs_human flag
          │
          ▼
    Parallel execution across all subagents:
    - bachelorprojekt-test
    - bachelorprojekt-infra  
    - bachelorprojekt-website
    - database-specialist
    - security-specialist
          │
          ▼
    Consolidate decisions & set readiness flags
          │
          ▼
    Phase 3: Masterplan with ALL tickets → Plan staging
```

### Key Changes

1. **No more blanket escalation** — AI decides severity/component/areas/readiness autonomously using rubrics
2. **Human gate only for significant ambiguity** — unclear business impact or scope boundaries
3. **Full subagent fan-out** — all available subagents work in parallel to complete planning/staging
4. **All tickets to plan_staged** — no backlog waiting, every ticket gets a domain expert assigned

### Subagent Responsibilities Matrix

| Ticket Type | Primary Subagent | Validation Scope |
|-------------|------------------|------------------|
| test/FA-* / BATS | bachelorprojekt-test | Severity rubric, areas (ci/tests) |
| infra/deploy/sealed-secret | bachelorprojekt-infra | Component mapping, severity |
| security/OIDC/secrets | bachelorprojekt-security | Severity escalation threshold |
| website/admin/frontend | bachelorprojekt-website | Areas extraction, component |
| database/schema/query | database-specialist | Severity rubric for DB impact |
| chat/realtime | (domain subagent) | Scope validation |
