export type ServiceLinkAsset = {
  url: string | null;
  subdomain: string | null;
  health_url: string | null;
};

export function mapNamespaceForBrand(ns: string, brand: string): string {
  if (brand !== 'korczewski') return ns;
  if (ns === 'workspace') return 'workspace-korczewski';
  if (ns === 'website') return 'website-korczewski';
  return ns;
}

export function resolveServiceUrl(asset: Pick<ServiceLinkAsset, 'url' | 'subdomain'>, brandDomain: string): string | null {
  if (asset.url && asset.url.trim() !== '') return asset.url;
  if (asset.subdomain && asset.subdomain.trim() !== '' && brandDomain && brandDomain.trim() !== '') {
    return `https://${asset.subdomain}.${brandDomain}`;
  }
  return null;
}

export function resolveHealthUrl(asset: Pick<ServiceLinkAsset, 'health_url'>, brand: string): string | null {
  const tpl = asset.health_url;
  if (!tpl || tpl.trim() === '') return null;
  if (!tpl.includes('{ns}')) return tpl;
  const defaultNs = /^https?:\/\/website\./.test(tpl) ? 'website' : 'workspace';
  const ns = mapNamespaceForBrand(defaultNs, brand);
  return tpl.replaceAll('{ns}', ns);
}
