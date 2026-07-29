import { exec } from '../lib/exec';

export interface PodInfo {
  name: string; namespace: string; status: string;
  restarts: number; age: string; gpu?: string;
}
export interface ClusterWarning {
  pod: string; namespace: string; issue: string;
  severity: 'info' | 'warning' | 'critical';
}
type WarningsList = ClusterWarning[];

export async function getPods(namespace?: string): Promise<{ pods: PodInfo[] }> {
  const nsFlag = namespace ? `-n ${namespace}` : '-A';
  const result = await exec(
    `kubectl --context fleet get pods ${nsFlag} --no-headers -o custom-columns=NAME:.metadata.name,NAMESPACE:.metadata.namespace,STATUS:.status.phase,RESTARTS:.status.containerStatuses[0].restartCount,AGE:.metadata.creationTimestamp`,
    10000
  );
  if (!result.ok) throw new Error(`kubectl pods: ${result.error}`);
  const pods: PodInfo[] = result.stdout.split('\n').filter(Boolean).map(line => {
    const parts = line.trim().split(/\s+/);
    return { name: parts[0], namespace: parts[1], status: parts[2], restarts: parseInt(parts[3]||'0',10), age: parts[4] };
  });
  return { pods };
}

export async function getWarnings(): Promise<WarningsList> {
  const warnings: ClusterWarning[] = [];
  try {
    const result = await exec(`kubectl --context fleet get pods -A --no-headers -o custom-columns=NAME:.metadata.name,NAMESPACE:.metadata.namespace,STATUS:.status.phase,RESTARTS:.status.containerStatuses[0].restartCount`, 10000);
    if (result.ok) {
      for (const line of result.stdout.split('\n').filter(Boolean)) {
        const parts = line.trim().split(/\s+/);
        const restarts = parseInt(parts[3]||'0',10);
        if (restarts > 5) warnings.push({ pod: parts[0], namespace: parts[1], issue: `${restarts} restarts`, severity: restarts > 20 ? 'critical' : 'warning' });
      }
    }
    const sr = await exec(`kubectl --context fleet get pods -A --field-selector=status.phase!=Running -o custom-columns=NAME:.metadata.name,NAMESPACE:.metadata.namespace,STATUS:.status.phase --no-headers 2>/dev/null`, 10000);
    if (sr.ok) for (const line of sr.stdout.split('\n').filter(Boolean)) {
      const parts = line.trim().split(/\s+/);
      if (parts[2]!=='Pending'&&parts[2]!=='Unknown') warnings.push({pod:parts[0],namespace:parts[1],issue:`Status: ${parts[2]}`,severity:'warning'});
    }
  } catch { /* best-effort */ }
  return warnings;
}
