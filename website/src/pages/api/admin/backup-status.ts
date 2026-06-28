import type { APIRoute } from 'astro';
import { createK8sClient } from '../../../lib/k8s';
import { getSession, isAdmin } from '../../../lib/auth';

const DB_BACKUP_MAX_AGE_H = 48;
const PVC_BACKUP_MAX_AGE_H = 48;

export interface PipelineJob {
  name: string;
  startTime: string | null;
  completionTime: string | null;
  succeeded: boolean;
  failed: boolean;
  active: boolean;
}

export interface PipelineStatus {
  id: string;
  light: 'green' | 'yellow' | 'red' | 'gray';
  lastRun: string | null;
  lastSuccessfulUpload: string | null;
  succeeded: number;
  failed: number;
  active: number;
  schedule: string | null;
}

export function pickLatest(jobs: PipelineJob[]): PipelineJob | null {
  if (jobs.length === 0) return null;
  return jobs.reduce((latest, job) => {
    const latestTime = latest.startTime ?? latest.completionTime;
    const jobTime = job.startTime ?? job.completionTime;
    if (!latestTime) return job;
    if (!jobTime) return latest;
    return new Date(jobTime).getTime() > new Date(latestTime).getTime() ? job : latest;
  });
}

export function derivePipelineStatus(
  jobs: PipelineJob[],
  cronjob: { spec?: { schedule?: string } } | null,
  now: Date,
  maxAgeH: number,
): PipelineStatus {
  const schedule = cronjob?.spec?.schedule ?? null;

  if (jobs.length === 0) {
    return { id: '', light: 'gray', lastRun: null, lastSuccessfulUpload: null, succeeded: 0, failed: 0, active: 0, schedule };
  }

  const totalSucceeded = jobs.filter((j) => j.succeeded).length;
  const totalFailed = jobs.filter((j) => j.failed).length;
  const activeJobs = jobs.filter((j) => j.active);
  const active = activeJobs.length;

  const latest = pickLatest(jobs);
  const lastRun = latest?.startTime ?? latest?.completionTime ?? null;

  const succeededJobs = jobs.filter((j) => j.succeeded);
  const latestSucceeded = pickLatest(succeededJobs);
  const lastSuccessfulUpload = latestSucceeded?.completionTime ?? null;

  if (active > 0 && (latestSucceeded === null || (now.getTime() - new Date(latestSucceeded.completionTime ?? '').getTime()) / (1000 * 60 * 60) > maxAgeH)) {
    return { id: '', light: 'yellow', lastRun, lastSuccessfulUpload, succeeded: totalSucceeded, failed: totalFailed, active, schedule };
  }

  if (latest?.failed && latestSucceeded === null) {
    return { id: '', light: 'red', lastRun, lastSuccessfulUpload, succeeded: totalSucceeded, failed: totalFailed, active, schedule };
  }

  if (latest?.succeeded) {
    const ageH = (now.getTime() - new Date(latest.completionTime ?? '').getTime()) / (1000 * 60 * 60);
    if (ageH > maxAgeH) {
      return { id: '', light: 'yellow', lastRun, lastSuccessfulUpload, succeeded: totalSucceeded, failed: totalFailed, active, schedule };
    }
    return { id: '', light: 'green', lastRun, lastSuccessfulUpload, succeeded: totalSucceeded, failed: totalFailed, active, schedule };
  }

  if (latestSucceeded) {
    const ageH = (now.getTime() - new Date(latestSucceeded.completionTime ?? '').getTime()) / (1000 * 60 * 60);
    if (ageH > maxAgeH) {
      return { id: '', light: 'yellow', lastRun, lastSuccessfulUpload, succeeded: totalSucceeded, failed: totalFailed, active, schedule };
    }
    return { id: '', light: 'green', lastRun, lastSuccessfulUpload, succeeded: totalSucceeded, failed: totalFailed, active, schedule };
  }

  return { id: '', light: 'gray', lastRun, lastSuccessfulUpload, succeeded: 0, failed: 0, active: 0, schedule };
}

function mapJob(j: any): PipelineJob {
  return {
    name: j.metadata.name,
    startTime: j.status?.startTime ?? null,
    completionTime: j.status?.completionTime ?? null,
    succeeded: (j.status?.succeeded ?? 0) > 0,
    failed: (j.status?.failed ?? 0) > 0,
    active: (j.status?.active ?? 0) > 0,
  };
}

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  let k8s;
  try {
    k8s = await createK8sClient();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Kein Service-Account-Token gefunden.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const brand = (process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder').toLowerCase();
  const ns = brand === 'korczewski' ? 'workspace-korczewski' : 'workspace';

  const pipelines: PipelineStatus[] = [];
  const now = new Date();

  const pipelineDefs = [
    { id: 'db-backup', label: 'db-backup', maxAgeH: DB_BACKUP_MAX_AGE_H },
    { id: 'pvc-backup', label: 'pvc-backup', maxAgeH: PVC_BACKUP_MAX_AGE_H },
  ];

  const results = await Promise.allSettled(
    pipelineDefs.map(async (def) => {
      const [jobsData, cronData] = await Promise.all([
        k8s.get(`/apis/batch/v1/namespaces/${ns}/jobs?labelSelector=app%3D${def.label}`),
        k8s.get(`/apis/batch/v1/namespaces/${ns}/cronjobs/${def.label}`).catch(() => null),
      ]);
      const jobs = (jobsData.items ?? []).map(mapJob);
      const status = derivePipelineStatus(jobs, cronData, now, def.maxAgeH);
      return { ...status, id: def.id };
    }),
  );

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'fulfilled') {
      pipelines.push(result.value);
    } else {
      pipelines.push({
        id: pipelineDefs[i]?.id ?? 'unknown',
        light: 'gray',
        lastRun: null,
        lastSuccessfulUpload: null,
        succeeded: 0,
        failed: 0,
        active: 0,
        schedule: null,
      });
    }
  }

  return new Response(JSON.stringify({ pipelines, fetchedAt: now.toISOString() }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
