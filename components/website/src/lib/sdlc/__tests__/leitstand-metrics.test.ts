import { describe, it, expect } from 'vitest';
import {
  buildRailSections,
  METRICS_WINDOW_DAYS,
  type CockpitMode,
  type Phase,
  type RailSection,
} from '../leitstand-metrics';
import { formatCycleTime } from '../factory-metrics-derive';

const ids = (sections: RailSection[]): string[] => sections.map((s) => s.id);

describe('buildRailSections', () => {
  it("mode='overview' → 4 Sektionen in fester Reihenfolge", () => {
    expect(ids(buildRailSections('overview', 'bauen', null))).toEqual([
      'attention',
      'epics',
      'agents',
      'models',
    ]);
  });

  it("mode='fokus', phase='planung' → 1 Sektion 'planning' mit dor/queue/ready", () => {
    const sections = buildRailSections('fokus', 'planung', null);
    expect(ids(sections)).toEqual(['planning']);
    expect(sections[0].items.map((i) => i.key)).toEqual(['dor', 'queue', 'ready']);
  });

  it("mode='fokus', phase='bauen' → 2 Sektionen 'factory','models'", () => {
    expect(ids(buildRailSections('fokus', 'bauen', null))).toEqual(['factory', 'models']);
  });

  it("mode='fokus', phase='review' → 1 Sektion 'prs'", () => {
    expect(ids(buildRailSections('fokus', 'review', null))).toEqual(['prs']);
  });

  it("mode='fokus', phase='deploy' → 1 Sektion 'deploy'", () => {
    expect(ids(buildRailSections('fokus', 'deploy', null))).toEqual(['deploy']);
  });

  it("mode='fokus', phase='ship' → 1 Sektion 'shipped'", () => {
    expect(ids(buildRailSections('fokus', 'ship', null))).toEqual(['shipped']);
  });

  it("mode='fokus', phase='triage' → [] (Default-Case wie in CockpitRail, keine neue Semantik)", () => {
    expect(buildRailSections('fokus', 'triage', null)).toEqual([]);
  });

  it("mode='insights', metrics=null → Sektionen 'metrics','traces', alle Metrik-Werte '—'", () => {
    const sections = buildRailSections('insights', 'deploy', null);
    expect(ids(sections)).toEqual(['metrics', 'traces']);
    const metricsSection = sections.find((s) => s.id === 'metrics');
    expect(metricsSection).toBeDefined();
    for (const item of metricsSection!.items) {
      expect(item.value).toBe('—');
    }
  });

  it("mode='insights' reicht echte Metriken durch (formatCycleTime-Re-Use statt Duplikat)", () => {
    const sections = buildRailSections('insights', 'deploy', {
      shipped: 5,
      avgCycleTimeH: 12,
      escalations: 2,
      daysCovered: 3,
    });
    const metricsSection = sections.find((s) => s.id === 'metrics')!;
    const byKey = Object.fromEntries(metricsSection.items.map((i) => [i.key, i.value]));
    expect(byKey.throughput).toBe('5');
    expect(byKey.escalations).toBe('2');
    expect(byKey.avg_time).toBe(formatCycleTime(12));
    expect(METRICS_WINDOW_DAYS).toBe(7);
  });
});

// Typ-Kompilierung: Mode/Phase-Union werden aus der lib importiert, nicht lokal nachgebaut.
const _modeUnion: CockpitMode = 'insights';
const _phaseUnion: Phase = 'planung';
void [_modeUnion, _phaseUnion];
