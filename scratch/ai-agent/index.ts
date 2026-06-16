import { createOpenAI } from '@ai-sdk/openai';
import { generateText, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import { execSync } from 'node:child_process';
import * as readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { readFileSync } from 'node:fs';

// Swap to 'gemma4:31b' once downloaded via:
//   ollama pull hf.co/google/gemma-4-31B-it-qat-q4_0-gguf
const MODEL = process.env.OLLAMA_MODEL ?? 'qwen3:4b';

// Ollama spricht OpenAI-kompatibles API auf :11434/v1
const ollama = createOpenAI({
  baseURL: 'http://localhost:11434/v1',
  apiKey:  'ollama', // Dummy — Ollama braucht keinen echten Key
});

const shellParams = z.object({ command: z.string().describe('Der auszuführende Shell-Befehl') });
const fileParams  = z.object({ path: z.string().describe('Pfad zur Datei') });
const timeParams  = z.object({});

const tools = {
  shell: tool({
    description: 'Führt einen Shell-Befehl aus und gibt stdout/stderr zurück',
    inputSchema: shellParams,
    // Shell-Ausführung ist hier Absicht (lokales CLI-Tool, kein Web-Endpunkt).
    // Niemals als HTTP-Endpunkt exponieren.
    execute: async ({ command }) => {
      try {
        return execSync(command, { encoding: 'utf8', timeout: 10_000, cwd: process.cwd() });
      } catch (err: unknown) {
        return `Fehler: ${(err as Error).message}`;
      }
    },
  }),

  readFile: tool({
    description: 'Liest den Inhalt einer Datei',
    inputSchema: fileParams,
    execute: async ({ path }) => {
      try {
        return readFileSync(path, 'utf8');
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
