/**
 * tools/dsh/plugins/audit-log.mjs — Audit plugin for DSH sessions.
 *
 * Subscribes to session events (turn/start, turn/end) and writes factory
 * phase events to tickets.factory_phase_events via scripts/dsh/session-audit.sh.
 * This uses the SAME channel as opencode-exec.sh — the three executors
 * share a single timeline for comparability.
 *
 * BEHAVIOR:
 * - Without TICKET_ID in env: writes nothing, no error. Ad-hoc sessions
 *   must not pollute the timeline with orphan entries.
 * - Write errors are logged and discarded (|| true pattern from opencode-exec.sh).
 *   An audit entry must never abort a session.
 *
 * @module audit-log
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export const name = 'audit-log'

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx) {
  const ticketId = process.env.TICKET_ID || ''
  if (!ticketId) {
    // No ticket context — silent no-op. Ad-hoc sessions must not fill the timeline.
    return
  }

  // Resolve the audit script path relative to the repo root.
  // When running inside a worktree, REPO_ROOT env var should be set;
  // fall back to process.cwd().
  const repoRoot = process.env.REPO_ROOT || process.cwd()
  const auditScript = `${repoRoot}/scripts/dsh/session-audit.sh`

  // Subscribe to durable session events for turn boundaries.
  ctx.on('session/event', async (event) => {
    const eventType = event?.type || ''

    // Map dsh session events to factory phase states.
    let phaseState = null
    let detail = ''

    if (eventType === 'turn/start') {
      phaseState = 'entered'
      detail = JSON.stringify({ executor: 'dsh', event: 'turn/start', turn_id: event?.turn?.id || '' })
    } else if (eventType === 'turn/end') {
      phaseState = 'done'
      detail = JSON.stringify({ executor: 'dsh', event: 'turn/end', turn_id: event?.turn?.id || '' })
    }

    if (!phaseState) return

    // Fire-and-forget: write the phase event via session-audit.sh.
    // Errors are logged and discarded — an audit entry must never abort a session.
    try {
      await execFileAsync('bash', [auditScript, ticketId, phaseState, detail], {
        timeout: 5000,
        env: { ...process.env, REPO_ROOT: repoRoot }
      })
    } catch (err) {
      console.error(`[audit-log] phase event write failed: ${err.message}`)
    }
  })
}
