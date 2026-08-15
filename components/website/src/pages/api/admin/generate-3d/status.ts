import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { getHistory, downloadOutput, findGlbOutput } from '../../../../lib/comfy-client';
import { rigGlb } from '../../../../lib/rigger-client';
import { getJob, updateJobStage, listRecentJobs, type GenerationJob } from '../../../../lib/generation-jobs';
import { pool } from '../../../../lib/website-db';

const COMFY_HOST_IP = import.meta.env.COMFY_HOST_IP ?? '';
const COMFY_PORT = import.meta.env.COMFY_PORT ?? '';
const BRETT_INTERNAL_URL = import.meta.env.BRETT_INTERNAL_URL ?? 'http://brett.workspace.svc.cluster.local:3000';
const BRETT_OIDC_SECRET = import.meta.env.BRETT_OIDC_SECRET ?? '';
const RIGGER_HOST_IP = import.meta.env.RIGGER_HOST_IP ?? COMFY_HOST_IP;
const RIGGER_PORT = import.meta.env.RIGGER_PORT ?? '8190';

function comfyBase(): string {
  return `http://${COMFY_HOST_IP}:${COMFY_PORT}`;
}

function riggerBase(): string {
  return `http://${RIGGER_HOST_IP}:${RIGGER_PORT}`;
}

export interface PipelineDeps {
  comfyFetch?: typeof fetch;
  riggerFetch?: typeof fetch;
  brettFetch?: typeof fetch;
}

async function finaliseJob(
  jobId: string,
  promptId: string,
  name: string,
  deps: PipelineDeps = {},
): Promise<void> {
  const comfyFetch = deps.comfyFetch ?? fetch;
  const riggerFetch = deps.riggerFetch ?? fetch;
  const brettFetch = deps.brettFetch ?? fetch;

  // ── Stage: generating → wait for ComfyUI ────────────────────────────────────
  await updateJobStage(jobId, 'generating');
  const history = await getHistory(comfyBase(), promptId, comfyFetch);
  const entry = history[promptId];
  if (!entry) return; // still queued — stay in 'generating'

  if (!entry.status.completed) {
    if (entry.status.status_str === 'error') {
      await updateJobStage(jobId, 'error', { error_msg: 'ComfyUI reported generation error' });
    }
    return;
  }

  const glbFilename = findGlbOutput(entry.outputs);
  if (!glbFilename) {
    await updateJobStage(jobId, 'error', { error_msg: 'No .glb output found in ComfyUI history' });
    return;
  }

  const rawGlb = await downloadOutput(comfyBase(), glbFilename, comfyFetch);

  // ── Stage: rigging → Blender rig via Rigger service ─────────────────────────
  await updateJobStage(jobId, 'rigging');
  let riggedGlb: ArrayBuffer;
  try {
    riggedGlb = await rigGlb(riggerBase(), rawGlb, `${name}.glb`, riggerFetch);
  } catch (err) {
    await updateJobStage(jobId, 'error', {
      error_msg: `Rigging failed: ${err instanceof Error ? err.message : String(err)}`,
    });
    return;
  }

  // ── Stage: uploading → Brett ────────────────────────────────────────────────
  await updateJobStage(jobId, 'uploading');
  const form = new FormData();
  form.append('glb', new Blob([riggedGlb], { type: 'model/gltf-binary' }), `${name}.glb`);
  form.append('name', name);
  const brettRes = await brettFetch(`${BRETT_INTERNAL_URL}/api/skins/upload`, {
    method: 'POST',
    headers: { 'x-e2e-secret': BRETT_OIDC_SECRET },
    body: form,
  });

  if (!brettRes.ok) {
    const msg = await brettRes.text();
    await updateJobStage(jobId, 'error', { error_msg: `Brett upload failed: ${msg}` });
    return;
  }

  const brettData = await brettRes.json();
  const skinId: string = brettData.id;

  // Register in assets.registry (type: model_3d)
  await pool.query(
    `INSERT INTO assets.registry (name, type, file_path, metadata)
     VALUES ($1, 'model_3d', $2, $3)
     ON CONFLICT (file_path) DO UPDATE SET updated_at = now()`,
    [name, `skins/${skinId}/skin.glb`, JSON.stringify({ skin_id: skinId, source: 'hunyuan3d-2', animations: brettData.animations ?? [] })],
  );

  // ── Stage: done ─────────────────────────────────────────────────────────────
  await updateJobStage(jobId, 'done', { skin_id: skinId });
}

export { finaliseJob };

// Timeout jobs older than 10 minutes that are not yet terminal.
async function timeoutOldJob(job: GenerationJob): Promise<boolean> {
  const age = Date.now() - new Date(job.created_at).getTime();
  const terminal = job.stage === 'done' || job.stage === 'error';
  if (age > 10 * 60 * 1000 && !terminal) {
    await updateJobStage(job.id, 'error', { error_msg: 'Generation timeout (>10 min)' });
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
  if (job.stage === 'done' || job.stage === 'error') {
    return new Response(JSON.stringify(job), { headers: { 'Content-Type': 'application/json' } });
  }

  if (await timeoutOldJob(job)) {
    const updated = await getJob(id);
    return new Response(JSON.stringify(updated), { headers: { 'Content-Type': 'application/json' } });
  }

  // Drive the pipeline forward one tick. (job is already non-terminal here:
  // the done/error early-return above narrows stage to queued|generating|rigging|uploading.)
  if (job.prompt_id) {
    try {
      await finaliseJob(job.id, job.prompt_id, job.name);
    } catch (err) {
      await updateJobStage(job.id, 'error', {
        error_msg: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const updated = await getJob(id);
  return new Response(JSON.stringify(updated), { headers: { 'Content-Type': 'application/json' } });
};
