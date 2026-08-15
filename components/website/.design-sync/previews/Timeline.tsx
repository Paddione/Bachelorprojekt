// @ts-nocheck
// Authored preview — mentolder/kore PR-feed timeline, SSR-seeded with realistic rows
// so it renders without the /api/timeline fetch.
export const Default = () => {
  const { Timeline } = window.MentolderDS;
  return (
    <Timeline
      initialRows={[
        {
          id: 787,
          day: '2026-05-14',
          pr_number: 787,
          title: 'Fleet-Konsolidierung: beide Brands auf einem Cluster',
          description: 'mentolder und korczewski teilen sich jetzt den unified fleet-Cluster mit getrennten Namespaces.',
          category: 'infra',
          scope: 'cluster',
          brand: 'mentolder',
          requirement_id: 'NFA-12',
          bugs_fixed: 0,
          ticket_external_id: 'T000338',
          ticket_id: '338',
        },
        {
          id: 752,
          day: '2026-05-08',
          pr_number: 752,
          title: 'Newsletter-Anmeldung im Footer',
          description: 'Double-Opt-In Newsletter-Signup für die mentolder-Startseite.',
          category: 'feat',
          scope: 'website',
          brand: 'mentolder',
          requirement_id: 'FA-07',
          bugs_fixed: 0,
          ticket_external_id: 'T000291',
          ticket_id: '291',
        },
        {
          id: 740,
          day: '2026-05-02',
          pr_number: 740,
          title: 'Cookie-Banner: nur notwendige Cookies',
          description: 'DSGVO-konformer Consent-Banner ohne Tracking.',
          category: 'fix',
          scope: 'website',
          brand: 'mentolder',
          requirement_id: null,
          bugs_fixed: 2,
          ticket_external_id: null,
          ticket_id: null,
        },
        {
          id: 718,
          day: '2026-04-24',
          pr_number: 718,
          title: 'Leistungsseiten-Dokumentation überarbeitet',
          description: 'Inhaltsmodell und Admin-Workflow für Service-Seiten dokumentiert.',
          category: 'docs',
          scope: 'website',
          brand: 'mentolder',
          requirement_id: null,
          bugs_fixed: 0,
          ticket_external_id: 'T000260',
          ticket_id: '260',
        },
      ]}
    />
  );
};
