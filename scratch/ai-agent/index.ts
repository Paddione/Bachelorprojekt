import { createOpenAI } from '@ai-sdk/openai';
import { generateText, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { readFile as readFileAsync } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';

const execFileAsync = promisify(execFile);

// Swap to 'gemma4:31b' once downloaded via:
//   ollama pull hf.co/google/gemma-4-31B-it-qat-q4_0-gguf
const MODEL = process.env.OLLAMA_MODEL ?? 'qwen3:4b';

// Ollama spricht OpenAI-kompatibles API auf :11434/v1
const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY;
if (!OLLAMA_API_KEY) {
  throw new Error('Environment variable OLLAMA_API_KEY must be set');
}
const ollama = createOpenAI({
  baseURL: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/v1',
  apiKey:  OLLAMA_API_KEY,
});

// Sandbox: Alle Datei-/Shell-Operationen sind auf das Projektverzeichnis beschränkt.
const PROJECT_ROOT = resolve(process.env.PROJECT_ROOT ?? process.cwd());

function assertInsideProject(absolute: string): void {
  const resolvedPath = resolve(absolute);
  const resolvedRoot = resolve(PROJECT_ROOT);
  
  if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(resolvedRoot + sep)) {
    throw new Error(`Pfad ${absolute} liegt ausserhalb des Projektverzeichnisses`);
  }
}

function parseArgs(command: string): string[] {
  const args: string[] = [];
  let current = '';
  let inDoubleQuote = false;
  let inSingleQuote = false;
  for (let i = 0; i < command.length; i++) {
    const char = command[i];
    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
    } else if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
    } else if (char === ' ' && !inDoubleQuote && !inSingleQuote) {
      if (current) {
        args.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }
  if (current) {
    args.push(current);
  }
  return args;
}

/** Nur lesende Befehle sind erlaubt — kein rm, mkfs, curl extern etc. */
const SHELL_ALLOWLIST = [
  /^git\b/, /^ls\b/, /^cat\b/, /^head\b/, /^tail\b/, /^wc\b/, /^find\b/,
  /^rg\b/, /^grep\b/, /^tree\b/, /^echo\b/, /^pwd\b/, /^which\b/,
  /^npm\s+(run|test|exec|why|ls|audit)\b/,
  /^pnpm\s+(run|test|exec|why|ls|audit)\b/,
  /^task\b/, /^node\b/, /^tsx\b/, /^npx\b/,
  /^mkdir\s+-p\b/, /^touch\b/, /^cp\b/, /^mv\b/, /^rm\s+-[rf]\b.*scratch\//,
  /^docker\s+(ps|logs|images|exec)\b/,
  /^kubectl\s+(get|logs|describe|top)\b/,
];

const shellParams = z.object({ command: z.string().describe('Shell-Befehl (nur lesende/analysierende Befehle erlaubt)') });
const fileParams  = z.object({ path: z.string().describe('Pfad zur Datei – relativ zum Projektverzeichnis oder absolut') });
const timeParams  = z.object({});

const tools = {
  shell: tool({
    description: 'Führt einen lesenden Shell-Befehl im Projektverzeichnis aus. Nur Allowlist-Befehle sind erlaubt.',
    inputSchema: shellParams,
    execute: async ({ command }) => {
      const trimmed = command.trim();
      const allowed = SHELL_ALLOWLIST.some((re) => re.test(trimmed));
      if (!allowed) {
        return `Fehler: Befehl nicht in der Allowlist: ${trimmed.split(/\s+/)[0]}`;
      }
      const args = parseArgs(trimmed);
      if (args.length === 0) {
        return 'Fehler: Leerer Befehl';
      }
      const file = args[0];
      const cmdArgs = args.slice(1);
      try {
        const { stdout } = await execFileAsync(file, cmdArgs, {
          timeout: 15_000,
          cwd: PROJECT_ROOT,
        });
        return stdout;
      } catch (err: unknown) {
        return `Fehler: ${(err as Error).message}`;
      }
    },
  }),

  readFile: tool({
    description: 'Liest den Inhalt einer Datei im Projektverzeichnis',
    inputSchema: fileParams,
    execute: async ({ path }) => {
      try {
        const absolute = resolve(PROJECT_ROOT, path);
        assertInsideProject(absolute);
        return await readFileAsync(absolute, 'utf8');
      } catch (err: unknown) {
        return `Fehler: ${(err as Error).message}`;
      }
    },
  }),

  currentTime: tool({
    description: 'Gibt die aktuelle Uhrzeit zurück',
    inputSchema: timeParams,
    execute: async () => new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }),
  }),
};

async function chat(prompt: string): Promise<string> {
  const { text, steps } = await generateText({
    model: ollama.chat(MODEL),
    prompt,
    tools,
    stopWhen: stepCountIs(8),
  });

  for (const step of steps) {
    for (const call of (step.toolCalls ?? [])) {
      console.log(`  [Tool: ${call.toolName}]`);
    }
  }

  return text;
}

async function main() {
  console.log(`Agent bereit — Modell: ${MODEL}`);
  console.log('Tippe "exit" zum Beenden.\n');

  const rl = readline.createInterface({ input: stdin, output: stdout });

  while (true) {
    let input: string;
    try {
      input = await rl.question('Du: ');
    } catch {
      break; // stdin wurde geschlossen (z.B. Pipe)
    }
    if (input.trim().toLowerCase() === 'exit') break;
    if (!input.trim()) continue;

    process.stdout.write('Agent: ');
    try {
      const response = await chat(input);
      console.log(response + '\n');
    } catch (err: unknown) {
      console.error(`Fehler: ${(err as Error).message}\n`);
    }
  }

  rl.close();
}

main().catch(console.error);
