// Backwards-kompatible Weiterleitungen alter Admin-Pfade auf ihre neuen Hub-Ziele.
// Pfad -> Vollziel (inkl. Query-String, zeichengenau). Alle Treffer werden als 301 (permanent)
// ausgeliefert (siehe middleware.ts). Dynamische Routen (bugs, meetings/[id], brett/*) sind
// BEWUSST NICHT enthalten — sie bilden ihr Ziel zur Laufzeit aus Request-Daten.
//
// ADR-006 Etappe 1 (T002624): Die 12 SDLC-Seiten sind nach /sdlc/ umgezogen, Etappe 4
// (T002627) ist abgeschlossen. Die Karte lebt nur noch fuer Ziele, die im sdlc-Build
// existieren. /admin/pipeline wurde entfernt (T003737): die Seite war ein reiner
// Rueckwaerts-Redirect auf /admin/cockpit, und die Middleware gibt Query-Strings nicht
// weiter — der Kommentar behauptete bis T003826 fälschlich das Gegenteil. /admin/tickets
// zeigt auf das Cockpit, wo die Ticketliste seit T000752 lebt.
export const REDIRECT_MAP: Record<string, string> = {
  '/admin/cockpit': '/sdlc/cockpit',
  '/admin/observability': '/sdlc/observability',
  '/admin/repohealth': '/sdlc/repohealth',
  '/admin/software-history': '/sdlc/software-history',
  '/admin/architektur': '/sdlc/architektur',
  '/admin/platform': '/sdlc/platform',
  '/admin/app-catalog': '/sdlc/app-catalog',
  '/admin/prompts': '/sdlc/prompts',
  '/admin/ki-konfiguration': '/sdlc/ki-konfiguration',
  '/admin/systemtest/board': '/sdlc/systemtest/board',
  '/admin/tickets': '/sdlc/cockpit',
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
