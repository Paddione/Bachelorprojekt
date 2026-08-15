import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';
import { uploadImage, queuePrompt } from '../../../lib/comfy-client';
import { insertJob, setJobPromptId, updateJobStage } from '../../../lib/generation-jobs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const COMFY_HOST_IP = import.meta.env.COMFY_HOST_IP ?? '';
const COMFY_PORT = import.meta.env.COMFY_PORT ?? '';

function comfyBase(): string {
  return `http://${COMFY_HOST_IP}:${COMFY_PORT}`;
}

function loadWorkflow(imageFilename: string): object {
  const configPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '../../../../src/config/comfy-workflow-hunyuan3d.json',
  );
  const raw = readFileSync(configPath, 'utf8');
  return JSON.parse(raw.replace(/"__INPUT_IMAGE__"/g, JSON.stringify(imageFilename)));
}

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response('Unauthorized', { status: 401 });
  }
  if (!COMFY_HOST_IP || !COMFY_PORT) {
    return new Response(
      JSON.stringify({ error: 'ComfyUI not configured (COMFY_HOST_IP/COMFY_PORT missing)' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const form = await request.formData();
  const imageFile = form.get('image') as File | null;
  const name = (form.get('name') as string | null)?.trim();

  if (!imageFile || !name) {
    return new Response(JSON.stringify({ error: 'image and name required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const jobId = await insertJob(name);

  try {
    const imageBuffer = await imageFile.arrayBuffer();
    const comfyFilename = await uploadImage(comfyBase(), imageBuffer, imageFile.name);
    const workflow = loadWorkflow(comfyFilename);
    const promptId = await queuePrompt(comfyBase(), workflow);
    await setJobPromptId(jobId, promptId);
  } catch (err) {
    await updateJobStage(jobId, 'error', {
      error_msg: err instanceof Error ? err.message : String(err),
    });
    return new Response(JSON.stringify({ error: 'Failed to queue ComfyUI job', job_id: jobId }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ job_id: jobId }), {
    status: 202,
    headers: { 'Content-Type': 'application/json' },
  });
};
