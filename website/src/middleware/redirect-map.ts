// Backwards-kompatible Weiterleitungen alter Admin-Pfade auf ihre neuen Hub-Ziele.
// Pfad -> Vollziel (inkl. Query-String, zeichengenau). Alle Treffer werden als 301 (permanent)
// ausgeliefert (siehe middleware.ts). Dynamische Routen (bugs, meetings/[id], brett/*) sind
// BEWUSST NICHT enthalten — sie bilden ihr Ziel zur Laufzeit aus Request-Daten.
// /admin/pipeline steht NICHT in dieser Karte, da REDIRECT_MAP den Query-String nicht durchreicht;
// die query-erhaltende Weiterleitung von /admin/pipeline erfolgt in pipeline.astro.
//
// ADR-006 Etappe 1 (T002624): Die 12 SDLC-Seiten sind nach /sdlc/ umgezogen.
// Die Redirects sind befristet — mit Etappe 4 verschwinden die Routen aus dem
// Produktions-Image und die Einträge laufen ins Leere.
export const REDIRECT_MAP: Record<string, string> = {
  '/admin/cockpit': '/sdlc/cockpit',
  '/admin/pipeline': '/sdlc/pipeline',
  '/admin/observability': '/sdlc/observability',
  '/admin/repohealth': '/sdlc/repohealth',
  '/admin/software-history': '/sdlc/software-history',
  '/admin/architektur': '/sdlc/architektur',
  '/admin/platform': '/sdlc/platform',
  '/admin/app-catalog': '/sdlc/app-catalog',
  '/admin/prompts': '/sdlc/prompts',
  '/admin/ki-konfiguration': '/sdlc/ki-konfiguration',
  '/admin/systemtest/board': '/sdlc/systemtest/board',
  '/admin/tickets': '/sdlc/tickets',
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
  '/admin/planungsbuero': '/sdlc/cockpit?tab=planung',
  '/admin/dora': '/sdlc/cockpit?tab=analytics',
  '/admin/factory-budget': '/sdlc/cockpit?tab=kosten',
  '/admin/factory-observability': '/sdlc/cockpit?tab=kosten',
  '/admin/ops': '/sdlc/platform',
  '/admin/monitoring': '/sdlc/platform',
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
