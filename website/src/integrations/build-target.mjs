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
 * Infrastrukturelle Routen, die in JEDEM Build-Ziel erhalten bleiben müssen
 * (T002675). Ohne diese Allowlist filtert BUILD_TARGET=sdlc sie aus dem
 * Route-Manifest und die sdlc-console crasht in der Probe-Schleife (HTTP 404
 * auf /api/health) bzw. der OIDC-Login bricht ab (/api/auth/callback fehlt,
 * /login fehlt):
 *   - /api/health   → Liveness/Readiness-Probe (k3d/sdlc-stack/sdlc-console.yaml)
 *   - /api/auth/*   → OIDC-Login-Oberfläche (login, callback, me, logout)
 *   - /login.astro  → Login-Seite (sdlc-Seiten redirecten auf /login)
 */
const INFRA_ROUTE_SUBSTRINGS = ['/api/health', '/api/auth/'];
const INFRA_ROUTE_SUFFIXES = ['/login.astro'];

/** @param {string} component */
function isInfraRoute(component) {
  if (INFRA_ROUTE_SUBSTRINGS.some((s) => component.includes(s))) return true;
  return INFRA_ROUTE_SUFFIXES.some((s) => component.endsWith(s));
}

/**
 * @param {string} component
 * @param {'prod'|'sdlc'|string|undefined} buildTarget
 */
function keepRoute(component, buildTarget) {
  if (isInfraRoute(component)) return true;
  const isSdlc = component.includes('/sdlc/') || component.includes('\\sdlc\\');
  if (buildTarget === 'prod') return !isSdlc;
  if (buildTarget === 'sdlc') return isSdlc;
  return true;
}

/**
 * @param {ResolvedRoute[]} routes
 * @param {'prod'|'sdlc'|string|undefined} buildTarget
 * @returns {ResolvedRoute[]}
 */
export function filterRoutesByBuildTarget(routes, buildTarget) {
  if (!buildTarget) return routes;
  return routes.filter((route) => keepRoute(route.component || '', buildTarget));
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
        manifest.routes = manifest.routes.filter((route) =>
          keepRoute(routeComponent(route?.routeData), buildTarget)
        );
      },
    },
  };
}
