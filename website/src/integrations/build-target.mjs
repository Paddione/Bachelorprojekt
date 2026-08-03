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

export default function buildTargetIntegration() {
  const buildTarget = process.env.BUILD_TARGET || '';

  return {
    name: 'build-target',
    hooks: {
      'astro:routes:resolved'({ routes }) {
        if (!buildTarget) return;
        const filtered = filterRoutesByBuildTarget(routes, buildTarget);
        routes.length = 0;
        routes.push(...filtered);
      },
    },
  };
}
