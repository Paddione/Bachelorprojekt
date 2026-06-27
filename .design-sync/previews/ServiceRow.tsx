import { ServiceRow } from 'mentolder-web';

// Icons in the DS bundle are stubbed as empty spans — layout and typography
// are fully visible, icon slots appear as small inline gaps.
const SERVICES = [
  {
    id: 'fuehrung',
    title: 'Führungs-Coaching',
    description:
      'Individuelles Coaching für Führungskräfte in Change-Prozessen — empathisch, praxisnah und auf Augenhöhe.',
    features: [
      'Persönliche Standortbestimmung',
      'Führungsstil-Analyse',
      'Aktionsplan mit Milestones',
    ],
    price: 'auf Anfrage',
    href: '/coaching',
    icon: 'fuehrung' as const,
    meta: 'Einzelcoaching',
  },
  {
    id: 'digitalisierung',
    title: 'Digitale Transformation',
    description: 'Begleitung von Organisationen auf dem Weg in die digitale Zukunft — Strategie, Mensch und Technologie im Gleichgewicht.',
    features: [
      'Digital-Readiness-Assessment',
      'Roadmap & Change-Management',
      'Pilotprojekt-Begleitung',
    ],
    price: 'ab 3.500 €',
    priceUnit: 'pro Monat',
    href: '/transformation',
    icon: 'digitalisierung' as const,
    meta: 'Projekt',
  },
  {
    id: 'strategie',
    title: 'Strategie-Workshop',
    description: 'Kompakter Workshop zur Entwicklung einer tragfähigen Digital-Strategie mit Ihrem Führungsteam.',
    features: [
      '2-Tages-Format (Remote oder Präsenz)',
      'Ergebnisdokumentation',
      'Nachbetreuung 30 Tage',
    ],
    price: '4.800 €',
    priceUnit: 'pauschal',
    href: '/strategie',
    icon: 'strategie' as const,
  },
];

export function Default() {
  return (
    <div style={{ background: 'var(--ink-900, #0a0a0a)', padding: '0 24px' }}>
      <ServiceRow services={SERVICES} />
    </div>
  );
}

export function SingleService() {
  return (
    <div style={{ background: 'var(--ink-900, #0a0a0a)', padding: '0 24px' }}>
      <ServiceRow services={[SERVICES[0]]} />
    </div>
  );
}
