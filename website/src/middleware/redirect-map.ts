// Backwards-kompatible Weiterleitungen alter Admin-Pfade auf ihre neuen Hub-Ziele.
// Pfad -> Vollziel (inkl. Query-String, zeichengenau). Alle Treffer werden als 301 (permanent)
// ausgeliefert (siehe middleware.ts). Dynamische Routen (bugs, meetings/[id], brett/*) sind
// BEWUSST NICHT enthalten — sie bilden ihr Ziel zur Laufzeit aus Request-Daten.
export const REDIRECT_MAP: Record<string, string> = {
  '/admin/startseite': '/admin/inhalte?tab=website&section=startseite',
  '/admin/uebermich': '/admin/inhalte?tab=website&section=uebermich',
  '/admin/referenzen': '/admin/inhalte?tab=website&section=referenzen',
  '/admin/beratung': '/admin/inhalte?tab=website&section=beratung',
  '/admin/coaching': '/admin/inhalte?tab=website&section=coaching',
  '/admin/angebote': '/admin/inhalte?tab=website&section=angebote',
  '/admin/kontakt': '/admin/inhalte?tab=website&section=kontakt',
  '/admin/faq': '/admin/inhalte?tab=website&section=faq',
  '/admin/50plus-digital': '/admin/inhalte?tab=website&section=50plus-digital',
  '/admin/fuehrung-persoenlichkeit': '/admin/inhalte?tab=website&section=fuehrung-persoenlichkeit',
  '/admin/ki-transition': '/admin/inhalte?tab=website&section=ki-transition',
  '/admin/planungsbuero': '/admin/pipeline?tab=planung',
  '/admin/dora': '/admin/pipeline?tab=analytics',
  '/admin/factory-budget': '/admin/pipeline?tab=kosten',
  '/admin/factory-observability': '/admin/pipeline?tab=kosten',
  '/admin/ops': '/admin/platform',
  '/admin/monitoring': '/admin/platform',
  '/admin/tickets': '/admin/cockpit',
  '/admin/stream': '/admin/live',
  '/admin/newsletter': '/admin/dokumente',
  '/admin/wissensquellen': '/admin/wissen',
};

/** Loest einen eingehenden Pfad auf sein Redirect-Ziel auf, oder null bei keinem Treffer.
 *  Ein einzelner Trailing-Slash wird abgestreift (Astro trailingSlash:'ignore'), Root bleibt. */
export function resolveRedirect(pathname: string): string | null {
  const key = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  return REDIRECT_MAP[key] ?? null;
}
