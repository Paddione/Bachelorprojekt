import { WhyMeStats } from 'mentolder-web';

const STATS_FULL = [
  { value: '30+', label: 'Jahre Führungserfahrung' },
  { value: '200+', label: 'Mitarbeiter geführt' },
  { value: 'KI', label: 'Transformations-Expertise' },
  { value: 'B.Sc.', label: 'Wirtschaftsinformatik' },
];

const STATS_TWO = [
  { value: '15', target: 15, label: 'Projekte abgeschlossen' },
  { value: '98%', label: 'Kundenzufriedenheit' },
];

export function FourStats() {
  return (
    <div style={{ background: 'var(--ink-900, #0a0a0a)' }}>
      <WhyMeStats stats={STATS_FULL} />
    </div>
  );
}

export function TwoStats() {
  return (
    <div style={{ background: 'var(--ink-900, #0a0a0a)' }}>
      <WhyMeStats stats={STATS_TWO} />
    </div>
  );
}
