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

const POD_COLUMNS =
  'NAME:.metadata.name,NAMESPACE:.metadata.namespace,STATUS:.status.phase,' +
  'RESTARTS:.status.containerStatuses[0].restartCount,AGE:.metadata.creationTimestamp';

/**
 * T002505: Defense in Depth neben dem argv-Aufbau. Die eigentliche Absicherung
 * ist, dass exec() keine Shell startet — hier wird zusaetzlich alles
 * abgewiesen, was ohnehin kein gueltiger Kubernetes-Namespace waere.
 * RFC 1123 label: Kleinbuchstaben, Ziffern und Bindestrich, 1..63 Zeichen,
 * Anfang und Ende alphanumerisch.
 */
export function isValidNamespace(ns: string): boolean {
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(ns);
}

/**
 * Baut die argv fuer `kubectl get pods`. Der Namespace ist ein EIGENES
 * argv-Element — nie Teil eines zusammengesetzten Strings wie '-n workspace'.
 * Genau diese Interpolation war der Injection-Punkt.
 */
export function buildPodsArgs(namespace?: string): string[] {
  return [
    '--context', 'fleet', 'get', 'pods',
    ...(namespace ? ['-n', namespace] : ['-A']),
    '--no-headers',
    '-o', `custom-columns=${POD_COLUMNS}`,
  ];
}

export async function getPods(namespace?: string): Promise<{ pods: PodInfo[] }> {
  if (namespace !== undefined && !isValidNamespace(namespace)) {
    throw new Error(`invalid namespace: ${JSON.stringify(namespace)}`);
  }
  const result = await exec('kubectl', buildPodsArgs(namespace), 10000);
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
    const result = await exec('kubectl', [
      '--context', 'fleet', 'get', 'pods', '-A', '--no-headers',
      '-o', 'custom-columns=NAME:.metadata.name,NAMESPACE:.metadata.namespace,STATUS:.status.phase,RESTARTS:.status.containerStatuses[0].restartCount',
    ], 10000);
    if (result.ok) {
      for (const line of result.stdout.split('\n').filter(Boolean)) {
        const parts = line.trim().split(/\s+/);
        const restarts = parseInt(parts[3]||'0',10);
        if (restarts > 5) warnings.push({ pod: parts[0], namespace: parts[1], issue: `${restarts} restarts`, severity: restarts > 20 ? 'critical' : 'warning' });
      }
    }
    // Frueher stand hier '2>/dev/null' im Kommandostring. Das brauchte eine
    // Shell — noetig war es nie: exec() liefert stderr getrennt zurueck, und
    // wir lesen hier ohnehin nur stdout.
    const sr = await exec('kubectl', [
      '--context', 'fleet', 'get', 'pods', '-A',
      '--field-selector=status.phase!=Running',
      '-o', 'custom-columns=NAME:.metadata.name,NAMESPACE:.metadata.namespace,STATUS:.status.phase',
      '--no-headers',
    ], 10000);
    if (sr.ok) for (const line of sr.stdout.split('\n').filter(Boolean)) {
      const parts = line.trim().split(/\s+/);
      if (parts[2]!=='Pending'&&parts[2]!=='Unknown') warnings.push({pod:parts[0],namespace:parts[1],issue:`Status: ${parts[2]}`,severity:'warning'});
    }
  } catch { /* best-effort */ }
  return warnings;
}
