import { Hero } from '@/components/Hero';
import type { HeroProps } from '@/blocks/schema';

export function HeroBlock(props: HeroProps) {
  return (
    <Hero
      title={props.title}
      titleEmphasis={props.titleEmphasis}
      subtitle={props.subtitle}
      tagline={props.tagline}
      avatarType={props.avatarType === 'initials' ? 'initials' : 'initials'}
      avatarInitials={props.avatarInitials}
      personName={props.personName}
      personRole={props.personRole}
    />
  );
}
