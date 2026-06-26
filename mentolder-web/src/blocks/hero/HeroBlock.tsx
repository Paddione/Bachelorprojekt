import { Hero } from '@/components/Hero';
import type { HeroProps } from '@/blocks/schema';

export function HeroBlock(props: HeroProps) {
  return (
    <Hero
      title={props.title}
      titleEmphasis={props.titleEmphasis}
      subtitle={props.subtitle}
      tagline={props.tagline}
      avatarType={props.avatarType}
      avatarInitials={props.avatarInitials}
      avatarSrc={props.avatarSrc}
      personName={props.personName}
      personRole={props.personRole}
    />
  );
}
