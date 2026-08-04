import { describe, it, expect } from 'vitest';
import { filterRoutesByBuildTarget } from './build-target.mjs';

describe('build-target integration', () => {
  const mockRoutes: Array<{ component: string; pathname: string }> = [
    { component: '/app/src/pages/index.astro', pathname: '/' },
    { component: '/app/src/pages/kontakt.astro', pathname: '/kontakt' },
    { component: '/app/src/pages/admin/rechnungen.astro', pathname: '/admin/rechnungen' },
    { component: '/app/src/pages/sdlc/cockpit.astro', pathname: '/sdlc/cockpit' },
    { component: '/app/src/pages/sdlc/pipeline.astro', pathname: '/sdlc/pipeline' },
    { component: '/app/src/pages/sdlc/api/ops/status.ts', pathname: '/sdlc/api/ops/status' },
    { component: '/app/src/pages/api/auth/login.ts', pathname: '/api/auth/login' },
    { component: '/app/src/pages/api/health.ts', pathname: '/api/health' },
    { component: '/app/src/pages/login.astro', pathname: '/login' },
  ];

  it('keeps all routes when BUILD_TARGET is not set', () => {
    const result = filterRoutesByBuildTarget(mockRoutes, undefined);
    expect(result).toHaveLength(mockRoutes.length);
  });

  it('removes SDLC routes when BUILD_TARGET=prod', () => {
    const result = filterRoutesByBuildTarget(mockRoutes, 'prod');
    expect(result).toHaveLength(6);
    expect(result.find((r) => r.pathname === '/')).toBeDefined();
    expect(result.find((r) => r.pathname === '/kontakt')).toBeDefined();
    expect(result.find((r) => r.pathname === '/admin/rechnungen')).toBeDefined();
    expect(result.find((r) => r.pathname === '/api/auth/login')).toBeDefined();
    expect(result.find((r) => r.pathname === '/api/health')).toBeDefined();
    expect(result.find((r) => r.pathname === '/login')).toBeDefined();
    expect(result.find((r) => r.pathname === '/sdlc/cockpit')).toBeUndefined();
    expect(result.find((r) => r.pathname === '/sdlc/pipeline')).toBeUndefined();
    expect(result.find((r) => r.pathname === '/sdlc/api/ops/status')).toBeUndefined();
  });

  it('keeps SDLC + infra routes when BUILD_TARGET=sdlc', () => {
    const result = filterRoutesByBuildTarget(mockRoutes, 'sdlc');
    expect(result).toHaveLength(6);
    expect(result.find((r) => r.pathname === '/sdlc/cockpit')).toBeDefined();
    expect(result.find((r) => r.pathname === '/sdlc/pipeline')).toBeDefined();
    expect(result.find((r) => r.pathname === '/sdlc/api/ops/status')).toBeDefined();
    expect(result.find((r) => r.pathname === '/')).toBeUndefined();
    expect(result.find((r) => r.pathname === '/kontakt')).toBeUndefined();
    expect(result.find((r) => r.pathname === '/admin/rechnungen')).toBeUndefined();
  });

  it('keeps infrastructural routes for liveness probes and OIDC login when BUILD_TARGET=sdlc (T002675)', () => {
    const result = filterRoutesByBuildTarget(mockRoutes, 'sdlc');
    const paths = result.map((r) => r.pathname);
    expect(paths).toContain('/api/health');
    expect(paths).toContain('/api/auth/login');
    expect(paths).toContain('/login');
  });

  it('keeps all /api/auth/* and /api/health routes when BUILD_TARGET=sdlc', () => {
    const infraOnly = [
      { component: '/app/src/pages/api/health.ts', pathname: '/api/health' },
      { component: '/app/src/pages/api/auth/callback.ts', pathname: '/api/auth/callback' },
      { component: '/app/src/pages/api/auth/me.ts', pathname: '/api/auth/me' },
      { component: '/app/src/pages/api/auth/logout.ts', pathname: '/api/auth/logout' },
    ];
    const result = filterRoutesByBuildTarget(infraOnly, 'sdlc');
    expect(result).toHaveLength(4);
  });

  it('returns empty array when no routes match BUILD_TARGET=sdlc', () => {
    const noSdlc = [
      { component: '/app/src/pages/index.astro', pathname: '/' },
      { component: '/app/src/pages/kontakt.astro', pathname: '/kontakt' },
    ];
    const result = filterRoutesByBuildTarget(noSdlc, 'sdlc');
    expect(result).toHaveLength(0);
  });
});
