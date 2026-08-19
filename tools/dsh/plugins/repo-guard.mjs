/**
 * tools/dsh/plugins/repo-guard.mjs — Native guard plugin for DSH.
 *
 * Mirrors the logic of scripts/hooks/worktree-write-guard.sh as a typed
 * pre-execute listener. Write calls targeting paths outside the session cwd
 * are denied with a structured reason (the path and cwd).
 *
 * WHY BOTH BRIDGE AND PLUGIN (double-check is intentional):
 * The CC-Hook bridge (p2) maps PreToolUse → tools/pre-execute and runs the
 * shell guard. This plugin registers on the same waterfall independently.
 * Both enforce the same rule: writes outside the session cwd are denied.
 * A double denial is expected and harmless — the waterfall folds to the
 * most restrictive decision. If the two paths ever disagree on what to
 * deny, that is a finding, not noise.
 *
 * @module repo-guard
 */

const WRITE_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit'])

export const name = 'repo-guard'

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx) {
  ctx.on('tools/pre-execute', async (exec, next) => {
    // Only intercept write tools.
    if (!WRITE_TOOLS.has(exec.name)) {
      return next()
    }

    // Extract the target file path from tool args.
    const args = exec.args || {}
    const targetPath = args.file_path || args.notebook_path || args.path
    if (!targetPath || typeof targetPath !== 'string') {
      return next()
    }

    // Resolve to absolute path (relative paths resolve against cwd).
    const { resolve, isAbsolute } = await import('node:path')
    const absTarget = isAbsolute(targetPath)
      ? resolve(targetPath)
      : resolve(process.cwd(), targetPath)

    // Session working directory — the boundary.
    const sessionCwd = process.cwd()

    // If the resolved target is within the session cwd, allow.
    if (absTarget.startsWith(sessionCwd + '/') || absTarget === sessionCwd) {
      return next()
    }

    // Deny with structured reason — this is the key difference from the
    // shell hook: the plugin returns a typed denial that the UI can display.
    return {
      action: 'deny',
      reason: `Write outside session workspace denied by repo-guard: target=${absTarget} is outside cwd=${sessionCwd}. Use a path within the session workspace, or set WORKTREE_GUARD_BYPASS=1 to override.`
    }
  })
}
