// fixtures/drive-recorder.mjs — startet einen Recorder, POSTet eine Anfrage,
// druckt Trace + Bilddateien als JSON.
// argv: <upstream> <rolle> <traceDatei> <bildVerzeichnis> <anfrage.json>
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { startRecorder } from '../../../../scripts/llm/agent-bench/lib/recorder.mjs';

const [upstream, role, traceFile, imageDir, requestFile] = process.argv.slice(2);
const request = JSON.parse(readFileSync(requestFile, 'utf8'));
const rec = await startRecorder({ upstream, role, traceFile, imageDir });
try {
  const res = await fetch(`${rec.url}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
  const text = await res.text();
  await new Promise((r) => setTimeout(r, 300));
  const trace = existsSync(traceFile)
    ? readFileSync(traceFile, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l))
    : [];
  const images = existsSync(imageDir) ? readdirSync(imageDir).sort() : [];
  console.log(JSON.stringify({ status: res.status, upstream_body: text.slice(0, 200), trace, images }));
} finally {
  await rec.close();
}
