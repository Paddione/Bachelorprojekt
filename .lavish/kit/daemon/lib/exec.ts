// lib/exec.ts — child_process.exec wrapper with timeout and error handling
import { exec as cpExec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(cpExec);

export interface ExecResult {
  stdout: string;
  stderr: string;
  ok: boolean;
  error?: string;
}

export async function exec(command: string, timeoutMs: number = 10000): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await execAsync(command, {
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
