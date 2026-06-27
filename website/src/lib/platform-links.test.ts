import { describe, it, expect } from 'vitest';
import { resolveServiceUrl, resolveHealthUrl, mapNamespaceForBrand } from './platform-links';

describe('mapNamespaceForBrand', () => {
  it('passes through non-korczewski brands', () => {
    expect(mapNamespaceForBrand('workspace', 'mentolder')).toBe('workspace');
    expect(mapNamespaceForBrand('website', 'unknown')).toBe('website');
  });

  it('rewrites workspace → workspace-korczewski for korczewski', () => {
    expect(mapNamespaceForBrand('workspace', 'korczewski')).toBe('workspace-korczewski');
  });

  it('rewrites website → website-korczewski for korczewski', () => {
    expect(mapNamespaceForBrand('website', 'korczewski')).toBe('website-korczewski');
  });

  it('passes through other namespaces even for korczewski', () => {
    expect(mapNamespaceForBrand('logging', 'korczewski')).toBe('logging');
  });
});

describe('resolveServiceUrl', () => {
  it('prefers an explicit url when set', () => {
    expect(resolveServiceUrl({ url: 'https://example.com', subdomain: 'app' }, 'brand.example')).toBe('https://example.com');
  });

  it('treats an empty url string as not set', () => {
    expect(resolveServiceUrl({ url: '   ', subdomain: 'app' }, 'brand.example')).toBe('https://app.brand.example');
    expect(resolveServiceUrl({ url: '', subdomain: 'app' }, 'brand.example')).toBe('https://app.brand.example');
  });

  it('builds subdomain.brandDomain when only subdomain is set', () => {
    expect(resolveServiceUrl({ url: null, subdomain: 'api' }, 'brand.example')).toBe('https://api.brand.example');
  });

  it('returns null when no url and no subdomain', () => {
    expect(resolveServiceUrl({ url: null, subdomain: null }, 'brand.example')).toBeNull();
  });

  it('returns null when subdomain is set but no brandDomain', () => {
    expect(resolveServiceUrl({ url: null, subdomain: 'api' }, '')).toBeNull();
  });
});

describe('resolveHealthUrl', () => {
  it('returns null when health_url is empty', () => {
    expect(resolveHealthUrl({ health_url: '' }, 'mentolder')).toBeNull();
    expect(resolveHealthUrl({ health_url: null }, 'mentolder')).toBeNull();
  });

  it('passes through templates without {ns} token', () => {
    expect(resolveHealthUrl({ health_url: 'https://example.com/health' }, 'mentolder')).toBe('https://example.com/health');
  });

  it('substitutes {ns} with the workspace default (no website. prefix)', () => {
    expect(resolveHealthUrl({ health_url: 'https://{ns}.example.com/health' }, 'mentolder')).toBe('https://workspace.example.com/health');
  });

  it('substitutes {ns} with workspace-korczewski when brand is korczewski and template has no website. prefix', () => {
    expect(resolveHealthUrl({ health_url: 'https://{ns}.example.com/health' }, 'korczewski')).toBe('https://workspace-korczewski.example.com/health');
  });

  it('substitutes {ns} with the website default when the template starts with https://website.', () => {
    expect(resolveHealthUrl({ health_url: 'https://website.{ns}.svc/health' }, 'mentolder')).toBe('https://website.website.svc/health');
  });
});
