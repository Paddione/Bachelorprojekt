// worktree-write-guard — registriert scripts/hooks/worktree-write-guard.sh
// als PreToolUse-Guard fuer opencode. [T900024]
//
// WARUM DIESE DATEI EXISTIERT:
// Der Guard ist ein Bash-Skript und damit harness-neutral, aber jede Harness
// muss ihn selbst aufrufen. Registriert war er bisher NUR in
// `.claude/settings.json` — opencode und agy liefen ohne. Ein Guard, den nur
// eine von mehreren Harnesses ausfuehrt, schuetzt nicht: es reicht, dass die
// zweite Session unter opencode laeuft, und beide Sessions schreiben wieder
// ungebremst in denselben Worktree (die T002355-M3-Lage, gegen die der Guard
// ueberhaupt gebaut wurde).
//
// Contract mit dem Skript (identisch zu Claude Code):
//   stdin  = {"tool_input": {"file_path": "<pfad>"}}
//   exit 0 = erlauben, exit 2 = ablehnen (stderr traegt die Begruendung)
// Jeder andere Exit-Code gilt als Fehler DES GUARDS und erlaubt — ein
// kaputter Guard darf die Session nicht lahmlegen (fail-open ist hier die
// bewusste Wahl: die Sperre ist kooperativ, kein Mandatory Locking).
//
// Notausgang wie ueberall: WORKTREE_GUARD_BYPASS=1 (das Skript prueft ihn selbst).

import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { join } from "node:path"

const GUARD_REL = "scripts/hooks/worktree-write-guard.sh"
const WRITE_TOOLS = new Set(["write", "edit", "patch", "multiedit", "notebookedit"])

function targetPath(args: Record<string, unknown> | undefined): string | undefined {
	for (const key of ["file_path", "filePath", "notebook_path", "path"]) {
		const v = args?.[key]
		if (typeof v === "string" && v.length > 0) return v
	}
	return undefined
}

export const WorktreeWriteGuard = async ({ directory }: { directory: string }) => {
	const guard = join(directory, GUARD_REL)

	return {
		"tool.execute.before": async (
			input: { tool: string },
			output: { args?: Record<string, unknown> },
		) => {
			if (!WRITE_TOOLS.has(input.tool.toLowerCase())) return
			const path = targetPath(output.args)
			if (!path) return
			if (!existsSync(guard)) return // anderes Repo / Guard nicht vorhanden

			const res = spawnSync("bash", [guard], {
				cwd: directory,
				input: JSON.stringify({ tool_input: { file_path: path } }),
				encoding: "utf8",
				timeout: 5000,
			})
			if (res.status !== 2) return // 0 = erlaubt; alles andere = Guard-Fehler -> fail-open

			throw new Error(res.stderr?.trim() || `WORKTREE-GUARD: Schreibzugriff auf ${path} abgelehnt.`)
		},
	}
}
