import { useEffect, useState } from 'react';
import { PageMeta } from '@/components/PageMeta';
import { SITE } from '@/content';
import { BlockRenderer } from '@/blocks/BlockRenderer';
import { homepageSeed } from '@/blocks/seed';
import { HomepageBlocksDocument, type HomepageBlocksDocumentType } from '@/blocks/schema';
import { getHomepage } from '@/lib/homepageApi';

export function HomePage() {
  // Start from the bundled seed (instant first paint, SSR-safe), then swap in
  // the stored document once the website API responds. BlockRenderer also
  // validates, so an invalid/empty fetch leaves the seed in place.
  const [doc, setDoc] = useState<HomepageBlocksDocumentType>(homepageSeed);

  useEffect(() => {
    let active = true;
    getHomepage<HomepageBlocksDocumentType>()
      .then(({ document }) => {
        if (!active || !document) return;
        const parsed = HomepageBlocksDocument.safeParse(document);
        if (parsed.success) setDoc(parsed.data);
      })
      .catch(() => {
        /* offline / error → keep the seed */
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      <PageMeta
        title="Digital Coach & Führungskräfte-Mentor"
        description="Mit 30+ Jahren Führungserfahrung begleite ich Menschen und Organisationen bei der digitalen Transformation — praxisnah, empathisch und auf Augenhöhe."
        path={`${SITE.url}/`}
        ogImage={SITE.ogImage}
      />
      <BlockRenderer document={doc} />
    </>
  );
}
