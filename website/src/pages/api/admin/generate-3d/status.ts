import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { getHistory, downloadOutput, findGlbOutput } from '../../../../lib/comfy-client';
import { getJob, updateJobStatus, listRecentJobs } from '../../../../lib/generation-jobs';
import { pool } from '../../../../lib/website-db';

const COMFY_HOST_IP = import.meta.env.COMFY_HOST_IP ?? '';
const COMFY_PORT = import.meta.env.COMFY_PORT ?? '';
const BRETT_INTERNAL_URL = import.meta.env.BRETT_INTERNAL_URL ?? 'http://brett.workspace.svc.cluster.local:3000';
const BRETT_OIDC_SECRET = import.meta.env.BRETT_OIDC_SECRET ?? '';

function comfyBase(): string {
  return `http://${COMFY_HOST_IP}:${COMFY_PORT}`;
}

async function finaliseJob(jobId: string, promptId: string, name: string): Promise<void> {
  const history = await getHistory(comfyBase(), promptId);
  const entry = history[promptId];
  if (!entry) return; // still queued

  if (!entry.status.completed) {
    if (entry.status.status_str === 'error') {
      await updateJobStatus(jobId, 'error', { error_msg: 'ComfyUI reported generation error' });
    }
    return;
  }

  const glbFilename = findGlbOutput(entry.outputs);
  if (!glbFilename) {
    await updateJobStatus(jobId, 'error', { error_msg: 'No .glb output found in ComfyUI history' });
    return;
  }

  const glbBuffer = await downloadOutput(comfyBase(), glbFilename);

  // Forward to Brett
  const form = new FormData();
  form.append('glb', new Blob([glbBuffer], { type: 'model/gltf-binary' }), `${name}.glb`);
  form.append('name', name);
  const brettRes = await fetch(`${BRETT_INTERNAL_URL}/api/skins/upload`, {
    method: 'POST',
    headers: { 'x-e2e-secret': BRETT_OIDC_SECRET },
    body: form,
  });

  if (!brettRes.ok) {
    const msg = await brettRes.text();
    await updateJobStatus(jobId, 'error', { error_msg: `Brett upload failed: ${msg}` });
    return;
  }

  const brettData = await brettRes.json();
  const skinId: string = brettData.id;

  // Register in assets.registry
  await pool.query(
    `INSERT INTO assets.registry (name, type, file_path, metadata)
     VALUES ($1, 'model_3d', $2, $3)
     ON CONFLICT (file_path) DO UPDATE SET updated_at = now()`,
    [name, `skins/${skinId}/skin.glb`, JSON.stringify({ skin_id: skinId, source: 'hunyuan3d-2', animations: brettData.animations ?? [] })],
  );

  await updateJobStatus(jobId, 'done', { skin_id: skinId });
}

// Timeout jobs older than 10 minutes that are still pending/running.
async function timeoutOldJob(job: { id: string; created_at: string; status: string }): Promise<boolean> {
  const age = Date.now() - new Date(job.created_at).getTime();
  if (age > 10 * 60 * 1000 && (job.status === 'pending' || job.status === 'running')) {
    await updateJobStatus(job.id, 'error', { error_msg: 'Generation timeout (>10 min)' });
    return true;
  }
  return false;
}

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  // No id = list recent jobs
  if (!id) {
    const jobs = await listRecentJobs(20);
    return new Response(JSON.stringify(jobs), { headers: { 'Content-Type': 'application/json' } });
  }

  const job = await getJob(id);
  if (!job) {
    return new Response(JSON.stringify({ error: 'job not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Already terminal
  if (job.status === 'done' || job.status === 'error') {
    return new Response(JSON.stringify(job), { headers: { 'Content-Type': 'application/json' } });
  }

  if (await timeoutOldJob(job)) {
    return new Response(JSON.stringify({ ...job, status: 'error', error_msg: 'Generation timeout (>10 min)' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Finalise if ComfyUI is done and skin_id not yet set (idempotent guard)
  if (job.prompt_id && !job.skin_id) {
    try {
      await finaliseJob(job.id, job.prompt_id, job.name);
    } catch (err) {
      await updateJobStatus(job.id, 'error', {
        error_msg: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const updated = await getJob(id);
  return new Response(JSON.stringify(updated), { headers: { 'Content-Type': 'application/json' } });
};
