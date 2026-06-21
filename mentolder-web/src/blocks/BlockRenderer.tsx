import type { ComponentType } from 'react';
import { HomepageBlocksDocument, SCHEMA_VERSION, type HomepageBlocksDocumentType } from './schema';
import { homepageSeed } from './seed';
import { HeroBlock } from './hero/HeroBlock';
import { StatsBlock } from './stats/StatsBlock';
import { ServicesBlock } from './services/ServicesBlock';
import { WhyMeBlock } from './whyMe/WhyMeBlock';
import { ProcessBlock } from './process/ProcessBlock';
import { FaqBlock } from './faq/FaqBlock';
import { CtaBlock } from './cta/CtaBlock';

type BlockProps = Record<string, unknown>;

const BLOCK_COMPONENTS: Record<string, ComponentType<BlockProps>> = {
  hero: HeroBlock as ComponentType<BlockProps>,
  stats: StatsBlock as ComponentType<BlockProps>,
  services: ServicesBlock as ComponentType<BlockProps>,
  whyMe: WhyMeBlock as ComponentType<BlockProps>,
  process: ProcessBlock as ComponentType<BlockProps>,
  faq: FaqBlock as ComponentType<BlockProps>,
  cta: CtaBlock as ComponentType<BlockProps>,
};

export interface BlockRendererProps {
  document?: HomepageBlocksDocumentType;
}

export function BlockRenderer({ document }: BlockRendererProps = {}) {
  const candidate = document ?? homepageSeed;
  const parsed = HomepageBlocksDocument.safeParse(candidate);

  const useSeed =
    !parsed.success || parsed.data.schemaVersion !== SCHEMA_VERSION;
  const blocks = useSeed ? homepageSeed.blocks : parsed.data.blocks;

  return (
    <>
      {blocks.map((block) => {
        const Component = BLOCK_COMPONENTS[block.type];
        if (!Component) return null;
        return <Component key={block.id} {...(block.props as BlockProps)} />;
      })}
    </>
  );
}
