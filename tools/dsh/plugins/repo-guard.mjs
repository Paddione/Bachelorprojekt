/**
 * tools/dsh/plugins/repo-guard.mjs — Native guard plugin for DSH.
 *
 * Spiegelt scripts/hooks/worktree-write-guard.sh als typisierten
 * pre-execute-Listener: ein Schreibaufruf auf einen Pfad ausserhalb des
 * Sitzungs-Arbeitsverzeichnisses wird mit strukturierter Begruendung abgelehnt.
 *
 * WARUM BRIDGE UND PLUGIN NEBENEINANDER:
 * Die CC-Hook-Bridge bildet PreToolUse auf tools/pre-execute ab und faehrt den
 * Shell-Guard. Dieses Plugin haengt unabhaengig am selben Waterfall. Beide
 * setzen dieselbe Regel durch; eine doppelte Ablehnung ist erwartet und
 * unschaedlich (die Kette faltet restriktivst). Laufen beide Wege je
 * auseinander, ist das ein Befund, kein Rauschen.
 *
 * [T012965] Drei Korrekturen gegenueber der ersten Fassung — jede einzeln am
 * Upstream-Quelltext belegt, jede fuer sich machte den Guard wirkungslos:
 *
 *   1. Die Argumente stehen in `exec.arguments`, nicht `exec.args`
 *      (ToolExecutionInput, packages/core/tools/src/index.ts:323). Die alte
 *      Fassung las `exec.args || {}` — immer ein leeres Objekt, also fand sie
 *      nie einen Zielpfad und lehnte NIE etwas ab.
 *   2. Die Grenze ist die Sitzungs-cwd `exec.agent.session.header.cwd`, nicht
 *      `process.cwd()`. Letzteres ist das Verzeichnis des Harness-Klons; der
 *      Guard haette gegen den falschen Baum geprueft — Schreibzugriffe ins
 *      Repo abgelehnt und solche in den Klon erlaubt. Dasselbe Feld benutzt
 *      die Hook-Bridge (packages/hooks/hooks-claude-code/src/index.ts:328).
 *   3. Die Entscheidung heisst `{ kind: 'deny', reason }`, nicht
 *      `{ action: 'deny' }` (PreToolDecision, ebd. Zeile 588-591).
 *
 * @module repo-guard
 */
import { isAbsolute, resolve } from 'node:path'

export const name = 'repo-guard'

/**
 * Werkzeuge, die in eine Datei schreiben. Lesende Aufrufe passieren ungeprueft.
 *
 * [T012965] Die Namen sind KLEINGESCHRIEBEN und stammen aus dsh
 * (docs/tool-catalog.md: `write`, `edit`, `str_replace_editor`). Die erste
 * Fassung trug 'Write'/'Edit'/'NotebookEdit' — die Namen aus Claude Code, die
 * es in dsh nicht gibt. Der Guard sah damit nie einen Schreibaufruf.
 */
const WRITE_TOOLS = new Set(['write', 'edit', 'str_replace_editor'])

/** Argumentnamen, unter denen die Werkzeuge ihren Zielpfad fuehren. */
const PATH_KEYS = ['file_path', 'notebook_path', 'path']

/**
 * Zielpfad aus den geparsten Argumenten lesen.
 * @param {unknown} args
 * @returns {string | undefined}
 */
function targetPathOf(args) {
  if (!args || typeof args !== 'object') return undefined
  for (const key of PATH_KEYS) {
    const value = /** @type {Record<string, unknown>} */ (args)[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return undefined
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx) {
  ctx.on('tools/pre-execute', async (exec, next) => {
    if (!WRITE_TOOLS.has(exec.name)) return next()

    const targetPath = targetPathOf(exec.arguments)
    if (!targetPath) return next()

    // Die Grenze ist das Arbeitsverzeichnis DIESER Sitzung. Fehlt der Agent
    // (etwa bei einem Aufruf ausserhalb einer Sitzung), gibt es keine Grenze,
    // gegen die zu pruefen waere: dann wird delegiert statt gegen das
    // Prozessverzeichnis zu pruefen, das mit dem Vorgang nichts zu tun hat.
    const sessionCwd = exec.agent?.session?.header?.cwd
    if (!sessionCwd) return next()

    const absTarget = isAbsolute(targetPath) ? resolve(targetPath) : resolve(sessionCwd, targetPath)
    const absCwd = resolve(sessionCwd)
    if (absTarget === absCwd || absTarget.startsWith(absCwd + '/')) return next()

    return {
      kind: 'deny',
      reason:
        `repo-guard: Schreibzugriff ausserhalb des Sitzungs-Arbeitsverzeichnisses abgelehnt. ` +
        `Ziel=${absTarget}, Arbeitsverzeichnis=${absCwd}. ` +
        `Einen Pfad innerhalb des Arbeitsverzeichnisses waehlen.`,
    }
  })
}
