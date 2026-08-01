// lib/exec.ts — execFile wrapper with timeout and error handling
//
// T002505: bis hierher war das ein Wrapper um child_process.exec, also um
// /bin/sh. Zwei Sinks interpolierten Query-Parameter direkt in den
// Kommandostring (sources/kubectl.ts `-n ${namespace}`, sources/ticket-mcp.ts
// `get ${extId}`), und beide Routen hingen an keiner Auth-Middleware — die
// Injection brauchte also nicht einmal ein Token.
//
// execFile startet KEINE Shell: Argumente gehen als argv direkt an das
// Programm, Metazeichen sind damit Daten und keine Syntax. Das ist die
// strukturelle Loesung; die Allowlists in den Sources sind Defense in Depth
// obendrauf, kein Ersatz.
//
// Es gibt bewusst KEIN execShell()-Gegenstueck. Die beiden Aufrufe, die frueher
// Shell-Syntax nutzten, brauchten sie nicht wirklich:
//   `2>/dev/null` — stderr wird hier ohnehin getrennt erfasst; wer es nicht
//                   braucht, liest es einfach nicht.
//   `|| true`     — ein Fehlschlag kommt als { ok: false } zurueck und wirft
//                   nicht; der Aufrufer entscheidet, ob ihn das stoert.
// Eine Shell-Variante wieder einzufuehren waere der Weg zurueck zum Defekt.
import { execFile as cpExecFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(cpExecFile);

export interface ExecResult {
  stdout: string;
  stderr: string;
  ok: boolean;
  error?: string;
}

/**
 * Fuehrt `bin` mit `args` aus — ohne Shell.
 *
 * @param bin       Programmname oder -pfad. NIE aus Nutzereingaben zusammensetzen.
 * @param args      Jedes Element wird als EIN Argument uebergeben. Ein Wert wie
 *                  "workspace; id" landet als ein einziger, harmloser Parameter.
 * @param timeoutMs Nach Ablauf wird der Prozess gekillt; das Ergebnis traegt
 *                  dann ok:false und einen timeout-Hinweis.
 */
export async function exec(
  bin: string,
  args: string[] = [],
  timeoutMs: number = 10000,
): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await execFileAsync(bin, args, {
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024, // 10 MB
      cwd: '/home/patrick/Bachelorprojekt',
    });
    return { stdout: stdout.trim(), stderr: stderr.trim(), ok: true };
  } catch (err: any) {
    return {
      stdout: err.stdout?.trim() || '',
      stderr: err.stderr?.trim() || '',
      ok: false,
      error: err.killed ? `timeout after ${timeoutMs}ms` : (err.message || 'command failed'),
    };
  }
}
