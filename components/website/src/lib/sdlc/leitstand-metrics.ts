// T008721 (E3-Review-Follow-up, M3): Bewusst OHNE Produktions-Import —
// ausschliesslich vitest-abgedeckt (__tests__/leitstand-metrics.test.ts).
// E4-Entscheidung: die Z1-Statusband-Livedaten kommen erst mit
// E4-Observability; diese Datei wird dann verdrahtet. Bis dahin weder
// entfernen (E4 braucht sie) noch importieren (toter Produktionscode).
import { formatCycleTime } from './factory-metrics-derive';
import type { DerivedMetrics } from './factory-metrics-derive';

export type Phase = 'triage' | 'planung' | 'bauen' | 'review' | 'deploy' | 'ship';
export type CockpitMode = 'overview' | 'fokus' | 'insights';
export interface RailSection { id: string; label: string; items: RailItem[] }
export interface RailItem { key: string; label: string; value: string; status?: 'green' | 'amber' | 'red'; href?: string }
export const METRICS_WINDOW_DAYS = 7;

export function buildRailSections(mode: CockpitMode, phase: Phase, metrics: DerivedMetrics | null): RailSection[] {
  switch (mode) {
    case 'overview':
      return [
        { id: 'attention', label: 'Aufmerksamkeit', items: [
          { key: 'blocked', label: 'Blockiert', value: '—' },
          { key: 'stuck', label: 'Festgefahren', value: '—' },
          { key: 'cooldown', label: 'Cooldown', value: '—' },
        ] },
        { id: 'epics', label: 'Laufende Epics', items: [] },
        { id: 'agents', label: 'Aktive Agenten', items: [{ key: 'count', label: 'Agenten aktiv', value: '—' }] },
        { id: 'models', label: 'Modell-Server', items: [
          { key: 'factory', label: 'Factory (8091)', value: '—', status: 'green' },
          { key: 'throughput', label: 'Throughput (8092)', value: '—', status: 'green' },
        ] },
      ];
    case 'fokus':
      switch (phase) {
        case 'planung': return [{ id: 'planning', label: 'Planung', items: [
          { key: 'dor', label: 'DoR-Score Ø', value: '—' }, { key: 'queue', label: 'Queue-Tiefe', value: '—' }, { key: 'ready', label: 'Ready', value: '—' },
        ] }];
        case 'bauen': return [
          { id: 'factory', label: 'Factory', items: [
            { key: 'slots', label: 'Slots belegt', value: '—' }, { key: 'active', label: 'Aktive Workpieces', value: '—' }, { key: 'lastTick', label: 'Letzter Tick', value: '—' },
          ] },
          { id: 'models', label: 'Modelle', items: [
            { key: 'factory', label: 'Factory (8091)', value: '—', status: 'green' }, { key: 'throughput', label: 'Throughput (8092)', value: '—', status: 'green' },
          ] },
        ];
        case 'review': return [{ id: 'prs', label: 'Pull Requests', items: [
          { key: 'open', label: 'Offen', value: '—' }, { key: 'ci_pass', label: 'CI bestanden', value: '—' }, { key: 'ci_fail', label: 'CI fehlgeschlagen', value: '—' },
        ] }];
        case 'deploy': return [{ id: 'deploy', label: 'Deployment', items: [
          { key: 'awaiting', label: 'Awaiting Deploy', value: '—' }, { key: 'flux', label: 'FluxCD Status', value: '—', status: 'green' },
        ] }];
        case 'ship': return [{ id: 'shipped', label: 'Ausgeliefert', items: [
          { key: 'this_week', label: 'Diese Woche', value: '—' }, { key: 'last_week', label: 'Letzte Woche', value: '—' },
        ] }];
        default: return [];
      }
    case 'insights':
      return [
        { id: 'metrics', label: 'Metriken', items: [
          { key: 'throughput', label: `Ausgeliefert (${METRICS_WINDOW_DAYS}d)`, value: metrics ? String(metrics.shipped) : '—' },
          { key: 'avg_time', label: 'Ø Zeit plan→done', value: formatCycleTime(metrics?.avgCycleTimeH ?? null) },
          { key: 'escalations', label: `Eskalationen (${METRICS_WINDOW_DAYS}d)`, value: metrics ? String(metrics.escalations) : '—' },
        ] },
        { id: 'traces', label: 'Traces', items: [{ key: 'recorded', label: 'Aufgezeichnet', value: '—' }, { key: 'today', label: 'Heute', value: '—' }] },
      ];
  }
}
