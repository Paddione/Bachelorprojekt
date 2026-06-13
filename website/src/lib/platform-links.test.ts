import { describe, it, expect } from 'vitest';
import {
  resolveServiceUrl,
  resolveHealthUrl,
  mapNamespaceForBrand,
} from './platform-links';

// Minimaler Asset-Stub — nur die Felder, die die Helper lesen.
function asset(over: Partial<{ url: string | null; subdomain: string | null; health_url: string | null }> = {}) {
  return { url: null, subdomain: null, health_url: null, ...over };
}

describe('mapNamespaceForBrand', () => {
  it('mentolder lässt Namespaces unverändert', () => {
    expect(mapNamespaceForBrand('workspace', 'mentolder')).toBe('workspace');
    expect(mapNamespaceForBrand('website', 'mentolder')).toBe('website');
    expect(mapNamespaceForBrand('workspace-office', 'mentolder')).toBe('workspace-office');
  });

  it('korczewski mappt workspace/website, lässt workspace-office in Ruhe', () => {
    expect(mapNamespaceForBrand('workspace', 'korczewski')).toBe('workspace-korczewski');
    expect(mapNamespaceForBrand('website', 'korczewski')).toBe('website-korczewski');
    expect(mapNamespaceForBrand('workspace-office', 'korczewski')).toBe('workspace-office');
  });

  it('lässt unbekannte Namespaces (kube-system, cert-manager) unverändert', () => {
    expect(mapNamespaceForBrand('kube-system', 'korczewski')).toBe('kube-system');
    expect(mapNamespaceForBrand('cert-manager', 'korczewski')).toBe('cert-manager');
  });
});

describe('resolveServiceUrl', () => {
  it('bevorzugt den manuellen url-Override', () => {
    expect(resolveServiceUrl(asset({ url: 'https://custom.example', subdomain: 'auth' }), 'mentolder.de'))
      .toBe('https://custom.example');
  });

  it('baut https://<subdomain>.<brandDomain> wenn kein Override', () => {
    expect(resolveServiceUrl(asset({ subdomain: 'auth' }), 'mentolder.de'))
      .toBe('https://auth.mentolder.de');
  });

  it('funktioniert in dev mit PROD_DOMAIN=localhost', () => {
    expect(resolveServiceUrl(asset({ subdomain: 'auth' }), 'localhost'))
      .toBe('https://auth.localhost');
  });

  it('null wenn weder url noch subdomain gesetzt', () => {
    expect(resolveServiceUrl(asset(), 'mentolder.de')).toBeNull();
  });

  it('null wenn subdomain gesetzt aber brandDomain leer', () => {
    expect(resolveServiceUrl(asset({ subdomain: 'auth' }), '')).toBeNull();
  });
});

describe('resolveHealthUrl', () => {
  it('ersetzt {ns} durch workspace bei mentolder', () => {
    expect(resolveHealthUrl(asset({ health_url: 'http://keycloak.{ns}.svc.cluster.local:8080/health/ready' }), 'mentolder'))
      .toBe('http://keycloak.workspace.svc.cluster.local:8080/health/ready');
  });

  it('ersetzt {ns} durch workspace-korczewski bei korczewski', () => {
    expect(resolveHealthUrl(asset({ health_url: 'http://keycloak.{ns}.svc.cluster.local:8080/health/ready' }), 'korczewski'))
      .toBe('http://keycloak.workspace-korczewski.svc.cluster.local:8080/health/ready');
  });

  it('lässt collabora (kein {ns}) in beiden Brands unverändert', () => {
    const a = asset({ health_url: 'http://collabora.workspace-office.svc.cluster.local:9980/hosting/capabilities' });
    expect(resolveHealthUrl(a, 'mentolder')).toBe('http://collabora.workspace-office.svc.cluster.local:9980/hosting/capabilities');
    expect(resolveHealthUrl(a, 'korczewski')).toBe('http://collabora.workspace-office.svc.cluster.local:9980/hosting/capabilities');
  });

  it('mappt website-{ns}-Template korrekt auf website-korczewski', () => {
    // Health-Template nutzt {ns}; für website ist {ns} = "website" → korczewski "website-korczewski".
    // Wir testen über die website-Service-URL: http://website.{ns}... aber {ns} ist hier der
    // *namespace* des Dienstes. Für website ist der Namespace "website".
    expect(resolveHealthUrl(asset({ health_url: 'http://website.{ns}.svc.cluster.local' }), 'korczewski'))
      .toBe('http://website.website-korczewski.svc.cluster.local');
  });

  it('null wenn health_url fehlt', () => {
    expect(resolveHealthUrl(asset(), 'mentolder')).toBeNull();
  });
});
