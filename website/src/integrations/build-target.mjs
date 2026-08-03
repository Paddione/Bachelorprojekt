/**
 * Build-target integration (ADR-006 Etappe 1, T002624).
 *
 * BUILD_TARGET=prod|sdlc steuert, welche Routen im finalen SSR-Manifest landen.
 *
 * WARUM `astro:build:ssr` statt `astro:routes:resolved`:
 * Der `astro:routes:resolved`-Hook ist in Astro 7.1.6 read-only — Astro übergibt
 * jedem Integration eine frische `.map()`-Kopie der Routen und verwirft den
 * Rückgabewert. Eine Mutation dort ist toter Code. Der `astro:build:ssr`-Hook
 * dagegen bekommt das ECHTE `manifest`-Objekt per Referenz und `plugin-manifest.js`
 * serialisiert es ERST NACH dem Hook in den Server-Entry — eine Filterung von
 * `manifest.routes` wirkt also. (Nachgewiesen an node_modules/astro@7.1.6,
 * core/build/plugins/plugin-manifest.js: manifestBuildPostHook -> runHookBuildSsr
 * -> injectManifest. Verifiziert per Build: sdlc-Ziel enthält /kontakt nicht mehr.)
 */
/** @typedef {{ component?: string; pathname?: string }} ResolvedRoute */

/**
 * @param {ResolvedRoute[]} routes
 * @param {'prod'|'sdlc'|string|undefined} buildTarget
 * @returns {ResolvedRoute[]}
 */
export function filterRoutesByBuildTarget(routes, buildTarget) {
  if (!buildTarget) return routes;
  return routes.filter((route) => {
    const component = route.component || '';
    const isSdlc = component.includes('/sdlc/') || component.includes('\\sdlc\\');
    if (buildTarget === 'prod') return !isSdlc;
    if (buildTarget === 'sdlc') return isSdlc;
    return true;
  });
}

/** @param {import('astro').RouteData} routeData */
function routeComponent(routeData) {
  return routeData?.component || '';
}

export default function buildTargetIntegration() {
  const buildTarget = process.env.BUILD_TARGET || '';

  return {
    name: 'build-target',
    hooks: {
      'astro:build:ssr'({ manifest }) {
        if (!buildTarget || !manifest?.routes) return;
        const keep = (route) => {
          const component = routeComponent(route?.routeData);
          const isSdlc = component.includes('/sdlc/') || component.includes('\\sdlc\\');
          if (buildTarget === 'prod') return !isSdlc;
          if (buildTarget === 'sdlc') return isSdlc;
          return true;
        };
        manifest.routes = manifest.routes.filter(keep);
      },
    },
  };
}
