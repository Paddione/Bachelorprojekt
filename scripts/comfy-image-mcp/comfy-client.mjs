// scripts/comfy-image-mcp/comfy-client.mjs — HTTP-Client fuer ComfyUI plus Bedarfsstart/-stopp (T900379, D4).
//
// ComfyUI-API: POST /prompt, GET /history/<id>, GET /view, POST /interrupt, GET /system_stats.
// Start und Stopp laufen ueber `systemctl --user … comfyui`; der Befehl ist injizierbar (Tests).

import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function run(cmd, args) {
  const r = spawnSync(cmd, args, { timeout: 30000, encoding: 'utf8' });
  return { ok: r.status === 0, out: `${r.stdout || ''}${r.stderr || ''}`.trim() || String(r.error || '') };
}

// Fehlermeldungen einer ComfyUI-Antwort (node_errors bzw. execution_error) zu einem Text.
export function comfyErrorText(body) {
  const parts = [];
  if (body?.error?.message) parts.push(body.error.message);
  for (const [node, e] of Object.entries(body?.node_errors || {})) {
    for (const x of e.errors || []) parts.push(`node ${node}: ${x.message}${x.details ? ` (${x.details})` : ''}`);
  }
  return parts.join('; ') || JSON.stringify(body).slice(0, 500);
}

export function createClient({ url, systemctl = 'systemctl', startTimeoutS = 180 }) {
  const base = url.replace(/\/+$/, '');
  const clientId = randomUUID();

  async function getJSON(path, timeoutMs = 3000) {
    const r = await fetch(base + path, { signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) throw new Error(`GET ${path}: HTTP ${r.status}`);
    return r.json();
  }

  async function stats() {
    try {
      return await getJSON('/system_stats');
    } catch {
      return null;
    }
  }

  async function isUp() {
    return (await stats()) !== null;
  }

  async function ensureUp() {
    if (await isUp()) return { started: false };
    const s = run(systemctl, ['--user', 'start', 'comfyui']);
    if (!s.ok) throw new Error(`systemctl --user start comfyui failed: ${s.out}`);
    const deadline = Date.now() + startTimeoutS * 1000;
    while (Date.now() < deadline) {
      if (await isUp()) return { started: true };
      await sleep(1000);
    }
    const log = run('journalctl', ['--user', '-u', 'comfyui', '-n', '20', '--no-pager']).out;
    throw new Error(`ComfyUI not ready after ${startTimeoutS}s. journalctl:\n${log}`);
  }

  function stop() {
    return run(systemctl, ['--user', 'stop', 'comfyui']);
  }

  async function submit(prompt) {
    const r = await fetch(`${base}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, client_id: clientId }),
      signal: AbortSignal.timeout(30000),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok || !body.prompt_id) throw new Error(`ComfyUI rejected the prompt: ${comfyErrorText(body)}`);
    return body.prompt_id;
  }

  // Pollt /history/<id> bis zum Ende; liefert die erste Bildreferenz der Ausgaben.
  async function waitHistory(id, deadline) {
    while (Date.now() < deadline) {
      const h = (await getJSON(`/history/${encodeURIComponent(id)}`).catch(() => null))?.[id];
      const st = h?.status;
      if (st?.status_str === 'error') {
        const msgs = (st.messages || []).filter(([k]) => k === 'execution_error').map(([, v]) => v.exception_message);
        throw new Error(`ComfyUI execution failed: ${msgs.join('; ') || 'unknown error'}`);
      }
      if (st?.completed) {
        const img = Object.values(h.outputs || {}).flatMap((o) => o.images || [])[0];
        if (!img) throw new Error('ComfyUI finished without an image output');
        return img;
      }
      await sleep(1000);
    }
    return null;
  }

  async function fetchImage(ref) {
    const q = new URLSearchParams({ filename: ref.filename, subfolder: ref.subfolder || '', type: ref.type || 'output' });
    const r = await fetch(`${base}/view?${q}`, { signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`GET /view: HTTP ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  }

  // Bricht den laufenden Prompt ab und entfernt promptId aus ComfyUIs Warteschlange,
  // falls er dort noch wartet (sonst belegte er spaeter die GPU).
  async function interrupt(promptId) {
    const post = (path, body) => fetch(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    }).catch(() => {});
    if (promptId) await post('/queue', { delete: [promptId] });
    await post('/interrupt', {});
  }

  return { stats, isUp, ensureUp, stop, submit, waitHistory, fetchImage, interrupt };
}
