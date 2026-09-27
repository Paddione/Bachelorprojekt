// Vision-Worker-Rolle (p5 Task 5.5): eine Chat-Anfrage mit Bild aus checks/,
// Antwort-JSON gegen checks/expected.json ({ fields, forbidden }).
import { existsSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { IMAGE_EXT, addUsage, chat, emptyResult, mimeFor, parseJsonLoose, walkFiles } from './_shared.mjs';

export async function runVisionWorker({ variant, inputs, endpoints, recorderUrls, timeoutMs = 300_000 }) {
  const events = [];
  const usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  const artifacts = { image: null };
  const checksDir = variant.checksDir;
  const expectedPath = join(checksDir, 'expected.json');
  if (!existsSync(expectedPath)) return { ...emptyResult([{ kind: 'infra_error' }]), infra: true, reason: `expected.json fehlt: ${expectedPath}` };
  const expected = JSON.parse(readFileSync(expectedPath, 'utf8'));
  const imageFile = walkFiles(checksDir).find((f) => IMAGE_EXT.has(extname(f).toLowerCase()));
  if (!imageFile) return { ...emptyResult([{ kind: 'infra_error' }]), infra: true, reason: `kein Bild in ${checksDir}` };
  artifacts.image = imageFile;
  const dataUrl = `data:${mimeFor(imageFile)};base64,${readFileSync(imageFile).toString('base64')}`;
  const brief = variant.briefPath && existsSync(variant.briefPath) ? readFileSync(variant.briefPath, 'utf8') : '';
  const url = recorderUrls?.visionWorker || endpoints?.visionWorker;
  const res = await chat(url, {
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: `${brief}\n\nAntworte ausschliesslich mit JSON {"fields":{...}} ohne weitere Keys.` },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      },
    ],
    model: (inputs && inputs.model) || 'vision-worker',
    params: { temperature: 0, max_tokens: 2048 },
    timeoutMs,
  });
  addUsage(usage, res.usage);
  if (!res.ok) return { ...emptyResult([...events, { kind: 'protocol_error' }]), usage, artifacts };
  const parsed = parseJsonLoose(res.message.content);
  if (!parsed || typeof parsed !== 'object') return { ...emptyResult([...events, { kind: 'protocol_error' }]), usage, artifacts };
  const fields = parsed.fields || parsed;
  const norm = (v) => String(v ?? '').trim().toLowerCase();
  const wanted = Object.entries(expected.fields || {});
  const correct = wanted.filter(([k, v]) => norm(fields[k]) === norm(Array.isArray(v) ? v.join(',') : v)).length;
  const outcome = wanted.length ? correct / wanted.length : 0;
  // Verbotene Elemente in der GESAMTEN Antwort suchen: Halluzinationen stehen
  // nicht zwingend unter `fields`.
  const haystack = norm(JSON.stringify(parsed));
  const forbidden = Array.isArray(expected.forbidden) ? expected.forbidden : [];
  const hits = forbidden.filter((token) => haystack.includes(norm(token)));
  events.push(...hits.map(() => ({ kind: 'hallucinated_element' })));
  return { outcome, events, usage, artifacts };
}
