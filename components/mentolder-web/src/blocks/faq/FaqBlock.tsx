import { FAQ } from '@/components/FAQ';
import type { FaqProps } from '@/blocks/schema';

export function FaqBlock(props: FaqProps) {
  return <FAQ items={props.items} title={props.title} />;
}
