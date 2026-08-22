import { spawn } from 'child_process';
import type { HealthGoal } from './goals-data';
import { pool } from '../website-db';
import { findRepoRoot } from './repo-root';

export interface TicketOutcome {
  id: string;
  status: 'created' | 'skipped' | 'failed';
  ticketId?: string;
  existingTitle?: string;
  error?: string;
}

const TICKET_CREATE_TIMEOUT_MS = 30_000;
const DESCRIPTION_MAX_LEN = 2_000;

/** Stabiles, ID-tragendes Titel-Präfix — Dedup hängt am Präfix, nicht am Volltitel. */
export function goalTicketTitlePrefix(goalId: string): string {
  return `HEALTH:${goalId}`;
}

/**
 * Beschreibung mit Mess-Provenienz (CLAUDE.md-Konvention: eine Zahl ohne den
 * Befehl, der sie erzeugt hat, ist kein Beleg). Der Mess-Befehl steht vor der
 * Prosa — ein Abschneiden darf nie den Befehl treffen.
 */
export function goalTicketDescription(goal: HealthGoal): string {
  const direction = goal.direction === 'lower' ? 'senken (≤)' : 'steigern (≥)';
  const lines = [
    `Ziel-ID: ${goal.id}`,
    `Ist (dokumentiert): ${goal.current ?? 'k.A.'}`,
    `Zielwert: ${goal.target ?? 'k.A.'}`,
    `Richtung: ${direction}`,
    `Mess-Befehl: ${goal.measurement}`,
    `Quelle: ${goal.source}`,
    `Gemessen am: ${goal.measured_at}`,
    '',
    `Automatisch erzeugt aus dem Repo-Health-Dashboard (${goal.category}, Prio ${goal.priority}).`,
    goal.note ? `Hinweis: ${goal.note}` : '',
  ].filter(Boolean);
  return lines.join('\n').slice(0, DESCRIPTION_MAX_LEN);
}

async function findOpenTicket(prefix: string): Promise<{ external_id: string; title: string } | null> {
  const sql = `SELECT external_id, title FROM tickets.tickets
 WHERE title LIKE $1 || '%' AND status NOT IN ('done','archived','wont-fix')
 LIMIT 1`;
  const result = await pool.query(sql, [prefix]);
  return result.rows[0] ?? null;
}

function spawnTicketCreate(title: string, description: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      'bash',
      ['scripts/ticket.sh', 'create', '--type', 'feat', '--brand', 'mentolder',
       '--title', title, '--description', description, '--priority', 'mittel'],
      { cwd: findRepoRoot() },
    );
    let stdout = '';
    let stderr = '';
    proc.stdout!.on('data', (c) => { stdout += c; });
    proc.stderr!.on('data', (c) => { stderr += c; });
    const timer = setTimeout(() => { proc.kill(); reject(new Error('ticket.sh create Timeout')); },
      TICKET_CREATE_TIMEOUT_MS);
    proc.on('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`ticket.sh create endete mit ${code}: ${stderr.trim().slice(0, 200)}`));
      }
    });
    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * Legt je Ziel genau ein Verbesserungs-Ticket an — mit Dedup gegen offene
 * Tickets zur selben Ziel-ID. KEIN enqueue: der Factory-Dispatch bleibt eine
 * ausdrückliche Operator-Entscheidung. Ein Fehlschlag bei einem Ziel bricht
 * die übrigen nicht ab.
 */
export async function createGoalTickets(goals: HealthGoal[]): Promise<TicketOutcome[]> {
  const outcomes: TicketOutcome[] = [];
  for (const goal of goals) {
    const prefix = goalTicketTitlePrefix(goal.id);
    try {
      const open = await findOpenTicket(prefix);
      if (open) {
        outcomes.push({ id: goal.id, status: 'skipped', existingTitle: open.title });
        continue;
      }
      const out = await spawnTicketCreate(`${prefix} ${goal.title}`, goalTicketDescription(goal));
      const externalId = out.split('|')[0]?.trim() ?? '';
      if (!externalId) {
        outcomes.push({ id: goal.id, status: 'failed', error: 'ticket.sh lieferte keine external_id' });
        continue;
      }
      outcomes.push({ id: goal.id, status: 'created', ticketId: externalId });
    } catch (err) {
      outcomes.push({
        id: goal.id,
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return outcomes;
}
