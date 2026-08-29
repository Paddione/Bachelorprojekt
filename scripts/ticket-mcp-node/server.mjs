#!/usr/bin/env node
import readline from 'node:readline';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { runTicket } from './runner.mjs';

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_NAME = 'ticket-mcp';
const SERVER_VERSION = '1.0.0';
const MISHAP_TRIGGER = 10;

function ok(id, result) { return { jsonrpc: '2.0', id, result }; }
function fail(id, code, message) { return { jsonrpc: '2.0', id, error: { code, message } }; }
function writeMsg(msg) { process.stdout.write(JSON.stringify(msg) + '\n'); }

function brandOf(a) { return (a?.brand || 'mentolder'); }

function textResult(raw, err) {
  if (err) throw err;
  return { content: [{ type: 'text', text: raw.trimEnd() || '_(keine Ausgabe)_' }] };
}

// ---- Mishap buffer helpers ----

function gitCommonDir(root) {
  try {
    const out = execSync('git rev-parse --git-common-dir', { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
    if (!out || out === '.git') return join(root, '.git');
    const abs = out.startsWith('/') ? out : join(root, out);
    return abs;
  } catch {
    return join(root, '.git');
  }
}

function mishapBufferPath(root) {
  const gitDir = gitCommonDir(root);
  return join(gitDir, '..', 'mishap-buffer.json');
}

function readBuffer(root) {
  const p = mishapBufferPath(root);
  try {
    if (!existsSync(p)) return [];
    const data = readFileSync(p, 'utf8');
    const entries = JSON.parse(data);
    return Array.isArray(entries) ? entries : [];
  } catch { return []; }
}

function writeBuffer(root, entries) {
  const p = mishapBufferPath(root);
  try {
    writeFileSync(p, JSON.stringify(entries, null, 2));
  } catch (e) {
    process.stderr.write('[mishap] Buffer-Write nach ' + p + ' fehlgeschlagen: ' + e.message + '\n');
  }
}

function isIncidentType(mtype) {
  return mtype === 'incident' || mtype === 'broken' || mtype === 'security';
}

function normalizeTitle(s) {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function findOpenTicketByTitle(root, brand, title) {
  const want = normalizeTitle(title);
  const openStatuses = ['triage', 'planning', 'plan_staged', 'backlog', 'in_progress', 'in_review', 'blocked', 'qa_review'];
  for (const statusFilter of openStatuses) {
    try {
      const raw = runTicket(['list', '--brand', brand, '--status', statusFilter, '--limit', '200'], { BRAND: brand });
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const tickets = JSON.parse(trimmed);
      for (const t of tickets) {
        if (t.external_id && normalizeTitle(t.title) === want) {
          return t.external_id;
        }
      }
    } catch { /* list failed, continue */ }
  }
  return '';
}

function buildIncidentTicketArgs(entry, brand) {
  return [
    'create', '--type', 'incident', '--brand', brand,
    '--title', 'Mishap-Incident: ' + entry.title,
    '--description', '### Incident\n\n**Typ:** ' + entry.type + ' | **Komponente:** ' + entry.component + '\n\n' + entry.description,
    '--status', 'triage', '--severity', 'major', '--priority', 'hoch',
    '--attention-mode', 'needs_human', '--areas', entry.component,
  ];
}

function createIncidentTicket(root, entry, brand) {
  const existing = findOpenTicketByTitle(root, brand, entry.title);
  if (existing) {
    try {
      runTicket(
        ['add-comment', '--id', existing, '--body',
          'Mishap erneut gemeldet (Typ=' + entry.type + ', Komponente=' + entry.component + ') — bereits als ' + existing + ' erfasst, kein neues Ticket.',
          '--author', 'ticket-mcp', '--visibility', 'internal'],
        { BRAND: brand },
      );
    } catch { /* ignore */ }
    return existing;
  }
  const out = runTicket(buildIncidentTicketArgs(entry, brand), { BRAND: brand });
  const ext = out.trim();
  const i = ext.indexOf('|');
  return i >= 0 ? ext.slice(0, i) : ext;
}

function mishapSeverity(mtype) {
  switch (mtype) {
    case 'degraded': return ['minor', 'mittel'];
    case 'suspicious': return ['minor', 'mittel'];
    case 'drift': return ['trivial', 'niedrig'];
    case 'process': return ['minor', 'mittel'];
    default: return ['minor', 'mittel'];
  }
}

function buildFactoryFixTicketArgs(entry, brand) {
  const [sev, prio] = mishapSeverity(entry.type);
  return [
    'create', '--type', 'fix', '--brand', brand,
    '--title', entry.title,
    '--description', '### Mishap-Fix\n\n**Typ:** ' + entry.type + ' | **Komponente:** ' + entry.component + '\n\n' + entry.description,
    '--status', 'triage', '--severity', sev, '--priority', prio,
    '--attention-mode', 'ai_ready', '--areas', entry.component,
  ];
}

function createFactoryFixTicket(root, entry, brand) {
  const existing = findOpenTicketByTitle(root, brand, entry.title);
  if (existing) {
    try {
      runTicket(
        ['add-comment', '--id', existing, '--body',
          'Mishap erneut gemeldet (Typ=' + entry.type + ', Komponente=' + entry.component + ') — bereits als ' + existing + ' erfasst, kein neues Ticket.',
          '--author', 'ticket-mcp', '--visibility', 'internal'],
        { BRAND: brand },
      );
    } catch { /* ignore */ }
    return existing;
  }
  const out = runTicket(buildFactoryFixTicketArgs(entry, brand), { BRAND: brand });
  const ext = out.trim();
  const i = ext.indexOf('|');
  return i >= 0 ? ext.slice(0, i) : ext;
}

function discardBuffer(entries, brand) {
  for (let i = 0; i < entries.length; i++) {
    process.stderr.write('[mishap] verworfen (kein Ticket-Kontext, brand=' + brand + ') ' + (i+1) + '/' + entries.length + ': ' + entries[i].title + ' (' + entries[i].type + ', ' + entries[i].component + ')\n');
  }
  return null;
}

// ---- Tool definitions ----

const TOOLS = [
  // 1. list_tickets
  {
    name: 'list_tickets',
    description: 'Listet Tickets gefiltert nach Status, Typ, Brand oder fehlender ID. Standard-Limit 200 Zeilen, neueste zuerst (created_at DESC); mit --limit erhebbar (max 1000).',
    inputSchema: {
      type: 'object',
      properties: {
        brand: { type: 'string', description: 'mentolder oder korczewski (default: mentolder)', enum: ['mentolder', 'korczewski'] },
        status: { type: 'string', description: 'z.B. triage, planning, plan_staged, backlog' },
        type: { type: 'string', description: 'bug, feature, task, project', enum: ['fix', 'feat', 'chore', 'project', 'docs', 'refactor', 'perf', 'test', 'ci', 'build', 'bug', 'feature', 'task'] },
        attention_mode: { type: 'string', description: 'auto, ai_ready, needs_human', enum: ['auto', 'ai_ready', 'needs_human'] },
        missing_id: { type: 'boolean', description: 'Nur Tickets ohne external_id zurueckgeben' },
        include_test_data: { type: 'boolean', description: 'Testdaten einschliessen (default: false)' },
        limit: { type: 'integer', description: 'Maximale Anzahl Ergebnisse (default: 200)', minimum: 1, maximum: 1000 },
      },
      required: [],
    },
  },
  // 2. get_ticket
  {
    name: 'get_ticket',
    description: 'Gibt vollständige Details eines Tickets per external_id zurueck.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'external_id z.B. T000123' },
        brand: { type: 'string', description: 'mentolder oder korczewski (default: mentolder)', enum: ['mentolder', 'korczewski'] },
      },
      required: ['id'],
    },
  },
  // 3. export_tickets
  {
    name: 'export_tickets',
    description: 'Exportiert Tickets als JSON oder Markdown (gleiche Filter wie list_tickets). Default-Limit 200, neueste zuerst (created_at DESC); max 1000. Ohne Filter empfiehlt sich ein Status-Filter, um den Kontextverbrauch gering zu halten.',
    inputSchema: {
      type: 'object',
      properties: {
        brand: { type: 'string', description: 'mentolder oder korczewski (default: mentolder)', enum: ['mentolder', 'korczewski'] },
        status: { type: 'string', description: 'z.B. triage, planning, plan_staged, backlog' },
        type: { type: 'string', description: 'bug, feature, task, project', enum: ['fix', 'feat', 'chore', 'project', 'docs', 'refactor', 'perf', 'test', 'ci', 'build', 'bug', 'feature', 'task'] },
        format: { type: 'string', description: 'json (default) oder markdown', enum: ['json', 'markdown'] },
        limit: { type: 'integer', description: 'Maximale Anzahl Ergebnisse (default: 200)', minimum: 1, maximum: 1000 },
      },
      required: [],
    },
  },
  // 4. export_ticket_timeline
  {
    name: 'export_ticket_timeline',
    description: 'Exportiert die vollständige Ticket-History als chronologisches JSON. Quellen: Kommentare (ticket_comments), Factory-Phasen (factory_phase_events), PR-Links (ticket_links kind=pr), archivierte Pläne (ticket_plans). HINWEIS: CLI-Statusuebergaenge via ticket.sh update-status erscheinen nicht in der Timeline (bekannte Luecke — Follow-up-Ticket erforderlich).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'external_id z.B. T000123' },
        brand: { type: 'string', description: 'mentolder oder korczewski (default: mentolder)', enum: ['mentolder', 'korczewski'] },
      },
      required: ['id'],
    },
  },
  // 5. triage_ticket
  {
    name: 'triage_ticket',
    description: 'Setzt Triage-Felder eines Tickets: type, severity, priority, attention_mode, status, component.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'external_id z.B. T000123' },
        brand: { type: 'string', description: 'mentolder oder korczewski (default: mentolder)', enum: ['mentolder', 'korczewski'] },
        type: { type: 'string', description: 'bug, feature, task, project', enum: ['fix', 'feat', 'chore', 'project', 'docs', 'refactor', 'perf', 'test', 'ci', 'build', 'bug', 'feature', 'task'] },
        severity: { type: 'string', description: 'critical, major, minor, trivial', enum: ['critical', 'major', 'minor', 'trivial'] },
        priority: { type: 'string', description: 'hoch, mittel, niedrig', enum: ['hoch', 'mittel', 'niedrig'] },
        attention_mode: { type: 'string', description: 'auto, ai_ready, needs_human', enum: ['auto', 'ai_ready', 'needs_human'] },
        status: { type: 'string', description: 'Ziel-Status z.B. triage, planning, backlog' },
        component: { type: 'string', description: 'Betroffene Komponente, z.B. website, infra, scripts' },
      },
      required: ['id'],
    },
  },
  // 6. backfill_ticket_id
  {
    name: 'backfill_ticket_id',
    description: 'Findet Tickets ohne external_id (T-Nummer) und setzt die nächste Sequenznummer.',
    inputSchema: {
      type: 'object',
      properties: {
        brand: { type: 'string', description: 'mentolder oder korczewski (default: mentolder)', enum: ['mentolder', 'korczewski'] },
      },
      required: [],
    },
  },
];

// Continue in next append...

// ---- TOOLS continued: Planning + Lifecycle + Mishap + Link + Workflow ----

// 7. set_plan_meta
{
  const t = TOOLS[TOOLS.length] = {};
  t.name = 'set_plan_meta';
  t.description = 'Setzt Planungs-Metadaten: value_prop, effort, areas, depends_on, planning_rank.';
  t.inputSchema = {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'external_id z.B. T000123' },
      brand: { type: 'string', description: 'mentolder oder korczewski (default: mentolder)', enum: ['mentolder', 'korczewski'] },
      value_prop: { type: 'string', description: 'Kern-Nutzen des Features' },
      effort: { type: 'string', description: 'klein, mittel, gross', enum: ['klein', 'mittel', 'gross'] },
      areas: { type: 'string', description: 'Komma-separierte Bereiche z.B. auth,chat' },
      depends_on: { type: 'string', description: 'Komma-separierte Ticket-IDs z.B. T000100,T000101' },
      rank: { type: 'integer', description: 'Planungs-Rang (niedrig = höhere Prio)' },
    },
    required: ['id'],
  };
}
// 8. set_readiness_flag
{
  const t = TOOLS[TOOLS.length] = {};
  t.name = 'set_readiness_flag';
  t.description = 'Setzt ein einzelnes Readiness-Flag (spec_skizziert, abhaengigkeiten_klar, offene_fragen_geklaert, aufwand_geschaetzt, lastenheft_locked, factory_excluded, execution_released).';
  t.inputSchema = {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'external_id z.B. T000123' },
      brand: { type: 'string', description: 'mentolder oder korczewski (default: mentolder)', enum: ['mentolder', 'korczewski'] },
      flag: { type: 'string', description: 'Readiness-Flag', enum: ['spec_skizziert', 'abhaengigkeiten_klar', 'offene_fragen_geklaert', 'aufwand_geschaetzt', 'lastenheft_locked', 'factory_excluded', 'execution_released'] },
      value: { type: 'boolean', description: 'true oder false' },
    },
    required: ['id', 'flag', 'value'],
  };
}
// 9. prepare_feature
{
  const t = TOOLS[TOOLS.length] = {};
  t.name = 'prepare_feature';
  t.description = 'Convenience: setzt alle Pflichtfelder für ein Feature-Ticket in einem Call und transitioniert zu planning. Fuehrt intern set_plan_meta + alle Readiness-Flags + transition_status(planning) aus.';
  t.inputSchema = {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'external_id z.B. T000123' },
      brand: { type: 'string', description: 'mentolder oder korczewski (default: mentolder)', enum: ['mentolder', 'korczewski'] },
      priority: { type: 'string', description: 'wird nicht an ticket.sh plan-meta durchgereicht (das Verb akzeptiert priority/severity nicht)', enum: ['hoch', 'mittel', 'niedrig'] },
      severity: { type: 'string', description: 'wird nicht an ticket.sh plan-meta durchgereicht (das Verb akzeptiert priority/severity nicht)', enum: ['critical', 'major', 'minor', 'trivial'] },
      attention_mode: { type: 'string', description: 'auto, ai_ready, needs_human', enum: ['auto', 'ai_ready', 'needs_human'] },
      value_prop: { type: 'string', description: 'Kern-Nutzen des Features' },
      effort: { type: 'string', description: 'klein, mittel, gross', enum: ['klein', 'mittel', 'gross'] },
      areas: { type: 'string', description: 'Komma-separierte Bereiche z.B. auth,chat' },
      depends_on: { type: 'string', description: 'Komma-separierte Ticket-IDs z.B. T000100,T000101' },
      product_id: { type: 'string', description: "Optional: UUID oder external_id eines type='project'-Tickets im selben Brand — setzt parent_id via ticket.sh set-parent" },
      spec_skizziert: { type: 'boolean', description: 'Readiness-Flag' },
      abhaengigkeiten_klar: { type: 'boolean', description: 'Readiness-Flag' },
      offene_fragen_geklaert: { type: 'boolean', description: 'Readiness-Flag' },
      aufwand_geschaetzt: { type: 'boolean', description: 'Readiness-Flag' },
    },
    required: ['id'],
  };
}
// 10. transition_status
{
  const t = TOOLS[TOOLS.length] = {};
  t.name = 'transition_status';
  t.description = 'Ändert den Status eines Tickets. Bei done/archived ist resolution erforderlich.';
  t.inputSchema = {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'external_id z.B. T000123' },
      brand: { type: 'string', description: 'mentolder oder korczewski (default: mentolder)', enum: ['mentolder', 'korczewski'] },
      status: { type: 'string', description: 'triage, planning, plan_staged, backlog, in_progress, in_review, qa_review, blocked, awaiting_deploy, done, archived', enum: ['triage', 'planning', 'plan_staged', 'backlog', 'in_progress', 'in_review', 'qa_review', 'blocked', 'awaiting_deploy', 'done', 'archived'] },
      resolution: { type: 'string', description: 'fixed, shipped, obsolete', enum: ['fixed', 'shipped', 'obsolete'] },
      notes: { type: 'string', description: 'Optionaler Notiztext' },
    },
    required: ['id', 'status'],
  };
}
// 11. add_comment
{
  const t = TOOLS[TOOLS.length] = {};
  t.name = 'add_comment';
  t.description = 'Fügt einem Ticket einen Kommentar hinzu.';
  t.inputSchema = {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'external_id z.B. T000123' },
      brand: { type: 'string', description: 'mentolder oder korczewski (default: mentolder)', enum: ['mentolder', 'korczewski'] },
      body: { type: 'string', description: 'Kommentartext (Markdown)' },
      author: { type: 'string', description: 'default: claude-code' },
      visibility: { type: 'string', description: 'default: internal', enum: ['internal', 'public'] },
    },
    required: ['id', 'body'],
  };
}
// 12. update_fields
{
  const t = TOOLS[TOOLS.length] = {};
  t.name = 'update_fields';
  t.description = 'Bulk-Patch: ändert title, description oder notes eines Tickets.';
  t.inputSchema = {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'external_id z.B. T000123' },
      brand: { type: 'string', description: 'mentolder oder korczewski (default: mentolder)', enum: ['mentolder', 'korczewski'] },
      title: { type: 'string', description: 'Neuer Titel' },
      description: { type: 'string', description: 'Neue Beschreibung' },
      notes: { type: 'string', description: 'Wird an bestehende notes angehängt' },
    },
    required: ['id'],
  };
}
// 13. report_mishap
{
  const t = TOOLS[TOOLS.length] = {};
  t.name = 'report_mishap';
  t.description = 'Fügt einen Mishap in den Buffer ein. Incident-Typen erzeugen sofort ein Ticket. Bei >= 10 nicht-kritischen Einträgen: Buffer wird protokolliert und geleert.';
  t.inputSchema = {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Kurztitel' },
      description: { type: 'string', description: 'Beschreibung' },
      component: { type: 'string', description: 'Komponente' },
      type: { type: 'string', description: 'incident (sofort Ticket) | degraded, suspicious, drift, process', enum: ['incident', 'broken', 'degraded', 'suspicious', 'security', 'drift', 'process'] },
      brand: { type: 'string', description: 'mentolder oder korczewski', enum: ['mentolder', 'korczewski'] },
    },
    required: ['title', 'description', 'component', 'type'],
  };
}
// 14. get_mishap_buffer
{
  const t = TOOLS[TOOLS.length] = {};
  t.name = 'get_mishap_buffer';
  t.description = 'Zeigt den aktuellen Inhalt des Mishap-Buffers.';
  t.inputSchema = { type: 'object', properties: {}, required: [] };
}
// 15. flush_mishap_buffer
{
  const t = TOOLS[TOOLS.length] = {};
  t.name = 'flush_mishap_buffer';
  t.description = 'Leert den Buffer sofort: die Einträge werden protokolliert und verworfen, auch unterhalb 10 Einträge. Es entsteht kein Ticket [T014104].';
  t.inputSchema = {
    type: 'object',
    properties: {
      brand: { type: 'string', description: 'mentolder oder korczewski', enum: ['mentolder', 'korczewski'] },
    },
    required: [],
  };
}
// link_tickets
{
  const t = TOOLS[TOOLS.length] = {};
  t.name = 'link_tickets';
  t.description = 'Erstellt einen gerichteten Dependency-Link zwischen zwei Tickets (pr, relates_to, blocks, blocked_by, duplicate_of, fixes, fixed_by, child_of). Idempotent — mehrfacher Aufruf mit gleichen Argumenten erzeugt keinen Duplikat-Eintrag.';
  t.inputSchema = {
  "type": "object",
  "properties": {
"from": { "type": "string", "description": "external_id des Quell-Tickets, z.B. T000100"},
"to": { "type": "string", "description": "external_id des Ziel-Tickets, z.B. T000200"},
"kind": { "type": "string", "description": "Art der Verknuepfung: pr, relates_to, blocks, blocked_by, duplicate_of, fixes, fixed_by, child_of", "enum": ["pr", "relates_to", "blocks", "blocked_by", "duplicate_of", "fixes", "fixed_by", "child_of"]},
"brand": { "type": "string", "description": "mentolder oder korczewski (default: mentolder)", "enum": ["mentolder", "korczewski"]}
  },
  "required": ["from", "to", "kind"]
};
}

// get_ticket_links
{
  const t = TOOLS[TOOLS.length] = {};
  t.name = 'get_ticket_links';
  t.description = 'Gibt alle Dependency-Links eines Tickets zurueck: blocks (von diesem Ticket ausgehend), blocked_by (auf dieses Ticket zeigend), relates (symmetrisch), child_of (Elternticket).';
  t.inputSchema = {
  "type": "object",
  "properties": {
"id": { "type": "string", "description": "external_id z.B. T000123"},
"brand": { "type": "string", "description": "mentolder oder korczewski (default: mentolder)", "enum": ["mentolder", "korczewski"]}
  },
  "required": ["id"]
};
}

// record_phase_event
{
  const t = TOOLS[TOOLS.length] = {};
  t.name = 'record_phase_event';
  t.description = 'Schreibt ein Factory/Devflow-Phasen-Event (tickets.factory_phase_events).';
  t.inputSchema = {
  "type": "object",
  "properties": {
"id": { "type": "string", "description": "external_id z.B. T000123"},
"phase": { "type": "string", "description": "scout|design|plan|implement|verify|deploy", "enum": ["scout", "design", "plan", "implement", "verify", "deploy"]},
"state": { "type": "string", "description": "entered|done|blocked", "enum": ["entered", "done", "blocked"]},
"detail": { "type": "string", "description": "Optionaler Detailtext"},
"driver": { "type": "string", "description": "factory|devflow (default: factory)", "enum": ["factory", "devflow"]},
"brand": { "type": "string", "description": "mentolder oder korczewski (default: mentolder)", "enum": ["mentolder", "korczewski"]}
  },
  "required": ["id", "phase", "state"]
};
}

// record_grill_answers
{
  const t = TOOLS[TOOLS.length] = {};
  t.name = 'record_grill_answers';
  t.description = 'Persistiert Grilling-Antworten (tickets.grilling_answers JSONB). \'answers\': eine Zeile pro Antwort als qid=text.';
  t.inputSchema = {
  "type": "object",
  "properties": {
"id": { "type": "string", "description": "external_id z.B. T000123"},
"answers": { "type": "string", "description": "Antworten, eine pro Zeile: qid=text"},
"questionnaire": { "type": "string", "description": "default: coaching-sessions-v1"},
"no_comment": { "type": "boolean", "description": "Kein Timeline-Kommentar (default false)"},
"brand": { "type": "string", "description": "mentolder oder korczewski (default: mentolder)", "enum": ["mentolder", "korczewski"]}
  },
  "required": ["id", "answers"]
};
}

// stage_plan
{
  const t = TOOLS[TOOLS.length] = {};
  t.name = 'stage_plan';
  t.description = 'Stellt ein Ticket in die Kommissionierung (status=plan_staged) mit Branch + Plan-Pfad.';
  t.inputSchema = {
  "type": "object",
  "properties": {
"id": { "type": "string", "description": "external_id z.B. T000123"},
"branch": { "type": "string", "description": "Feature/Fix-Branch"},
"plan": { "type": "string", "description": "Plan-Datei-Pfad"},
"hold": { "type": "boolean", "description": "true => --hold (execution_released=false, Operator gibt spaeter frei); false/weggelassen => --no-hold (Factory greift sofort zu). stage-plan verlangt genau eines der Flags (T003267)."},
"brand": { "type": "string", "description": "mentolder oder korczewski (default: mentolder)", "enum": ["mentolder", "korczewski"]}
  },
  "required": ["id", "branch", "plan"]
};
}

// create_ticket
{
  const t = TOOLS[TOOLS.length] = {};
  t.name = 'create_ticket';
  t.description = 'Legt ein Ticket an. Gibt \'external_id|uuid\' zurueck (Skills parsen cut -d\'|\' -f1).';
  t.inputSchema = {
  "type": "object",
  "properties": {
"type": { "type": "string", "description": "fix|feat|chore|project|docs|refactor|perf|test|ci|build (bug/feature/task deprecated)", "enum": ["fix", "feat", "chore", "project", "docs", "refactor", "perf", "test", "ci", "build", "bug", "feature", "task"]},
"title": { "type": "string", "description": "Ticket-Titel"},
"description": { "type": "string", "description": "Beschreibung (Pflicht in create.sh)"},
"brand": { "type": "string", "description": "mentolder oder korczewski (default: mentolder)", "enum": ["mentolder", "korczewski"]},
"priority": { "type": "string", "description": "hoch|mittel|niedrig (default mittel)", "enum": ["hoch", "mittel", "niedrig"]},
"severity": { "type": "string", "description": "critical|major|minor|trivial", "enum": ["critical", "major", "minor", "trivial"]},
"status": { "type": "string", "description": "Start-Status (default triage)"},
"attention_mode": { "type": "string", "description": "auto|ai_ready|needs_human", "enum": ["auto", "ai_ready", "needs_human"]},
"areas": { "type": "string", "description": "Komma-separierte Bereiche z.B. auth,chat"},
"product_id": { "type": "string", "description": "Optional: UUID oder external_id eines type=\'project\'-Tickets im selben Brand — setzt parent_id"}
  },
  "required": ["type", "title", "description"]
};
}

// enqueue_ticket
{
  const t = TOOLS[TOOLS.length] = {};
  t.name = 'enqueue_ticket';
  t.description = 'Reiht ein Ticket in den Software-Factory-Backlog ein (status=backlog).';
  t.inputSchema = {
  "type": "object",
  "properties": {
"id": { "type": "string", "description": "external_id z.B. T000123"},
"branch": { "type": "string", "description": "Optionaler Branch"},
"plan": { "type": "string", "description": "Optionaler Plan-Pfad"},
"brand": { "type": "string", "description": "mentolder oder korczewski (default: mentolder)", "enum": ["mentolder", "korczewski"]}
  },
  "required": ["id"]
};
}

// set_touched_files
{
  const t = TOOLS[TOOLS.length] = {};
  t.name = 'set_touched_files';
  t.description = 'Setzt die touched_files eines Tickets (Konflikt-/Scope-Tracking).';
  t.inputSchema = {
  "type": "object",
  "properties": {
"id": { "type": "string", "description": "external_id z.B. T000123"},
"files": { "type": "string", "description": "Komma- oder Whitespace-getrennte Pfade (wie ticket.sh erwartet)"},
"brand": { "type": "string", "description": "mentolder oder korczewski (default: mentolder)", "enum": ["mentolder", "korczewski"]}
  },
  "required": ["id", "files"]
};
}

// get_attachments
{
  const t = TOOLS[TOOLS.length] = {};
  t.name = 'get_attachments';
  t.description = 'Laesdt die Attachments eines Tickets in ein Zielverzeichnis (out_dir required).';
  t.inputSchema = {
  "type": "object",
  "properties": {
"id": { "type": "string", "description": "external_id z.B. T000123"},
"out_dir": { "type": "string", "description": "Zielverzeichnis (wird angelegt)"},
"brand": { "type": "string", "description": "mentolder oder korczewski (default: mentolder)", "enum": ["mentolder", "korczewski"]}
  },
  "required": ["id", "out_dir"]
};
}

// archive_plan
{
  const t = TOOLS[TOOLS.length] = {};
  t.name = 'archive_plan';
  t.description = 'Archiviert einen Plan und mergt den Delta-Spec in die SSOT.';
  t.inputSchema = {
  "type": "object",
  "properties": {
"id": { "type": "string", "description": "external_id z.B. T000123"},
"slug": { "type": "string", "description": "OpenSpec-Change-Slug"},
"branch": { "type": "string", "description": "Feature/Fix-Branch"},
"plan_file": { "type": "string", "description": "Pfad zur Plan-Datei"},
"pr": { "type": "string", "description": "Optionale PR-Nummer (integer)"},
"brand": { "type": "string", "description": "mentolder oder korczewski (default: mentolder)", "enum": ["mentolder", "korczewski"]}
  },
  "required": ["id", "slug", "branch", "plan_file"]
};
}

// add_pr_link
{
  const t = TOOLS[TOOLS.length] = {};
  t.name = 'add_pr_link';
  t.description = 'Verknuepft eine PR-Nummer mit einem Ticket (tickets.ticket_links kind=pr).';
  t.inputSchema = {
  "type": "object",
  "properties": {
"id": { "type": "string", "description": "external_id z.B. T000123"},
"pr": { "type": "string", "description": "PR-Nummer (integer)"},
"brand": { "type": "string", "description": "mentolder oder korczewski (default: mentolder)", "enum": ["mentolder", "korczewski"]}
  },
  "required": ["id", "pr"]
};
}

function handleToolCall(name, args) {
  try {
    var brand = args && args.brand || 'mentolder';
    var env = { BRAND: brand };
    switch(name) {
      case 'list_tickets': {
        return textResult(runTicket(['list','--brand',brand,'--limit',String(args && args.limit||200)].concat(args && args.status?['--status',args.status]:[]).concat(args && args.type?['--type',args.type]:[]).concat(args && args.attention_mode?['--attention-mode',args.attention_mode]:[]).concat(args && args.missing_id?['--missing-id']:[]).concat(args && args.include_test_data?['--include-test-data']:[]), env));
      }
      case 'get_ticket': { return textResult(runTicket(['get','--id',args && args.id], env)); }
      case 'export_tickets': { return textResult(runTicket(['list','--brand',brand,'--limit',String(args && args.limit||200)].concat(args && args.status?['--status',args.status]:[]).concat(args && args.type?['--type',args.type]:[]).concat(args && args.format?['--format',args.format]:[]), env)); }
      case 'export_ticket_timeline': { return textResult(runTicket(['get-timeline','--id',args && args.id,'--brand',brand], env)); }
      case 'triage_ticket': {
        if (args && args.status === 'plan_staged') return { isError: true, content: [{ type: 'text', text: "Cannot triage to status 'plan_staged' — stage the plan first (stage_plan). Use 'triage' or 'planning' instead." }] };
        return textResult(runTicket(['triage','--id',args && args.id,'--apply','--no-comment'].concat(args && args.status?['--status',args.status]:[]).concat(args && args.priority?['--priority',args.priority]:[]).concat(args && args.severity?['--severity',args.severity]:[]).concat(args && args.type?['--type',args.type]:[]).concat(args && args.attention_mode?['--attention-mode',args.attention_mode]:[]).concat(args && args.component?['--component',args.component]:[]), { BRAND: brand, VDA_NONINTERACTIVE: '1' }));
      }
      case 'backfill_ticket_id': { return textResult(runTicket(['backfill-id','--brand',brand], env)); }
      case 'set_plan_meta': {
        var ma=['plan-meta','set','--id',args && args.id];
        if (args && args.value_prop) ma.push('--value-prop', args.value_prop);
        if (args && args.effort) ma.push('--effort', args.effort);
        if (args && args.areas) ma.push('--areas', args.areas);
        if (args && args.depends_on) ma.push('--depends-on', args.depends_on);
        if (args && args.rank != null) ma.push('--rank', String(args.rank));
        return textResult(runTicket(ma, env));
      }
      case 'set_readiness_flag': { return textResult(runTicket(['plan-meta','set','--id',args && args.id,'--readiness', (args && args.flag) + '=' + (args && args.value)], env)); }
      case 'prepare_feature': { return handlePrepareFeature(args && args.id, brand, args); }
      case 'transition_status': { return textResult(runTicket(['update-status','--id',args && args.id,'--status',args && args.status].concat(args && args.resolution?['--resolution',args.resolution]:[]).concat(args && args.notes?['--notes',args.notes]:[]), env)); }
      case 'add_comment': { return textResult(runTicket(['add-comment','--id',args && args.id,'--body',args && args.body,'--author',args && (args.author||'claude-code'),'--visibility',args && (args.visibility||'internal')], env)); }
      case 'update_fields': { return handleUpdateFields(args && args.id, brand, args); }
      case 'report_mishap': { return handleReportMishap(args && args.title, args && args.description, args && args.component, args && args.type, brand); }
      case 'get_mishap_buffer': { return handleGetMishapBuffer(); }
      case 'flush_mishap_buffer': { return handleFlushMishapBuffer(brand); }
      case 'link_tickets': {
        if (!args || !args.from || !args.to) return { isError: true, content: [{ type: 'text', text: 'from and to are required' }] };
        return textResult(runTicket(['link-tickets','--from',args.from,'--to',args.to,'--kind',args.kind], env));
      }
      case 'get_ticket_links': {
        if (!args || !args.id) return { isError: true, content: [{ type: 'text', text: 'id is required' }] };
        return textResult(runTicket(['get-ticket-links','--id',args.id], env));
      }
      case 'record_phase_event': { return textResult(runTicket(['phase',args && args.id,args && args.phase,args && args.state].concat(args && args.detail?['--detail',args.detail]:[]).concat(args && args.driver?['--driver',args.driver]:[]), env)); }
      case 'record_grill_answers': {
        var ga=['grill','--id',args && args.id];
        if (args && args.questionnaire) ga.push('--questionnaire', args.questionnaire);
        if (args && args.answers) { (args.answers || '').split('\n').forEach(function(line){ line = line.trim(); if (line) ga.push('--answer', line); }); }
        if (args && args.no_comment) ga.push('--no-comment');
        return textResult(runTicket(ga, env));
      }
      case 'stage_plan': { return textResult(runTicket(['stage-plan','--id',args && args.id,'--branch',args && args.branch,'--plan',args && args.plan,(args && args.hold)?'--hold':'--no-hold'], env)); }
      case 'create_ticket': {
        if (args && args.status === 'plan_staged') return { isError: true, content: [{ type: 'text', text: "Cannot create a ticket with status 'plan_staged' — stage the plan first (stage_plan). Use status 'triage' for new tickets." }] };
        var ar=['create','--type',args && args.type,'--title',args && args.title,'--description',args && args.description,'--brand',brand];
        [['--priority','priority'],['--severity','severity'],['--status','status'],['--attention-mode','attention_mode'],['--areas','areas'],['--product-id','product_id']].forEach(function(fk){if(args && args[fk[1]])ar.push(fk[0],args[fk[1]]);});
        return textResult(runTicket(ar, env));
      }
      case 'enqueue_ticket': { var ar=['enqueue','--id',args && args.id];if(args && args.branch)ar.push('--branch',args.branch);if(args && args.plan)ar.push('--plan',args.plan);return textResult(runTicket(ar, env)); }
      case 'set_touched_files': { return textResult(runTicket(['set-touched-files','--id',args && args.id,'--files',args && args.files], env)); }
      case 'get_attachments': { return textResult(runTicket(['get-attachments','--id',args && args.id,'--out-dir',args && args.out_dir], env)); }
      case 'archive_plan': { var ar=['archive-plan','--id',args && args.id,'--slug',args && args.slug,'--branch',args && args.branch,'--plan-file',args && args.plan_file];if(args && args.pr)ar.push('--pr',args.pr);return textResult(runTicket(ar, env)); }
      case 'add_pr_link': { return textResult(runTicket(['add-pr-link','--id',args && args.id,'--pr',args && args.pr], env)); }
      default: return { isError: true, content: [{ type: 'text', text: 'unknown tool: ' + name }] };
    }
  } catch(e) { return { isError: true, content: [{ type: 'text', text: e.message || String(e) }] }; }
}


function handlePrepareFeature(id, brand, args) {
  var env = { BRAND: brand };
  var lines = [];
  function log(r) { var t = (r || '').trim(); if (t) lines.push(t); }
  function err(e) { lines.push('FEHLER: ' + e.message); }
  if (args.product_id) {
    try { log(runTicket(['set-parent', '--id', id, '--product-id', args.product_id], env)); }
    catch(e) { err(e); }
  }
  var ma = ['plan-meta', 'set', '--id', id];
  if (args.value_prop) ma.push('--value-prop', args.value_prop);
  if (args.effort) ma.push('--effort', args.effort);
  if (args.areas) ma.push('--areas', args.areas);
  if (args.depends_on) ma.push('--depends-on', args.depends_on);
  if (ma.length > 4) { try { log(runTicket(ma, env)); } catch(e) { err(e); } }
  ['spec_skizziert', 'abhaengigkeiten_klar', 'offene_fragen_geklaert', 'aufwand_geschaetzt'].forEach(function(f) {
    if (args[f] !== undefined) {
      try { log(runTicket(['plan-meta', 'set', '--id', id, '--readiness', f + '=' + args[f]], env)); }
      catch(e) { err(e); }
    }
  });
  if (args.attention_mode) {
    try { log(runTicket(['inject', '--id', id, '--fields', 'attention_mode=' + args.attention_mode], env)); }
    catch(e) { err(e); }
  }
  try { log(runTicket(['update-status', '--id', id, '--status', 'planning'], env)); }
  catch(e) { err(e); }
  return { content: [{ type: 'text', text: lines.join('\n') || '_()' }] };
}

function handleUpdateFields(id, brand, args) {
  if (!args.title && !args.description && !args.notes)
    return { content: [{ type: 'text', text: 'Keine Felder zum Aktualisieren angegeben.' }] };
  var outputs = [];
  if (args.title || args.description) {
    outputs.push(runTicket(['update-fields', '--id', id, '--title', args.title, '--description', args.description], { BRAND: brand }).trimEnd());
  }
  if (args.notes) {
    outputs.push(runTicket(['add-comment', '--id', id, '--body', args.notes, '--author', 'ticket-mcp', '--visibility', 'internal'], { BRAND: brand }).trimEnd());
  }
  return { content: [{ type: 'text', text: outputs.join('\n') }] };
}

function handleReportMishap(title, desc, comp, type, brand) {
  var vt = ['incident', 'broken', 'degraded', 'suspicious', 'security', 'drift', 'process'];
  if (vt.indexOf(type) < 0)
    return { isError: true, content: [{ type: 'text', text: 'Ungueltiger Typ: ' + type }] };
  if (isIncidentType(type)) {
    var extID = createIncidentTicket('', { title: title, description: desc, component: comp, type: type, reported_at: new Date().toISOString() }, brand);
    return { content: [{ type: 'text', text: 'Incident-Ticket angelegt: ' + extID + ' (attention_mode=needs_human). Kein Buffer-Eintrag.' }] };
  }
  var buf = readBuffer('');
  buf.push({ title: title, description: desc, component: comp, type: type, reported_at: new Date().toISOString() });
  if (buf.length < MISHAP_TRIGGER) {
    writeBuffer('', buf);
    var remaining = MISHAP_TRIGGER - buf.length;
    return { content: [{ type: 'text', text: 'Mishap gespeichert (' + buf.length + '/' + MISHAP_TRIGGER + '). Noch ' + remaining + ' bis zum Buffer-Flush.' }] };
  }
  discardBuffer(buf.slice(0, MISHAP_TRIGGER), brand);
  writeBuffer('', buf.slice(MISHAP_TRIGGER));
  var rem = buf.length - MISHAP_TRIGGER;
  return { content: [{ type: 'text', text: MISHAP_TRIGGER + ' Mishaps protokolliert und verworfen. Verbleibend: ' + rem + '.' }] };
}

function handleGetMishapBuffer() {
  var buf = readBuffer('');
  if (buf.length === 0) return { content: [{ type: 'text', text: 'Mishap-Buffer ist leer.' }] };
  var lines2 = [];
  for (var i = 0; i < buf.length; i++) {
    var e = buf[i];
    lines2.push((i + 1) + '. [' + e.type + '] ' + e.title + ' (' + e.component + ') -- ' + e.reported_at);
  }
  return { content: [{ type: 'text', text: 'Buffer: ' + buf.length + '/' + MISHAP_TRIGGER + ' Eintraege\n\n' + lines2.join('\n') }] };
}

function handleFlushMishapBuffer(brand) {
  var buf = readBuffer('');
  if (buf.length === 0) return { content: [{ type: 'text', text: 'Mishap-Buffer ist leer.' }] };
  discardBuffer(buf, brand);
  writeBuffer('', []);
  return { content: [{ type: 'text', text: 'Buffer geleert.' }] };
}
// ---- Main stdio loop ----
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
rl.on('line', (line) => {
  var trimmed = line.trim();
  if (!trimmed) return;
  var message;
  try { message = JSON.parse(trimmed); } catch(e) { writeMsg(fail(null, -32700, 'Parse error')); return; }
  var id = message.id;
  var method = message.method;
  var params = message.params;
  try {
    if (method === 'initialize') {
      writeMsg(ok(id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: SERVER_NAME, version: SERVER_VERSION } }));
    } else if (method === 'notifications/initialized' || method === 'notifications/cancelled') {
      return;
    } else if (method === 'ping') {
      writeMsg(ok(id, {}));
    } else if (method === 'tools/list') {
      writeMsg(ok(id, { tools: TOOLS }));
    } else if (method === 'tools/call') {
      writeMsg(ok(id, handleToolCall(params && params.name, params && params.arguments || {})));
    } else {
      writeMsg(fail(id, -32601, 'Method not found: ' + method));
    }
  } catch(e) { writeMsg(fail(id, -32603, 'Internal error: ' + e.message)); }
});
