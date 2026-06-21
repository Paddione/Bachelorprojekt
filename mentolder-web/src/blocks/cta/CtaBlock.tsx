import { CallToAction } from '@/components/CallToAction';
import type { CtaProps } from '@/blocks/schema';

export function CtaBlock(props: CtaProps) {
  return (
    <CallToAction
      eyebrow={props.eyebrow}
      title={props.title}
      titleEmphasis={props.titleEmphasis}
      subtitle={props.subtitle}
      primaryText={props.primaryText}
      primaryHref={props.primaryHref}
      secondaryText={props.secondaryText}
      secondaryHref={props.secondaryHref}
    />
  );
}
