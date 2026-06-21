import { PageMeta } from '@/components/PageMeta';
import { SITE } from '@/content';
import { BlockRenderer } from '@/blocks/BlockRenderer';
import { homepageSeed } from '@/blocks/seed';

export function HomePage() {
  return (
    <>
      <PageMeta
        title="Digital Coach & Führungskräfte-Mentor"
        description="Mit 30+ Jahren Führungserfahrung begleite ich Menschen und Organisationen bei der digitalen Transformation — praxisnah, empathisch und auf Augenhöhe."
        path={`${SITE.url}/`}
        ogImage={SITE.ogImage}
      />
      <BlockRenderer document={homepageSeed} />
    </>
  );
}
