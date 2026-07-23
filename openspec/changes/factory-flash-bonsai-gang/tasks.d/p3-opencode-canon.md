# p3-opencode-canon — opencode-Gang-Kanon (Repo-SSOT für den Sync)

Rolle: `impl`. Requirement: **REQ-SF-OPENCODE-CANON-001**. Hebt die Gang-Zielkonfiguration aus der
**globalen** Host-Config (`~/.config/opencode/opencode.jsonc`) in den **Repo-Kanon**
(`.opencode/agent-models.jsonc`), damit `scripts/opencode-sync-agents.sh` die Config beim nächsten
Lauf **verteilt statt löscht** (Befund B5/B6). Konkret: `orchestrator`-Agent + `bonsai-8b-4` +
`permission.task`-Modell ergänzen, den Modell-ID-Bug `TQ2_0→Q2_0` in allen Blöcken fixen (D5/B7),
den neuen Orchestrator-Systemprompt anlegen und die Stale-Doku (»4 parallel«/»-np 3«) auf den
Ist-Zustand korrigieren (D-Goal, B8).

**Disjunkt zu p1/p2/p4/p5.** `scripts/opencode-sync-agents.sh` wird **NICHT** angefasst — es liest die
Quelle generisch (Z.28-32: `.[1].agent = .[0].agent`, kompletter Overwrite aus der Repo-Quelle); genau
deshalb muss der Repo-Kanon **alle** Ziel-Agenten enthalten, sonst würde der Sync `orchestrator`
wieder aus der globalen Config entfernen. **Kein** `task test:*`-Final-Verify (lebt im `tasks.md`-Index),
**kein** RED-Failing-Test-Step (lebt in `p5-tests`). Jeder Task endet mit einem konkreten lokalen
Prüf-Step.

## S1-Zeilenbudgets

`.opencode/agent-models.jsonc` (jsonc) und die beiden `.md`-Dateien sind **S1-ungated** (nicht in der
Extension-Limit-Tabelle, `intel: s1_limit=0`, unbaselined) — kein Zeilenbudget wird behauptet. Trotzdem
bleiben die Diffs minimal-invasiv (nur die genannten Anker). **S3:** keine Brand-Domain-Literale
(`127.0.0.1:18235` ist localhost, kein Brand-Host — zulässig). **S4:** die neue
`.opencode/prompts/orchestrator.md` ist über den `prompt`-Verweis des `orchestrator`-Agenten (Task 4)
erreichbar — kein Orphan.

### jsonc-Kommentar-Fußangel (Pflicht)

`opencode-sync-agents.sh` strippt **nur ganzzeilige** `//`-Kommentare (`sed -E 's/^[[:space:]]*\/\/.*$//'`),
**keine** Inline-Kommentare hinter JSON-Werten. Jeder in dieser Partial neu/geänderte Kommentar MUSS auf
einer **eigenen Zeile** stehen — ein Inline-`// …` hinter einem Wert bricht den `jq`-Parse im Sync.

---

## Task 1: `.opencode/agent-models.jsonc` — Modell-ID-Fix `TQ2_0 → Q2_0` (D5/B7)

`Ternary-Bonsai-8B-TQ2_0.gguf` hat im Fork-Build keine CUDA-Kernel ⇒ stiller CPU-Fallback (12,8 statt
185 tok/s, T002111). Alle **vier** Vorkommen auf `Ternary-Bonsai-8B-Q2_0.gguf` umstellen: der
Provider-Model-Key (`llama-bonsai-server`, Z.41) und die drei Agent-`model`-Referenzen
(`bonsai-8b-1/2/3`, Z.129/139/149). Der Provider-Anzeigename (Z.42) sagt bereits »Q2_0«, nur der
Datei-Key driftet — Key **und** die Agent-Refs müssen deckungsgleich bleiben, sonst zeigt ein Agent auf
ein nicht existentes Modell.

- [ ] Z.41 Provider-Model-Key `"Ternary-Bonsai-8B-TQ2_0.gguf"` → `"Ternary-Bonsai-8B-Q2_0.gguf"`.
- [ ] Z.129/139/149 Agent-`model` `"llama-bonsai-server/Ternary-Bonsai-8B-TQ2_0.gguf"` →
      `"llama-bonsai-server/Ternary-Bonsai-8B-Q2_0.gguf"` (drei identische Ersetzungen).

**Verify:**

```bash
grep -c "TQ2_0" .opencode/agent-models.jsonc
# erwartet: 0 (kein TQ2_0-Rest)
grep -c "Ternary-Bonsai-8B-Q2_0.gguf" .opencode/agent-models.jsonc
# erwartet: >=4 (Provider-Key + 3 Agent-Refs; nach Task 3 mehr)
sed -E 's/^[[:space:]]*\/\/.*$//g' .opencode/agent-models.jsonc | jq empty && echo "jsonc valid"
# erwartet: "jsonc valid"
```

---

## Task 2: `.opencode/agent-models.jsonc` — Stale `-np 3`-Kommentar auf Ist-Zustand (B8/D-Goal)

Der `agent`-Block-Kommentar Z.119-125 behauptet »-np 3: 2 physische + 1 oversubscribed Slot« — das ist
Drift. Ist-Zustand: der Server läuft `-np 1` (ein Slot, exklusiver 65k-Kontext), physische Parallelität
ist per llm-proxy-`max_inflight` (p4) konfigurierbar, **Default seriell**. Kommentar entsprechend
umschreiben; die Aussage »die N Namen erlauben dem Orchestrator explizite `task`-Parallel-Dispatches«
bleibt (strukturell korrekt), nur die Slot-Zahl-Behauptung wird korrigiert. Kommentar bleibt
**ganzzeilig** (Fußangel oben).

- [ ] Z.119-125 ersetzen durch einen ganzzeiligen Kommentarblock, der festhält: 4 gleich konfigurierte
      Agent-Namen; **ein** llama-Server-Slot (`-np 1`, kein shared KV); konkurrierende `bonsai-8b-*`
      serialisieren in der llm-proxy-Queue; physische Parallelität via `max_inflight` (p4), Default 1 =
      seriell; die Namen existieren, damit der Orchestrator sie als unabhängige `task`-Ziele dispatchen
      kann.

```jsonc
    // 4 gleich konfigurierte Agent-Namen statt einem "bonsai-8b" - alle reden
    // mit demselben llama-server (:8093, -np 1: EIN Slot, exklusiver 65k-Kontext,
    // kein shared KV). Konkurrierende bonsai-8b-* serialisieren in der llm-proxy-
    // Queue (scripts/llm-proxy); physische Parallelitaet ist per Backend-Spalte
    // max_inflight konfigurierbar (Default 1 = seriell, s. factory-flash-bonsai-
    // gang p4). Die 4 Namen existieren, damit der Orchestrator sie explizit als
    // unabhaengige `task`-Ziele dispatchen kann, statt sich auf undokumentiertes
    // Verhalten bei mehrfachem `task` auf denselben Namen zu verlassen.
```

**Verify:**

```bash
grep -c "np 3\|oversubscribed" .opencode/agent-models.jsonc
# erwartet: 0 (Stale-Behauptung entfernt)
grep -q "max_inflight" .opencode/agent-models.jsonc && echo "ist-zustand dokumentiert"
# erwartet: "ist-zustand dokumentiert"
```

---

## Task 3: `.opencode/agent-models.jsonc` — `bonsai-8b-1/2/3` umnummerieren + `bonsai-8b-4` ergänzen

Die drei bestehenden Descriptions sagen »subagent 1/3…3/3«. Mit dem vierten Gang-Mitglied werden sie zu
»1/4…3/4«, und `bonsai-8b-4` kommt hinzu (Color `#D97706` aus der globalen Vorlage; sonst identisch zu
1-3: `mode:"subagent"`, `model:"llama-bonsai-server/Ternary-Bonsai-8B-Q2_0.gguf"`,
`prompt:"{file:./prompts/local-subagent.md}"`, `temperature:0.4`, `steps:4`,
`permission:{ "edit":"allow","write":"allow","bash":"allow","task":"deny" }`).

> **Trade-off (bewusst):** Die globale Vorlage formuliert die Descriptions mit »shared KV pool, up to 4
> in parallel« — genau die Drift, die Task 2/6 korrigieren. Deshalb wird **nicht** dieser Wortlaut
> übernommen, sondern der bereits akkurate Repo-Wortlaut (»single-slot server – requests serialize in
> the llm-proxy queue, exclusive 65k ctx, no shared KV«) beibehalten und nur die Zähler `x/3→x/4`
> angepasst; `bonsai-8b-4` spiegelt exakt diesen akkuraten Wortlaut. **Deckungsgleich** mit der Vorlage
> ist damit die *Struktur* (4 bonsai-Agenten, gleiche Modell-/Permission-Werte), nicht die driftende
> Prosa. `permission.task` bleibt `"deny"` (Repo-Konvention: Subagenten dispatchen nicht weiter — die
> globale Vorlage lässt `task` weg, was faktisch dasselbe Ergebnis hat).

- [ ] `bonsai-8b-1/2/3`: in der `description` je `subagent 1/3`→`1/4`, `2/3`→`2/4`, `3/3`→`3/4`
      (nur der Zähler; restlicher Text unverändert).
- [ ] Nach dem `bonsai-8b-3`-Objekt (schließende `},` Z.155), **vor** dem `deepseek-helper`-Kommentar
      (Z.156), das `bonsai-8b-4`-Objekt einfügen (Wortlaut analog 1-3, `x/4`, Color `#D97706`).

```jsonc
    "bonsai-8b-4": {
      "description": "Write-capable subagent 4/4 on Ternary-Bonsai-8B (Q2_0, single-slot server - requests serialize in the llm-proxy queue, exclusive 65k ctx while running, no shared KV). Preferred for all write-capable delegation.",
      "mode": "subagent",
      "model": "llama-bonsai-server/Ternary-Bonsai-8B-Q2_0.gguf",
      "prompt": "{file:./prompts/local-subagent.md}",
      "color": "#D97706",
      "temperature": 0.4,
      "steps": 4,
      "permission": { "edit": "allow", "write": "allow", "bash": "allow", "task": "deny" }
    },
```

**Verify:**

```bash
sed -E 's/^[[:space:]]*\/\/.*$//g' .opencode/agent-models.jsonc \
  | jq -e '.agent | has("bonsai-8b-1") and has("bonsai-8b-2") and has("bonsai-8b-3") and has("bonsai-8b-4")' \
  && echo "4 bonsai-Agenten vorhanden"
# erwartet: "4 bonsai-Agenten vorhanden"
grep -c "4/4\|3/4\|2/4\|1/4" .opencode/agent-models.jsonc
# erwartet: 4 (alle vier Descriptions umnummeriert)
```

---

## Task 4: `.opencode/agent-models.jsonc` — `orchestrator`-Agent + `permission.task`-Modell (B5/B6)

Der Primary-Orchestrator (deepseek-v4-flash, temp 0.2, 50 steps) fehlt bislang im Repo-Kanon und würde
beim nächsten Sync aus der globalen Config **gelöscht**. Ihn ergänzen — inhaltlich deckungsgleich mit
der globalen Vorlage (`~/.config/opencode/opencode.jsonc` Z.311-325). Der `prompt`-Verweis folgt der
**exakten** Konvention der bestehenden Agent-Einträge (`{file:./prompts/<name>.md}`, relativ zu
`.opencode/`, vgl. Z.130/165) — **nicht** `.opencode/prompts/…`. `permission.task` mit Glob-Allow für
die Gang. Einfügen nach dem `deepseek-helper`-Objekt (schließende `}` Z.169), vor der finalen `}` des
`agent`-Blocks.

> **Scope-Hinweis:** Die globalen Top-Level-Keys `"model"`/`"default_agent":"orchestrator"` (Z.237/238)
> werden **nicht** in den Repo-Kanon übernommen — der Sync mergt ausschließlich `.agent` und `.provider`
> (Z.29-30), Top-Level-Keys der globalen Config bleiben unangetastet erhalten. Ein `default_agent` im
> Repo-Kanon wäre wirkungslos.

- [ ] `orchestrator`-Objekt nach `deepseek-helper` einfügen (Komma nach dessen `}` ergänzen).

```jsonc
    "orchestrator": {
      "description": "Primary orchestrator: DeepSeek V4 Flash (1M ctx) dispatches the bonsai-8b gang (up to 4 task-parallel streams) for implementation. Handles git/workflow/CI checkpoints. Tab-selectable via Tab key.",
      "mode": "primary",
      "model": "opencode-go/deepseek-v4-flash",
      "prompt": "{file:./prompts/orchestrator.md}",
      "color": "#8B5CF6",
      "temperature": 0.2,
      "steps": 50,
      "permission": {
        "task": {
          "bonsai-8b-*": "allow",
          "deepseek-helper": "allow"
        }
      }
    }
```

**Verify:**

```bash
sed -E 's/^[[:space:]]*\/\/.*$//g' .opencode/agent-models.jsonc | jq empty && echo "jsonc valid"
# erwartet: "jsonc valid" (Kommata/Klammern korrekt)
sed -E 's/^[[:space:]]*\/\/.*$//g' .opencode/agent-models.jsonc \
  | jq -er '.agent.orchestrator | .mode + " " + .model + " " + .prompt'
# erwartet: "primary opencode-go/deepseek-v4-flash {file:./prompts/orchestrator.md}"
sed -E 's/^[[:space:]]*\/\/.*$//g' .opencode/agent-models.jsonc \
  | jq -e '.agent.orchestrator.permission.task | has("bonsai-8b-*") and has("deepseek-helper")' \
  && echo "permission-task ok"
# erwartet: "permission-task ok"
```

---

## Task 5: `.opencode/prompts/orchestrator.md` (NEU) — Orchestrator-Systemprompt

Neue Datei nach der globalen Vorlage (`~/.config/opencode/prompts/orchestrator.md`) plus vier
Ergänzungen: (1) **Gang-Gating via `/admin/state`** des llm-proxy (`127.0.0.1:18235`) statt `/health` —
`/health` meldet nur Liveness, die Gang-Breite richtet sich nach `{inflight, max_inflight}`;
(2) **Partial-Disjunktheit** respektieren (ein Partial → ein bonsai, keine überlappenden Dateien, dem
`## Partials`-Manifest folgen); (3) **Eskalation an `deepseek-helper` nach 2 Fehlversuchen** pro Partial
(kein dritter lokaler Retry); (4) **Phase-Event-Konvention** referenzieren (`implement`-Events,
`detail`-JSON pro Subagent). Datei via S4 durch Task 4 referenziert.

- [ ] `.opencode/prompts/orchestrator.md` mit folgendem Inhalt anlegen:

```markdown
You are the **Orchestrator** (DeepSeek V4 Flash, 1M ctx on OpenCode Go). Your role is to orchestrate Bachelorprojekt development by dispatching bonsai-8b subagents for implementation work while you maintain the big-picture context.

## Dispatch Strategy

- Break every task into **disjoint** partial plans — no two subagents may touch the same file. Respect the `## Partials` manifest in the launch prompt: one partial → one bonsai-8b. Dispatch each to a separate agent via `task` — use bonsai-8b-1 through bonsai-8b-4 for up to 4 concurrent streams.
- Each bonsai-8b gets one self-contained goal with: files to touch, expected output, and acceptance criteria. Keep their context lean.
- **Physical serialization**: the four bonsai names share a single llama.cpp slot (`-np 1`) behind the llm-proxy. Concurrent `task` dispatches are structurally parallel but the proxy serializes them up to its per-backend `max_inflight` (default 1 ⇒ strictly serial). Do not assume wall-clock parallelism; assume correctness under any interleaving.
- **Gang gating**: before widening a gang, probe the llm-proxy admin surface `http://127.0.0.1:18235/admin/state` (NOT `/health`) and read the backend's `{inflight, max_inflight}`. Only add a concurrent stream when free in-flight capacity exists; otherwise dispatch sequentially. `/health` reports only liveness and must not be used to size the gang.
- **Escalation**: if a bonsai-8b fails the same partial **twice** (stuck, context-exhausted, or repeated error after local compaction/retry), do NOT retry a third time locally — escalate that partial to `deepseek-helper` via `task` with a compacted handoff (goal, done-so-far, stuck-point).
- Read-only exploration (code search, file reads) stays here. Only dispatch for write-capable implementation work.

## Observability (phase events)

Every implementation dispatch is a tracked `implement` phase event. Emit `implement entered` / `done` / `blocked` and record structured `detail` JSON per bonsai subagent — `{executor:"opencode", subagent:"bonsai-8b-N", partial:"pX", duration_s, exit}` — via the factory phase-event convention (`tickets.factory_phase_events`), so each subagent run is evaluable per cycle. A non-zero exit is a `blocked` event, never a silent fallback.

## Git & Workflow Checkpoints

Follow the Bachelorprojekt workflow rules from AGENTS.md:
- **Branches**: `feature/*`, `fix/*`, `chore/*`, `docs/*`. Never push directly to `main`.
- **Before committing**: inspect `git status`, `git diff`, `git log --oneline -10`. Stage only intended files. Never commit secrets.
- **Commits**: Conventional Commits format. If hooks reject, fix and recommit (no amend).
- **PRs**: Create via `gh-axi`. Verify status, diff, remote tracking, and base-branch diff first. Respect the `pr-ready` gate — no auto-merge during the executor trial.
- **CI gate**: Run `task test:changed` + `task freshness:check` + `task workspace:validate` before merge.
- **Merge = closure**: On green auto-merge, the ticket closes. Prod deploy is decoupled.

## Agent Coordination

- Start session: `bash scripts/agent-lock.sh reap` then `bash scripts/agent-lock.sh claim ticket <id> --branch <b> ...`
- End session: `bash scripts/agent-lock.sh release ticket <id>`
- Inter-agent messaging: `bash scripts/agent-msg.sh`

## Code Discovery

Use `codebase-memory-mcp` first (search_graph, trace_path, get_code_snippet, query_graph). Fall back to grep/glob for string literals, config values, shell scripts.

## Quality Gates (verify before merge)

- `task test:changed` — smart test selection
- `task freshness:check` — committed generated artifacts
- `task test:code-quality` — file-size caps, import-cycle, hardcoded-hostname scan
- Brett: `npm run typecheck --prefix brett && npm test --prefix brett && npm run build --prefix brett`
- Website: `npm --prefix website run test:unit`

## OpenSpec Lifecycle

- `/opsx:propose <slug>` → `/opsx:apply <slug>` → `/opsx:archive <slug>`
- Archival ONLY in worktree — never from main-checkout.
```

**Verify:**

```bash
test -f .opencode/prompts/orchestrator.md && echo "prompt-Datei angelegt"
# erwartet: "prompt-Datei angelegt"
grep -q "/admin/state" .opencode/prompts/orchestrator.md \
  && grep -q "disjoint" .opencode/prompts/orchestrator.md \
  && grep -q "twice" .opencode/prompts/orchestrator.md \
  && grep -q "factory_phase_events" .opencode/prompts/orchestrator.md \
  && echo "alle 4 Ergaenzungen vorhanden"
# erwartet: "alle 4 Ergaenzungen vorhanden" (Gang-Gating, Disjunktheit, 2-Fehlversuch-Eskalation, Phase-Events)
grep -c "mentolder.de\|korczewski.de" .opencode/prompts/orchestrator.md
# erwartet: 0 (S3: keine Brand-Domain-Literale)
```

---

## Task 6: `AGENTS.md` — Stale »4 parallel«-Zeile (Z.13) auf Ist-Zustand (B8/D-Goal)

Z.13 behauptet »4 parallel slots« und »max 4 parallel« — dieselbe Drift wie der jsonc-Kommentar. Auf
den Ist-Zustand korrigieren: ein Server-Slot (`-np 1`), Serialisierung über die llm-proxy-Queue, vier
**dispatchbare** Namen, physische Parallelität per `max_inflight` konfigurierbar (Default seriell).
Einzige geänderte Zeile; der `deepseek-helper`-Eintrag (Z.14) und die Sync-Zeile (Z.19) bleiben.

- [ ] Z.13 ersetzen:

```markdown
| `bonsai-8b-1..4` | Ternary-Bonsai-8B (Q2_0, 65k ctx, port 8093, server `-np 1` ⇒ serialized via llm-proxy; physical parallelism configurable via `max_inflight`) | **Preferred** for all write-capable delegation (4 dispatchable names, serial by default) |
```

**Verify:**

```bash
grep -c "4 parallel slots\|max 4 parallel" AGENTS.md
# erwartet: 0 (Stale-Behauptung entfernt)
grep -q 'server `-np 1`' AGENTS.md && grep -q "max_inflight" AGENTS.md && echo "ist-zustand dokumentiert"
# erwartet: "ist-zustand dokumentiert"
```

---

## Task 7: Sync-Verifikation — `opencode-sync-agents.sh` verteilt die Gang-Config (Akzeptanzkriterium »Agent sync propagates«)

Nach den Edits (Task 1-6) den Sync ausführen und beweisen, dass er den Repo-Kanon in die globale Config
**verteilt statt löscht**. Der Sync mutiert ausschließlich die maschinen-lokale, gitignorierte
`~/.config/opencode/opencode.jsonc` (kein Repo-Diff) und kopiert `.opencode/prompts/*.md` in
`~/.config/opencode/prompts/` — das ist der bestimmungsgemäße Zweck des Skripts, kein Seiteneffekt. Ein
echter Dry-Run-Flag existiert im Skript nicht; die Verifikation läuft daher über den realen (idempotenten)
Sync plus `jq`-Assertions auf das Ziel.

- [ ] `bash scripts/opencode-sync-agents.sh` ausführen (exit 0).
- [ ] Zielkonfig enthält `orchestrator` + `bonsai-8b-1..4`; Ziel-`prompts/orchestrator.md` existiert.

```bash
bash scripts/opencode-sync-agents.sh
# erwartet: exit 0, "Successfully synced agent models …"

TGT="${OPENCODE_CONFIG:-$HOME/.config/opencode/opencode.jsonc}"
jq -e '.agent | has("orchestrator") and has("bonsai-8b-1") and has("bonsai-8b-2") and has("bonsai-8b-3") and has("bonsai-8b-4")' "$TGT" \
  && echo "Gang-Config propagiert (statt geloescht)"
# erwartet: true + "Gang-Config propagiert (statt geloescht)" — Akzeptanzkriterium des Scenarios "Agent sync propagates"

jq -er '.agent.orchestrator.mode' "$TGT"
# erwartet: "primary" (Primary-Orchestrator überlebt den Overwrite)

test -f "$(dirname "$TGT")/prompts/orchestrator.md" && echo "orchestrator-Prompt mitsynchronisiert"
# erwartet: "orchestrator-Prompt mitsynchronisiert"

jq -e '[.agent[].model] | map(select(test("TQ2_0"))) | length == 0' "$TGT" \
  && echo "keine Agent-Ref auf TQ2_0"
# erwartet: true — kein Agent zeigt auf TQ2_0 (der Sync-`*`-Provider-Merge kann einen
# TQ2_0-*Model-Key* der Alt-Config zurücklassen; die Agent-`model`-Refs müssen aber
# ausnahmslos auf Q2_0 zeigen, sonst löst der Agent kein existentes Modell auf).
```
