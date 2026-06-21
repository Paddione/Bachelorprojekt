import { WhyMeStats } from '@/components/WhyMeStats';
import type { StatsProps } from '@/blocks/schema';

export function StatsBlock(props: StatsProps) {
  return <WhyMeStats stats={props.items} />;
}
