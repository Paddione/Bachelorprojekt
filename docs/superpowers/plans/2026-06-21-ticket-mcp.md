# ticket-mcp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Einen Node.js stdio MCP-Server bauen der `scripts/ticket.sh` als native MCP-Tools exponiert — inkl. Triage, Plan-Meta, Mishap-Bündelung (3-Pack-Trigger) und Backfill fehlender Ticket-IDs.

**Architecture:** Jedes MCP-Tool delegiert via `execFile` an `scripts/ticket.sh`. Zwei neue ticket.sh-Subcommands (`list`, `backfill-id`) werden zuerst ergänzt. Der Mishap-Buffer liegt unter `.git/mishap-buffer.json` und triggert automatisch bei ≥3 Einträgen ein klassifiziertes Ticket.

**Tech Stack:** Node.js 22+, `@modelcontextprotocol/sdk` (stdio transport), keine eigene pg-Verbindung, BATS für ticket.sh-Tests, Node.js `node:test` für MCP-Unit-Tests.

## Global Constraints

- ticket.sh bleibt **einzige DB-Schreibstelle** — kein direkter pg-Zugriff im MCP-Server
- `BRAND` default: `mentolder`; alle Tools akzeptieren optionalen `brand`-Parameter
- Node.js ≥ 22.13.0 (`.nvmrc` enforcement)
- Kein TypeScript, kein Build-Schritt — reines JavaScript (`"type": "module"` in package.json)
- Fehlende `external_id` → `isError: true` in MCP-Antwort, kein silent fail
- Mishap-Buffer unter `.git/mishap-buffer.json` (gitignored by default als `.git/`-Inhalt)
- OpenSpec-Proposal `openspec/changes/ticket-mcp/` wird in Task 8 angelegt

---

## File Map

| Datei | Aktion | Verantwortlichkeit |
|-------|--------|--------------------|
| `scripts/ticket-mcp/package.json` | Create | npm-Manifest, einzige Dep: `@modelcontextprotocol/sdk` |
| `scripts/ticket-mcp/server.js` | Create | MCP stdio entry point, Tool-Registrierung |
| `scripts/ticket-mcp/lib/run-ticket.js` | Create | execFile-Wrapper um ticket.sh, Error-Handling |
| `scripts/ticket-mcp/lib/mishap-buffer.js` | Create | Lesen/Schreiben `.git/mishap-buffer.json` |
| `scripts/ticket-mcp/tools/list.js` | Create | `list_tickets`, `get_ticket`, `export_tickets` |
| `scripts/ticket-mcp/tools/triage.js` | Create | `triage_ticket`, `backfill_ticket_id` |
| `scripts/ticket-mcp/tools/planning.js` | Create | `set_plan_meta`, `set_readiness_flag`, `prepare_feature` |
| `scripts/ticket-mcp/tools/lifecycle.js` | Create | `transition_status`, `add_comment`, `update_fields` |
| `scripts/ticket-mcp/tools/mishap.js` | Create | `report_mishap` + bundle-Klassifizierung |
| `scripts/vda/ticket/list.sh` | Create | neuer ticket.sh `list`-Subcommand |
| `scripts/vda/ticket/backfill-id.sh` | Create | neuer ticket.sh `backfill-id`-Subcommand |
| `scripts/ticket.sh` | Modify | `list` + `backfill-id` in case-Block registrieren |
| `tests/unit/ticket-mcp/run-ticket.test.js` | Create | Unit-Tests für run-ticket.js |
| `tests/unit/ticket-mcp/mishap-buffer.test.js` | Create | Unit-Tests für mishap-buffer.js + Bundle-Logik |
| `tests/spec/ticket-mcp.bats` | Create | BATS-Tests für ticket.sh list + backfill-id |
| `.opencode/opencode.jsonc` | Modify | ticket-mcp als local MCP eintragen |
| `.claude/settings.json` | Modify | ticket-mcp als stdio MCP eintragen |
| `.claude/skills/mishap-tracker/SKILL.md` | Modify | report_mishap via MCP statt direktem ticket.sh create |
| `openspec/changes/ticket-mcp/proposal.md` | Create | OpenSpec-Change für ticket-mcp |
| `openspec/changes/ticket-mcp/tasks.md` | Create | OpenSpec-Tasks-Datei |

---

## Task 1: Scaffold + run-ticket.js Wrapper

**Files:**
- Create: `scripts/ticket-mcp/package.json`
- Create: `scripts/ticket-mcp/server.js`
- Create: `scripts/ticket-mcp/lib/run-ticket.js`
- Create: `tests/unit/ticket-mcp/run-ticket.test.js`

**Interfaces:**
- Produces:
  - `runTicket(args: string[], env?: Record<string,string>): Promise<string>` — gibt stdout zurück, wirft bei exit ≠ 0
  - `server.js` — startet und hört auf stdio, registriert noch keine Tools (leerer Server)

- [ ] **Step 1: package.json anlegen**

```bash
mkdir -p scripts/ticket-mcp/lib scripts/ticket-mcp/tools tests/unit/ticket-mcp
```

Datei `scripts/ticket-mcp/package.json`:
```json
{
  "name": "ticket-mcp",
  "version": "1.0.0",
  "type": "module",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "test": "node --test ../../../tests/unit/ticket-mcp/*.test.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0"
  }
}
```

- [ ] **Step 2: Abhängigkeit installieren**

```bash
cd scripts/ticket-mcp && npm install
```

Erwartet: `node_modules/@modelcontextprotocol/sdk` vorhanden.

- [ ] **Step 3: Failing test für run-ticket.js schreiben**

Datei `tests/unit/ticket-mcp/run-ticket.test.js`:
```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runTicket } from '../../../scripts/ticket-mcp/lib/run-ticket.js';

describe('runTicket', () => {
  it('returns stdout on success', async () => {
    // ticket.sh get --id T000001 liefert JSON — wir mocken via FACTORY_DRY_RESOLVE
    process.env.FACTORY_DRY_RESOLVE = '1';
    // Stattdessen: teste mit einem harmlosen echo-Skript
    const result = await runTicket(['--version'], {
      TICKET_SH: '/usr/bin/bash',
      TICKET_SH_ARGS: '-c "echo ok"',
    });
    // run-ticket muss TICKET_SH env var respektieren für Tests
    assert.equal(result.trim(), 'ok');
    delete process.env.FACTORY_DRY_RESOLVE;
  });

  it('throws on non-zero exit', async () => {
    await assert.rejects(
      () => runTicket(['--invalid-flag-xyz'], {
        TICKET_SH: '/usr/bin/bash',
        TICKET_SH_ARGS: '-c "exit 1"',
      }),
      /exit code 1/
    );
  });
});
```

- [ ] **Step 4: Test ausführen — erwartet FAIL**

```bash
cd /home/patrick/Bachelorprojekt
node --test tests/unit/ticket-mcp/run-ticket.test.js 2>&1 | head -20
```

Erwartet: `Error: Cannot find module .../run-ticket.js`

- [ ] **Step 5: run-ticket.js implementieren**

Datei `scripts/ticket-mcp/lib/run-ticket.js`:
```js
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const execFileAsync = promisify(execFile);

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '../../../..');
const DEFAULT_TICKET_SH = path.join(REPO_ROOT, 'scripts', 'ticket.sh');

/**
 * Führt scripts/ticket.sh mit den gegebenen Argumenten aus.
 * Wirft einen Error mit stderr wenn exit code ≠ 0.
 * @param {string[]} args - Argumente für ticket.sh
 * @param {Record<string,string>} [extraEnv] - Zusätzliche Env-Variablen (z.B. BRAND)
 * @returns {Promise<string>} stdout
 */
export async function runTicket(args, extraEnv = {}) {
  const ticketSh = extraEnv.TICKET_SH ?? DEFAULT_TICKET_SH;
  const env = { ...process.env, ...extraEnv };
  delete env.TICKET_SH;

  try {
    const { stdout } = await execFileAsync('bash', [ticketSh, ...args], {
      env,
      maxBuffer: 10 * 1024 * 1024,
    });
    return stdout;
  } catch (err) {
    const msg = err.stderr?.trim() || err.message;
    throw new Error(`ticket.sh failed (exit code ${err.code}): ${msg}`);
  }
}
```

- [ ] **Step 6: Test erneut ausführen — erwartet PASS**

```bash
node --test tests/unit/ticket-mcp/run-ticket.test.js 2>&1
```

Erwartet: `✓ returns stdout on success`, `✓ throws on non-zero exit`

- [ ] **Step 7: Leeren MCP-Server anlegen**

Datei `scripts/ticket-mcp/server.js`:
```js
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new McpServer({
  name: 'ticket-mcp',
  version: '1.0.0',
});

// Tools werden in separaten Modulen registriert (Tasks 2–6)

const transport = new StdioServerTransport();
await server.connect(transport);
```

- [ ] **Step 8: Server startet ohne Fehler**

```bash
cd scripts/ticket-mcp && timeout 2 node server.js 2>&1 || true
```

Erwartet: kein Crash, ggf. `Timeout` nach 2s (wartet auf stdio-Input).

- [ ] **Step 9: Committen**

```bash
git add scripts/ticket-mcp/ tests/unit/ticket-mcp/run-ticket.test.js
git commit -m "feat(ticket-mcp): scaffold MCP server + run-ticket wrapper"
```

---

## Task 2: ticket.sh list-Subcommand + list_tickets / get_ticket Tools

**Files:**
- Create: `scripts/vda/ticket/list.sh`
- Modify: `scripts/ticket.sh` (registriere `list`)
- Create: `scripts/ticket-mcp/tools/list.js`
- Create: `tests/spec/ticket-mcp.bats`

**Interfaces:**
- Consumes: `runTicket(args, env)` aus `lib/run-ticket.js`
- Produces:
  - `ticket.sh list [--brand <b>] [--status <s>] [--type <t>] [--attention-mode <m>] [--missing-id]` → JSON-Array
  - `registerListTools(server)` — registriert `list_tickets` und `get_ticket` am MCP-Server

- [ ] **Step 1: BATS-Test schreiben**

Datei `tests/spec/ticket-mcp.bats`:
```bash
#!/usr/bin/env bats
# Tests für ticket.sh list + backfill-id Subcommands

setup() {
  export FACTORY_DRY_RESOLVE=1
  export BRAND=mentolder
  REPO="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
}

@test "ticket.sh list --dry-resolve exits 0" {
  run bash "$REPO/scripts/ticket.sh" list --brand mentolder
  [ "$status" -eq 0 ]
  echo "$output" | grep -q "DRY-RESOLVE"
}

@test "ticket.sh list rejects unknown brand" {
  unset FACTORY_DRY_RESOLVE
  # Ohne Cluster — nur Syntaxprüfung via dry-resolve
  export FACTORY_DRY_RESOLVE=1
  run bash "$REPO/scripts/ticket.sh" list --brand unknown-brand
  [ "$status" -ne 0 ]
}
```

- [ ] **Step 2: Test ausführen — erwartet FAIL**

```bash
./tests/runner.sh local ticket-mcp 2>&1 | head -30
```

Erwartet: `ticket.sh: unknown command: list`

- [ ] **Step 3: list.sh anlegen**

Datei `scripts/vda/ticket/list.sh`:
```bash
#!/usr/bin/env bash
# scripts/vda/ticket/list.sh — ticket list subcommand
source "$(dirname "${BASH_SOURCE[0]}")/_ticket-core.sh"

main() {
  local brand="${BRAND:-mentolder}" status="" type="" attention_mode="" missing_id=false

  while [[ $# -gt 0 ]]; do case "$1" in
    --brand)          brand="$2"; shift 2 ;;
    --status)         status="$2"; shift 2 ;;
    --type)           type="$2"; shift 2 ;;
    --attention-mode) attention_mode="$2"; shift 2 ;;
    --missing-id)     missing_id=true; shift ;;
    *)                echo "Unknown list option: $1" >&2; exit 2 ;;
  esac; done

  if [[ -n "${FACTORY_DRY_RESOLVE:-}" ]]; then
    echo "ticket list [DRY-RESOLVE]: brand=${brand}"
    exit 0
  fi

  local pod; pod=$(_pgpod)

  local where="brand = :'brand'"
  [[ -n "$status" ]]         && where+=" AND status = :'status'"
  [[ -n "$type" ]]           && where+=" AND type = :'type'"
  [[ -n "$attention_mode" ]] && where+=" AND attention_mode = :'attn'"
  [[ "$missing_id" == "true" ]] && where+=" AND external_id IS NULL"

  _exec_sql "$pod" \
    -v brand="$brand" \
    -v status="$status" \
    -v type="$type" \
    -v attn="$attention_mode" <<EOF
SELECT COALESCE(json_agg(json_build_object(
  'external_id', external_id, 'title', title, 'status', status,
  'type', type, 'priority', priority, 'severity', severity,
  'attention_mode', attention_mode, 'created_at', created_at::date
) ORDER BY created_at ASC), '[]')
FROM tickets.tickets
WHERE $where;
EOF
}

if [[ "\${BASH_SOURCE[0]}" == "\${0}" ]]; then
  main "\$@"
fi
```

- [ ] **Step 4: ticket.sh erweitern**

In `scripts/ticket.sh`, im `case "$cmd" in`-Block (Zeile ~690ff) hinzufügen:

```bash
  list)              cmd_list "$@" ;;
```

Und die Funktion `cmd_list` vor dem case-Block:

```bash
cmd_list() {
  source "$(dirname "${BASH_SOURCE[0]}")/vda/ticket/list.sh"
  main "$@"
}
```

- [ ] **Step 5: BATS-Test erneut ausführen — erwartet PASS**

```bash
./tests/runner.sh local ticket-mcp 2>&1
```

Erwartet: beide Tests grün.

- [ ] **Step 6: list_tickets + get_ticket MCP-Tools implementieren**

Datei `scripts/ticket-mcp/tools/list.js`:
```js
import { z } from 'zod';
import { runTicket } from '../lib/run-ticket.js';

export function registerListTools(server) {
  server.tool(
    'list_tickets',
    'Listet Tickets gefiltert nach Status, Typ, Brand oder fehlender ID.',
    {
      brand: z.string().optional().describe('mentolder oder korczewski (default: mentolder)'),
      status: z.string().optional().describe('z.B. triage, planning, plan_staged, backlog'),
      type: z.string().optional().describe('bug, feature, task, project'),
      attention_mode: z.string().optional().describe('auto, ai_ready, needs_human'),
      missing_id: z.boolean().optional().describe('Nur Tickets ohne external_id zurückgeben'),
    },
    async ({ brand = 'mentolder', status, type, attention_mode, missing_id }) => {
      const args = ['list', '--brand', brand];
      if (status) args.push('--status', status);
      if (type) args.push('--type', type);
      if (attention_mode) args.push('--attention-mode', attention_mode);
      if (missing_id) args.push('--missing-id');

      const raw = await runTicket(args, { BRAND: brand });
      return { content: [{ type: 'text', text: raw.trim() }] };
    }
  );

  server.tool(
    'get_ticket',
    'Gibt vollständige Details eines Tickets per external_id zurück.',
    {
      id: z.string().describe('external_id z.B. T000123'),
      brand: z.string().optional().describe('mentolder oder korczewski (default: mentolder)'),
    },
    async ({ id, brand = 'mentolder' }) => {
      const raw = await runTicket(['get', '--id', id], { BRAND: brand });
      return { content: [{ type: 'text', text: raw.trim() }] };
    }
  );

  server.tool(
    'export_tickets',
    'Exportiert Tickets als JSON oder Markdown (gleiche Filter wie list_tickets).',
    {
      brand: z.string().optional(),
      status: z.string().optional(),
      type: z.string().optional(),
      format: z.enum(['json', 'markdown']).optional().describe('json (default) oder markdown'),
    },
    async ({ brand = 'mentolder', status, type, format = 'json' }) => {
      const args = ['list', '--brand', brand];
      if (status) args.push('--status', status);
      if (type) args.push('--type', type);

      const raw = await runTicket(args, { BRAND: brand });

      if (format === 'markdown') {
        const tickets = JSON.parse(raw.trim());
        const md = tickets.map(t =>
          `- **${t.external_id ?? '(kein ID)'}** [${t.status}] ${t.title}`
        ).join('\n');
        return { content: [{ type: 'text', text: md || '_(keine Tickets)_' }] };
      }

      return { content: [{ type: 'text', text: raw.trim() }] };
    }
  );
}
```

- [ ] **Step 7: Tools in server.js einbinden**

In `scripts/ticket-mcp/server.js` ergänzen (vor `server.connect`):
```js
import { registerListTools } from './tools/list.js';
registerListTools(server);
```

- [ ] **Step 8: Manuell testen**

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | \
  node scripts/ticket-mcp/server.js 2>/dev/null | python3 -m json.tool | grep '"name"'
```

Erwartet: `list_tickets`, `get_ticket`, `export_tickets` in der Liste.

- [ ] **Step 9: Committen**

```bash
git add scripts/vda/ticket/list.sh scripts/ticket.sh \
        scripts/ticket-mcp/tools/list.js scripts/ticket-mcp/server.js \
        tests/spec/ticket-mcp.bats
git commit -m "feat(ticket-mcp): list/get/export tools + ticket.sh list subcommand"
```

---

## Task 3: backfill-id Subcommand + triage_ticket + transition_status

**Files:**
- Create: `scripts/vda/ticket/backfill-id.sh`
- Modify: `scripts/ticket.sh`
- Create: `scripts/ticket-mcp/tools/triage.js`

**Interfaces:**
- Consumes: `runTicket`, `registerListTools` (für `missing_id` Kombination)
- Produces:
  - `ticket.sh backfill-id [--brand <b>]` → JSON-Array reparieter IDs
  - `registerTriageTools(server)` — registriert `triage_ticket`, `backfill_ticket_id`

- [ ] **Step 1: BATS-Tests erweitern**

In `tests/spec/ticket-mcp.bats` anhängen:
```bash
@test "ticket.sh backfill-id --dry-resolve exits 0" {
  run bash "$REPO/scripts/ticket.sh" backfill-id --brand mentolder
  [ "$status" -eq 0 ]
  echo "$output" | grep -q "DRY-RESOLVE"
}
```

- [ ] **Step 2: Test ausführen — erwartet FAIL**

```bash
./tests/runner.sh local ticket-mcp 2>&1 | tail -5
```

Erwartet: `ticket.sh: unknown command: backfill-id`

- [ ] **Step 3: backfill-id.sh anlegen**

Datei `scripts/vda/ticket/backfill-id.sh`:
```bash
#!/usr/bin/env bash
# scripts/vda/ticket/backfill-id.sh — setzt external_id für Tickets mit NULL-ID
source "$(dirname "${BASH_SOURCE[0]}")/_ticket-core.sh"

main() {
  local brand="${BRAND:-mentolder}"
  while [[ $# -gt 0 ]]; do case "$1" in
    --brand) brand="$2"; shift 2 ;;
    *)       echo "Unknown backfill-id option: $1" >&2; exit 2 ;;
  esac; done

  if [[ -n "${FACTORY_DRY_RESOLVE:-}" ]]; then
    echo "ticket backfill-id [DRY-RESOLVE]: brand=${brand}"
    exit 0
  fi

  local pod; pod=$(_pgpod)

  _exec_sql "$pod" -v brand="$brand" <<'EOF'
UPDATE tickets.tickets
SET external_id = 'T' || LPAD(nextval('tickets.ticket_id_seq')::text, 6, '0'),
    updated_at  = now()
WHERE external_id IS NULL
  AND brand = :'brand'
RETURNING json_build_object('id', id, 'external_id', external_id, 'title', title);
EOF
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
```

- [ ] **Step 4: ticket.sh erweitern**

`cmd_backfill_id` Funktion und `backfill-id)` Case-Eintrag analog zu Task 2 / Step 4 hinzufügen:

```bash
cmd_backfill_id() {
  source "$(dirname "${BASH_SOURCE[0]}")/vda/ticket/backfill-id.sh"
  main "$@"
}
```

Im case-Block:
```bash
  backfill-id)       cmd_backfill_id "$@" ;;
```

- [ ] **Step 5: BATS-Test erneut ausführen — erwartet PASS**

```bash
./tests/runner.sh local ticket-mcp 2>&1
```

Erwartet: alle 3 Tests grün.

- [ ] **Step 6: triage.sh um --type + --attention-mode erweitern + in ticket.sh registrieren**

`scripts/vda/ticket/triage.sh` existiert bereits mit `--priority`, `--severity`, `--status`, `--apply`, `--no-comment`. Es fehlen `--type` und `--attention-mode`.

In `scripts/vda/ticket/triage.sh` im `while`-Argument-Parser ergänzen:
```bash
    --type)           type="$2"; shift 2 ;;
    --attention-mode) attention_mode="$2"; shift 2 ;;
```

Die lokalen Variablen oben in `main()` ergänzen:
```bash
local id="" priority="" severity="" status="" component="" type="" attention_mode="" suggest="false" apply="false" no_comment="false"
```

Im SQL-UPDATE Block (`UPDATE tickets.tickets SET ...`) die neuen Felder ergänzen:
```sql
UPDATE tickets.tickets
SET priority        = COALESCE(NULLIF(:'p',''), priority),
    severity        = COALESCE(NULLIF(:'s',''), severity),
    status          = COALESCE(NULLIF(:'st',''), status),
    component       = CASE WHEN :'c' <> '' THEN :'c' ELSE component END,
    type            = COALESCE(NULLIF(:'tp',''), type),
    attention_mode  = COALESCE(NULLIF(:'attn',''), attention_mode)
WHERE external_id = :'ext_id';
```

Und die `_exec_sql`-Parameter ergänzen: `-v tp="$type" -v attn="$attention_mode"`.

In `scripts/ticket.sh` cmd_triage Funktion und case-Eintrag hinzufügen:
```bash
cmd_triage() {
  export VDA_NONINTERACTIVE=1
  source "$(dirname "${BASH_SOURCE[0]}")/vda/ticket/triage.sh"
  main "$@"
}
```

Im case-Block:
```bash
  triage)            cmd_triage "$@" ;;
```

- [ ] **Step 7: triage.js implementieren**

Datei `scripts/ticket-mcp/tools/triage.js`:
```js
import { z } from 'zod';
import { runTicket } from '../lib/run-ticket.js';

export function registerTriageTools(server) {
  server.tool(
    'triage_ticket',
    'Setzt Triage-Felder eines Tickets: type, severity, priority, attention_mode, status.',
    {
      id: z.string().describe('external_id z.B. T000123'),
      brand: z.string().optional(),
      type: z.enum(['bug', 'feature', 'task', 'project']).optional(),
      severity: z.enum(['critical', 'major', 'minor', 'trivial']).optional(),
      priority: z.enum(['hoch', 'mittel', 'niedrig']).optional(),
      attention_mode: z.enum(['auto', 'ai_ready', 'needs_human']).optional(),
      status: z.string().optional().describe('Ziel-Status z.B. triage, planning, backlog'),
    },
    async ({ id, brand = 'mentolder', type, severity, priority, attention_mode, status = 'triage' }) => {
      // ticket.sh triage setzt priority/severity/status/type/attention_mode in einem SQL-UPDATE.
      // --apply aktiviert den non-interactive Modus; --no-comment unterdrückt den Auto-Kommentar.
      const args = ['triage', '--id', id, '--status', status, '--apply', '--no-comment'];
      if (priority)       args.push('--priority', priority);
      if (severity)       args.push('--severity', severity);
      if (type)           args.push('--type', type);
      if (attention_mode) args.push('--attention-mode', attention_mode);

      const raw = await runTicket(args, { BRAND: brand, VDA_NONINTERACTIVE: '1' });
      return { content: [{ type: 'text', text: raw.trim() }] };
    }
  );

  server.tool(
    'backfill_ticket_id',
    'Findet Tickets ohne external_id (T-Nummer) und setzt die nächste Sequenznummer.',
    {
      brand: z.string().optional().describe('mentolder oder korczewski (default: mentolder)'),
    },
    async ({ brand = 'mentolder' }) => {
      const raw = await runTicket(['backfill-id', '--brand', brand], { BRAND: brand });
      return { content: [{ type: 'text', text: raw.trim() || 'Keine Tickets ohne ID gefunden.' }] };
    }
  );
}
```

- [ ] **Step 7: triage.js in server.js einbinden**

```js
import { registerTriageTools } from './tools/triage.js';
registerTriageTools(server);
```

- [ ] **Step 8: triage.js in server.js einbinden**

```js
import { registerTriageTools } from './tools/triage.js';
registerTriageTools(server);
```

- [ ] **Step 9: Committen**

```bash
git add scripts/vda/ticket/triage.sh scripts/vda/ticket/backfill-id.sh scripts/ticket.sh \
        scripts/ticket-mcp/tools/triage.js scripts/ticket-mcp/server.js \
        tests/spec/ticket-mcp.bats
git commit -m "feat(ticket-mcp): triage extended + backfill-id + triage/backfill tools"
```

---

## Task 4: Planning Tools (set_plan_meta, set_readiness_flag) + lifecycle Tools

**Files:**
- Create: `scripts/ticket-mcp/tools/planning.js`
- Create: `scripts/ticket-mcp/tools/lifecycle.js`

**Interfaces:**
- Consumes: `runTicket`
- Produces:
  - `registerPlanningTools(server)` — `set_plan_meta`, `set_readiness_flag`
  - `registerLifecycleTools(server)` — `transition_status`, `add_comment`, `update_fields`

- [ ] **Step 1: planning.js implementieren**

Datei `scripts/ticket-mcp/tools/planning.js`:
```js
import { z } from 'zod';
import { runTicket } from '../lib/run-ticket.js';

export function registerPlanningTools(server) {
  server.tool(
    'set_plan_meta',
    'Setzt Planungs-Metadaten: value_prop, effort, areas, depends_on, planning_rank.',
    {
      id: z.string().describe('external_id z.B. T000123'),
      brand: z.string().optional(),
      value_prop: z.string().optional().describe('Kern-Nutzen des Features'),
      effort: z.enum(['klein', 'mittel', 'gross']).optional(),
      areas: z.string().optional().describe('Komma-separierte Bereiche z.B. auth,chat'),
      depends_on: z.string().optional().describe('Komma-separierte Ticket-IDs z.B. T000100,T000101'),
      rank: z.number().int().optional().describe('Planungs-Rang (niedrig = höhere Prio)'),
    },
    async ({ id, brand = 'mentolder', value_prop, effort, areas, depends_on, rank }) => {
      const args = ['plan-meta', 'set', '--id', id];
      if (value_prop) args.push('--value-prop', value_prop);
      if (effort)     args.push('--effort', effort);
      if (areas)      args.push('--areas', areas);
      if (depends_on) args.push('--depends-on', depends_on);
      if (rank != null) args.push('--rank', String(rank));

      const raw = await runTicket(args, { BRAND: brand });
      return { content: [{ type: 'text', text: raw.trim() }] };
    }
  );

  server.tool(
    'set_readiness_flag',
    'Setzt ein einzelnes Readiness-Flag (spec_skizziert, abhaengigkeiten_klar, offene_fragen_geklaert, aufwand_geschaetzt, lastenheft_locked).',
    {
      id: z.string(),
      brand: z.string().optional(),
      flag: z.enum([
        'spec_skizziert',
        'abhaengigkeiten_klar',
        'offene_fragen_geklaert',
        'aufwand_geschaetzt',
        'lastenheft_locked',
      ]),
      value: z.boolean(),
    },
    async ({ id, brand = 'mentolder', flag, value }) => {
      const readiness = `${flag}=${value}`;
      const raw = await runTicket(
        ['plan-meta', 'set', '--id', id, '--readiness', readiness],
        { BRAND: brand }
      );
      return { content: [{ type: 'text', text: raw.trim() }] };
    }
  );
}
```

- [ ] **Step 2: lifecycle.js implementieren**

Datei `scripts/ticket-mcp/tools/lifecycle.js`:
```js
import { z } from 'zod';
import { runTicket } from '../lib/run-ticket.js';

const VALID_STATUSES = [
  'triage', 'planning', 'plan_staged', 'backlog',
  'in_progress', 'in_review', 'qa_review', 'blocked',
  'awaiting_deploy', 'done', 'archived',
];

export function registerLifecycleTools(server) {
  server.tool(
    'transition_status',
    'Ändert den Status eines Tickets. Bei done/archived ist resolution erforderlich.',
    {
      id: z.string(),
      brand: z.string().optional(),
      status: z.enum([
        'triage', 'planning', 'plan_staged', 'backlog',
        'in_progress', 'in_review', 'qa_review', 'blocked',
        'awaiting_deploy', 'done', 'archived',
      ]),
      resolution: z.enum(['fixed', 'shipped', 'obsolete']).optional(),
      notes: z.string().optional(),
    },
    async ({ id, brand = 'mentolder', status, resolution, notes }) => {
      const args = ['update-status', '--id', id, '--status', status];
      if (resolution) args.push('--resolution', resolution);
      if (notes)      args.push('--notes', notes);
      const raw = await runTicket(args, { BRAND: brand });
      return { content: [{ type: 'text', text: raw.trim() }] };
    }
  );

  server.tool(
    'add_comment',
    'Fügt einem Ticket einen Kommentar hinzu.',
    {
      id: z.string(),
      brand: z.string().optional(),
      body: z.string().describe('Kommentartext (Markdown)'),
      author: z.string().optional().describe('default: claude-code'),
      visibility: z.enum(['internal', 'public']).optional().describe('default: internal'),
    },
    async ({ id, brand = 'mentolder', body, author = 'claude-code', visibility = 'internal' }) => {
      const raw = await runTicket(
        ['add-comment', '--id', id, '--body', body, '--author', author, '--visibility', visibility],
        { BRAND: brand }
      );
      return { content: [{ type: 'text', text: raw.trim() }] };
    }
  );

  server.tool(
    'update_fields',
    'Bulk-Patch: ändert title, description oder notes eines Tickets.',
    {
      id: z.string(),
      brand: z.string().optional(),
      notes: z.string().optional().describe('Wird an bestehende notes angehängt'),
    },
    async ({ id, brand = 'mentolder', notes }) => {
      if (!notes) {
        return { content: [{ type: 'text', text: 'Keine Felder zum Aktualisieren angegeben.' }] };
      }
      // notes-Patch via update-status (setzt status auf aktuellen Wert ist nicht nötig
      // wenn wir nur notes ändern — aber update-status erfordert --status):
      // Wir nutzen add-comment mit visibility=internal als notes-Ergänzung.
      const raw = await runTicket(
        ['add-comment', '--id', id, '--body', notes, '--author', 'ticket-mcp', '--visibility', 'internal'],
        { BRAND: brand }
      );
      return { content: [{ type: 'text', text: raw.trim() }] };
    }
  );
}
```

- [ ] **Step 3: Beide Tools in server.js einbinden**

```js
import { registerPlanningTools } from './tools/planning.js';
import { registerLifecycleTools } from './tools/lifecycle.js';
registerPlanningTools(server);
registerLifecycleTools(server);
```

- [ ] **Step 4: Tool-Liste prüfen**

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | \
  node scripts/ticket-mcp/server.js 2>/dev/null | python3 -m json.tool | grep '"name"'
```

Erwartet: `list_tickets`, `get_ticket`, `export_tickets`, `triage_ticket`, `backfill_ticket_id`, `set_plan_meta`, `set_readiness_flag`, `transition_status`, `add_comment`, `update_fields`

- [ ] **Step 5: Committen**

```bash
git add scripts/ticket-mcp/tools/planning.js scripts/ticket-mcp/tools/lifecycle.js \
        scripts/ticket-mcp/server.js
git commit -m "feat(ticket-mcp): planning + lifecycle tools"
```

---

## Task 5: prepare_feature Convenience-Tool

**Files:**
- Modify: `scripts/ticket-mcp/tools/planning.js`

**Interfaces:**
- Consumes: `runTicket`, alle Readiness-Flags, `transition_status`-Logik
- Produces: `prepare_feature` Tool — setzt alle Felder in einem Call, transitioniert zu `planning`

- [ ] **Step 1: prepare_feature in planning.js ergänzen**

Am Ende von `registerPlanningTools(server)` in `scripts/ticket-mcp/tools/planning.js` hinzufügen:

```js
  server.tool(
    'prepare_feature',
    'Convenience: setzt alle Pflichtfelder für ein Feature-Ticket in einem Call und transitioniert zu planning. ' +
    'Führt intern set_plan_meta + alle Readiness-Flags + transition_status(planning) aus.',
    {
      id: z.string().describe('external_id z.B. T000123'),
      brand: z.string().optional(),
      // Triage-Felder
      priority: z.enum(['hoch', 'mittel', 'niedrig']).optional(),
      severity: z.enum(['critical', 'major', 'minor', 'trivial']).optional(),
      attention_mode: z.enum(['auto', 'ai_ready', 'needs_human']).optional(),
      // Plan-Meta
      value_prop: z.string().optional(),
      effort: z.enum(['klein', 'mittel', 'gross']).optional(),
      areas: z.string().optional(),
      depends_on: z.string().optional(),
      // Readiness-Flags
      spec_skizziert: z.boolean().optional(),
      abhaengigkeiten_klar: z.boolean().optional(),
      offene_fragen_geklaert: z.boolean().optional(),
      aufwand_geschaetzt: z.boolean().optional(),
    },
    async ({ id, brand = 'mentolder', priority, severity, attention_mode,
             value_prop, effort, areas, depends_on,
             spec_skizziert, abhaengigkeiten_klar,
             offene_fragen_geklaert, aufwand_geschaetzt }) => {
      const log = [];
      const env = { BRAND: brand };

      // 1. Plan-Meta setzen
      const metaArgs = ['plan-meta', 'set', '--id', id];
      if (value_prop) metaArgs.push('--value-prop', value_prop);
      if (effort)     metaArgs.push('--effort', effort);
      if (areas)      metaArgs.push('--areas', areas);
      if (depends_on) metaArgs.push('--depends-on', depends_on);
      if (metaArgs.length > 4) {
        const r = await runTicket(metaArgs, env).catch(e => `FEHLER plan-meta: ${e.message}`);
        log.push(r.trim?.() ?? r);
      }

      // 2. Readiness-Flags
      const flags = { spec_skizziert, abhaengigkeiten_klar, offene_fragen_geklaert, aufwand_geschaetzt };
      for (const [flag, val] of Object.entries(flags)) {
        if (val == null) continue;
        const r = await runTicket(
          ['plan-meta', 'set', '--id', id, '--readiness', `${flag}=${val}`],
          env
        ).catch(e => `FEHLER readiness ${flag}: ${e.message}`);
        log.push(r.trim?.() ?? r);
      }

      // 3. Status → planning
      const statusArgs = ['update-status', '--id', id, '--status', 'planning'];
      if (attention_mode) {
        // attention_mode via inject setzen (kein direkter update-status-Support)
        const r = await runTicket(
          ['inject', '--id', id, '--fields', `attention_mode=${attention_mode}`],
          env
        ).catch(e => `FEHLER attention_mode: ${e.message}`);
        log.push(r.trim?.() ?? r);
      }
      const r = await runTicket(statusArgs, env).catch(e => `FEHLER status: ${e.message}`);
      log.push(r.trim?.() ?? r);

      return { content: [{ type: 'text', text: log.filter(Boolean).join('\n') }] };
    }
  );
```

- [ ] **Step 2: Tool in Tool-Liste prüfen**

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | \
  node scripts/ticket-mcp/server.js 2>/dev/null | python3 -m json.tool | grep '"name"' | grep prepare
```

Erwartet: `"name": "prepare_feature"`

- [ ] **Step 3: Committen**

```bash
git add scripts/ticket-mcp/tools/planning.js scripts/ticket-mcp/server.js
git commit -m "feat(ticket-mcp): prepare_feature convenience tool"
```

---

## Task 6: Mishap-Buffer-System + report_mishap Tool

**Files:**
- Create: `scripts/ticket-mcp/lib/mishap-buffer.js`
- Create: `scripts/ticket-mcp/tools/mishap.js`
- Create: `tests/unit/ticket-mcp/mishap-buffer.test.js`

**Interfaces:**
- Consumes: `runTicket`
- Produces:
  - `readBuffer(bufferPath): MishapEntry[]`
  - `writeBuffer(bufferPath, entries): void`
  - `classifyBundle(entries): { title, description, severity, priority, areas }`
  - `registerMishapTools(server)` — registriert `report_mishap`

- [ ] **Step 1: Failing test für mishap-buffer.js**

Datei `tests/unit/ticket-mcp/mishap-buffer.test.js`:
```js
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readBuffer, writeBuffer, classifyBundle } from '../../../scripts/ticket-mcp/lib/mishap-buffer.js';

let tmpDir;
let bufferPath;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'mishap-test-'));
  bufferPath = join(tmpDir, 'mishap-buffer.json');
});

afterEach(() => rmSync(tmpDir, { recursive: true }));

describe('readBuffer', () => {
  it('returns empty array when file missing', () => {
    assert.deepEqual(readBuffer(bufferPath), []);
  });

  it('returns parsed entries', () => {
    writeFileSync(bufferPath, JSON.stringify([{ title: 'x', reported_at: '2026-01-01' }]));
    assert.equal(readBuffer(bufferPath).length, 1);
  });
});

describe('writeBuffer', () => {
  it('persists entries as JSON', () => {
    const entries = [{ title: 'a' }, { title: 'b' }];
    writeBuffer(bufferPath, entries);
    assert.deepEqual(readBuffer(bufferPath), entries);
  });
});

describe('classifyBundle', () => {
  it('sets severity major when any entry type is broken', () => {
    const entries = [
      { title: 'x', type: 'broken', component: 'auth', description: 'a' },
      { title: 'y', type: 'drift',  component: 'chat', description: 'b' },
      { title: 'z', type: 'drift',  component: 'auth', description: 'c' },
    ];
    const result = classifyBundle(entries);
    assert.equal(result.severity, 'major');
    assert.equal(result.priority, 'hoch');
    assert.ok(result.areas.includes('auth'));
  });

  it('sets severity minor when no broken/security entries', () => {
    const entries = [
      { title: 'x', type: 'drift',       component: 'docs', description: 'a' },
      { title: 'y', type: 'suspicious',  component: 'docs', description: 'b' },
      { title: 'z', type: 'degraded',    component: 'docs', description: 'c' },
    ];
    const result = classifyBundle(entries);
    assert.equal(result.severity, 'minor');
    assert.equal(result.priority, 'mittel');
  });

  it('builds bundled description markdown', () => {
    const entries = Array.from({ length: 3 }, (_, i) => ({
      title: `Mishap ${i}`, type: 'drift', component: 'infra', description: `desc ${i}`,
    }));
    const result = classifyBundle(entries);
    assert.ok(result.description.includes('Mishap 0'));
    assert.ok(result.description.includes('Mishap 2'));
  });
});
```

- [ ] **Step 2: Test ausführen — erwartet FAIL**

```bash
node --test tests/unit/ticket-mcp/mishap-buffer.test.js 2>&1 | head -10
```

Erwartet: `Cannot find module .../mishap-buffer.js`

- [ ] **Step 3: mishap-buffer.js implementieren**

Datei `scripts/ticket-mcp/lib/mishap-buffer.js`:
```js
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '../../../..');
export const DEFAULT_BUFFER_PATH = path.join(REPO_ROOT, '.git', 'mishap-buffer.json');

/** @returns {object[]} */
export function readBuffer(bufferPath = DEFAULT_BUFFER_PATH) {
  try {
    return JSON.parse(readFileSync(bufferPath, 'utf8'));
  } catch {
    return [];
  }
}

/** @param {object[]} entries */
export function writeBuffer(entries, bufferPath = DEFAULT_BUFFER_PATH) {
  writeFileSync(bufferPath, JSON.stringify(entries, null, 2), 'utf8');
}

/**
 * Regelbasierte Klassifizierung eines Mishap-Bundles (kein LLM).
 * @param {object[]} entries
 */
export function classifyBundle(entries) {
  const hasCritical = entries.some(e => e.type === 'broken' || e.type === 'security');
  const severity = hasCritical ? 'major' : 'minor';
  const priority = hasCritical ? 'hoch' : 'mittel';

  const components = [...new Set(entries.map(e => e.component).filter(Boolean))];
  const areas = components.join(',');

  const title = `Mishap-Bundle: ${components.join(', ')} (${entries.length} Einträge)`;

  const description = entries.map((e, i) =>
    `### Mishap ${i + 1}: ${e.title}\n**Typ:** ${e.type} | **Komponente:** ${e.component}\n\n${e.description}`
  ).join('\n\n---\n\n');

  return { title, description, severity, priority, areas };
}
```

- [ ] **Step 4: Tests ausführen — erwartet PASS**

```bash
node --test tests/unit/ticket-mcp/mishap-buffer.test.js 2>&1
```

Erwartet: alle 4 Tests grün.

- [ ] **Step 5: mishap.js implementieren**

Datei `scripts/ticket-mcp/tools/mishap.js`:
```js
import { z } from 'zod';
import { runTicket } from '../lib/run-ticket.js';
import { readBuffer, writeBuffer, classifyBundle, DEFAULT_BUFFER_PATH } from '../lib/mishap-buffer.js';

const MISHAP_TRIGGER = 3;

export function registerMishapTools(server) {
  server.tool(
    'report_mishap',
    `Fügt einen Mishap in den Buffer ein. Bei ≥${MISHAP_TRIGGER} Einträgen wird automatisch ein gebündeltes Ticket mit attention_mode=ai_ready angelegt.`,
    {
      title: z.string().describe('Kurztitel des Mishaps'),
      description: z.string().describe('Ausführliche Beschreibung'),
      component: z.string().describe('Betroffene Komponente z.B. auth, chat, infra'),
      type: z.enum(['broken', 'degraded', 'suspicious', 'security', 'drift'])
        .describe('Mishap-Typ (broken/security → severity major)'),
      brand: z.string().optional(),
    },
    async ({ title, description, component, type, brand = 'mentolder' }) => {
      const entry = {
        title, description, component, type,
        reported_at: new Date().toISOString(),
      };

      const buffer = readBuffer();
      buffer.push(entry);

      if (buffer.length < MISHAP_TRIGGER) {
        writeBuffer(buffer);
        return {
          content: [{
            type: 'text',
            text: `Mishap gespeichert (${buffer.length}/${MISHAP_TRIGGER}). Noch ${MISHAP_TRIGGER - buffer.length} bis zum automatischen Bundle-Ticket.`,
          }],
        };
      }

      // Bundle auslösen
      const bundle = buffer.slice(0, MISHAP_TRIGGER);
      const classified = classifyBundle(bundle);

      let ticketResult;
      try {
        ticketResult = await runTicket([
          'create',
          '--type',     'task',
          '--brand',    brand,
          '--title',    classified.title,
          '--description', classified.description,
          '--status',   'triage',
          '--severity', classified.severity,
          '--priority', classified.priority,
          '--attention-mode', 'ai_ready',
          '--areas',    classified.areas,
        ], { BRAND: brand });
      } catch (err) {
        // Buffer NICHT leeren wenn create fehlschlägt — kein Datenverlust
        writeBuffer(buffer);
        throw err;
      }

      // Buffer leeren (restliche Einträge nach den ersten 3 behalten)
      writeBuffer(buffer.slice(MISHAP_TRIGGER));

      const extId = ticketResult.trim().split('|')[0];
      return {
        content: [{
          type: 'text',
          text: `Bundle-Ticket angelegt: ${extId}\nBuffer geleert. Verbleibende Mishaps: ${buffer.length - MISHAP_TRIGGER}\n\nTicket landet im nächsten Factory-Tick (attention_mode=ai_ready).`,
        }],
      };
    }
  );
}
```

- [ ] **Step 6: mishap.js in server.js einbinden**

```js
import { registerMishapTools } from './tools/mishap.js';
registerMishapTools(server);
```

- [ ] **Step 7: Alle Unit-Tests laufen lassen**

```bash
node --test tests/unit/ticket-mcp/*.test.js 2>&1
```

Erwartet: alle Tests grün.

- [ ] **Step 8: Committen**

```bash
git add scripts/ticket-mcp/lib/mishap-buffer.js scripts/ticket-mcp/tools/mishap.js \
        scripts/ticket-mcp/server.js tests/unit/ticket-mcp/mishap-buffer.test.js
git commit -m "feat(ticket-mcp): mishap buffer + 3-pack bundle-trigger"
```

---

## Task 7: Client-Integration + mishap-tracker Skill-Update

**Files:**
- Modify: `.opencode/opencode.jsonc`
- Modify: `.claude/settings.json`
- Modify: `.claude/skills/mishap-tracker/SKILL.md`

**Interfaces:**
- Consumes: `scripts/ticket-mcp/server.js` (läuft als stdio-Prozess)
- Produces: alle drei Clients sehen `ticket-mcp` in ihrer Tool-Liste

- [ ] **Step 1: opencode.jsonc erweitern**

In `.opencode/opencode.jsonc` im `"mcp"` Block nach dem letzten stdio-Eintrag einfügen:
```jsonc
    "ticket-mcp": {
      "type": "local",
      "command": ["node", "/home/patrick/Bachelorprojekt/scripts/ticket-mcp/server.js"],
      "enabled": true
    },
```

- [ ] **Step 2: claude/settings.json erweitern**

Im `"mcpServers"` Block von `.claude/settings.json` eintragen:
```json
"ticket-mcp": {
  "type": "stdio",
  "command": "node",
  "args": ["/home/patrick/Bachelorprojekt/scripts/ticket-mcp/server.js"]
}
```

- [ ] **Step 3: Claude Code MCP-Liste prüfen**

```bash
cat .claude/settings.json | python3 -m json.tool | grep -A2 "ticket-mcp"
```

Erwartet: Eintrag mit `"type": "stdio"`.

- [ ] **Step 4: mishap-tracker Skill aktualisieren**

In `.claude/skills/mishap-tracker/SKILL.md` die Abschnitt zum Ticket-Erstellen ersetzen:

Suche den Block der direkt `ticket.sh create` mit type=mishap aufruft und ersetze ihn durch:

```markdown
## Mishap melden (via ticket-mcp)

Statt direkt ein Ticket zu erstellen, nutze das `report_mishap` MCP-Tool.
Der Buffer sammelt Mishaps — bei 3 Einträgen wird automatisch ein Bundle-Ticket
mit `attention_mode: ai_ready` angelegt das im nächsten Factory-Tick verarbeitet wird.

Für jeden Mishap im MISHAP_LOG aufrufen:

```
mcp__ticket-mcp__report_mishap({
  title: "<titel>",
  description: "<beschreibung>",
  component: "<komponente>",
  type: "<broken|degraded|suspicious|security|drift>",
  brand: "<brand>"
})
```

**Rückmeldung auswerten:**
- "2/3 bis zum automatischen Bundle-Ticket" → weitere Mishaps sammeln
- "Bundle-Ticket angelegt: T000xxx" → Ticket existiert, Factory-Tick übernimmt
```

- [ ] **Step 5: Integrations-Smoke-Test**

```bash
# Startet den Server und ruft tools/list ab
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | \
  node scripts/ticket-mcp/server.js 2>/dev/null | \
  python3 -c "import sys,json; tools=json.load(sys.stdin)['result']['tools']; [print(t['name']) for t in tools]"
```

Erwartet: 12 Tools ausgegeben (list_tickets, get_ticket, export_tickets, triage_ticket, backfill_ticket_id, set_plan_meta, set_readiness_flag, prepare_feature, transition_status, add_comment, update_fields, report_mishap).

- [ ] **Step 6: Committen**

```bash
git add .opencode/opencode.jsonc .claude/settings.json \
        .claude/skills/mishap-tracker/SKILL.md
git commit -m "feat(ticket-mcp): client integration + mishap-tracker skill update"
```

---

## Task 8: OpenSpec-Proposal anlegen

**Files:**
- Create: `openspec/changes/ticket-mcp/proposal.md`
- Create: `openspec/changes/ticket-mcp/tasks.md`

- [ ] **Step 1: OpenSpec-Verzeichnis anlegen**

```bash
mkdir -p openspec/changes/ticket-mcp
```

- [ ] **Step 2: proposal.md schreiben**

Datei `openspec/changes/ticket-mcp/proposal.md`:
```markdown
---
ticket_id: (wird nach Erstellung eingetragen)
plan_ref: openspec/changes/ticket-mcp/tasks.md
status: plan_staged
date: 2026-06-21
---

# Proposal: ticket-mcp — Ticket-Operationen als MCP-Tools

## Why

AI-Agenten müssen heute komplexe Shell-Kommandos kennen um Tickets zu verwalten.
Mit ticket-mcp stehen Triage, Plan-Meta, Mishap-Bündelung und Backfill als native
MCP-Tools bereit — nutzbar von Claude Code, Opencode und Gemini CLI ohne Shell-Wissen.

## What

- stdio MCP-Server (`scripts/ticket-mcp/server.js`) wrapping `scripts/ticket.sh`
- 12 Tools: list_tickets, get_ticket, export_tickets, triage_ticket, backfill_ticket_id,
  set_plan_meta, set_readiness_flag, prepare_feature, transition_status,
  add_comment, update_fields, report_mishap
- Mishap-Bundle-System: 3 Mishaps → automatisches Bundle-Ticket mit attention_mode=ai_ready
- backfill_ticket_id: repariert Tickets ohne external_id (NULL)
- Neue ticket.sh Subcommands: list, backfill-id

## Ablöst

- T000992 (ai-ticket-auto-triage): Mishap-Klassifizierung übernimmt dieses Feature
  für Mishap-Tickets → T000992 nach Merge auf archived setzen
```

- [ ] **Step 3: tasks.md schreiben**

Datei `openspec/changes/ticket-mcp/tasks.md`:
```markdown
# Tasks: ticket-mcp

- [x] Task 1: Scaffold + run-ticket.js Wrapper
- [x] Task 2: ticket.sh list + list_tickets / get_ticket Tools
- [x] Task 3: backfill-id + triage_ticket + transition_status
- [x] Task 4: set_plan_meta + set_readiness_flag + lifecycle Tools
- [x] Task 5: prepare_feature Convenience-Tool
- [x] Task 6: Mishap-Buffer-System + report_mishap Tool
- [x] Task 7: Client-Integration + mishap-tracker Skill-Update
- [x] Task 8: OpenSpec-Proposal
```

- [ ] **Step 4: validate**

```bash
task openspec:validate 2>&1 | tail -5
```

Erwartet: kein Fehler für `ticket-mcp`.

- [ ] **Step 5: Final-Commit**

```bash
git add openspec/changes/ticket-mcp/
git commit -m "chore(openspec): add ticket-mcp change proposal"
```

---

## Abschluss-Checkliste

Nach Task 8 alles prüfen:

- [ ] `node --test tests/unit/ticket-mcp/*.test.js` → alle grün
- [ ] `./tests/runner.sh local ticket-mcp` → BATS grün
- [ ] `task test:all` → CI-Gate grün
- [ ] 12 Tools in `tools/list` Antwort
- [ ] `.git/mishap-buffer.json` existiert nach erstem `report_mishap`-Aufruf
- [ ] `ticket.sh list --brand mentolder` (mit aktivem Cluster) gibt JSON zurück
- [ ] `ticket.sh backfill-id --brand mentolder` (mit aktivem Cluster) läuft durch
