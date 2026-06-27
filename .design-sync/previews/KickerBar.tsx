import { KickerBar } from 'mentolder-web';

export function Default() {
  return (
    <div style={{ padding: '32px 24px', background: 'var(--ink-900, #0a0a0a)' }}>
      <KickerBar parts={['Digital Coach', 'Führungskräfte-Mentor']} />
    </div>
  );
}

export function MultiPart() {
  return (
    <div style={{ padding: '32px 24px', background: 'var(--ink-900, #0a0a0a)' }}>
      <KickerBar parts={['Beratung', 'Coaching', 'Führung', 'KI']} />
    </div>
  );
}

export function LightBackground() {
  return (
    <div style={{ padding: '32px 24px', background: 'var(--sand, #f5f0e8)' }}>
      <KickerBar parts={['Digital Coach', 'Führungskräfte-Mentor']} />
    </div>
  );
}
