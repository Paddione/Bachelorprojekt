import { useEffect } from 'react';

export interface PageMeta {
  title: string;
  description: string;
  /** Optional canonical path; defaults to current URL. */
  path?: string;
  /** Optional OG image URL (absolute or site-relative). */
  ogImage?: string;
  /** og:type. Defaults to "website". */
  ogType?: 'website' | 'article';
}

const SITE_NAME = 'mentolder';

function setMeta(name: string, content: string, attr: 'name' | 'property' = 'name') {
  if (!content) return;
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

/**
 * PageMeta — small side-effect component that updates the document head
 * with title, description, OG and canonical tags on mount. Reverts on
 * unmount by removing the tags it created (any pre-existing meta tags
 * with the same key are left untouched).
 */
export function PageMeta({ title, description, path, ogImage, ogType = 'website' }: PageMeta) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;

    setMeta('description', description);
    setMeta('og:title', `${title} · ${SITE_NAME}`, 'property');
    setMeta('og:description', description, 'property');
    setMeta('og:type', ogType, 'property');
    if (ogImage) {
      setMeta('og:image', ogImage, 'property');
    }
    if (path) {
      setMeta('og:url', path, 'property');
      setLink('canonical', path);
    }

    return () => {
      document.title = previousTitle;
    };
  }, [title, description, path, ogImage, ogType]);

  return null;
}
