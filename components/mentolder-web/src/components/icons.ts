import iconFuehrung from '@/assets/icons/icon-fuehrung.svg?react';
import iconDigitalisierung from '@/assets/icons/icon-digitalisierung.svg?react';
import iconTeam from '@/assets/icons/icon-team.svg?react';
import iconStrategie from '@/assets/icons/icon-strategie.svg?react';
import iconKommunikation from '@/assets/icons/icon-kommunikation.svg?react';
import iconResilienz from '@/assets/icons/icon-resilienz.svg?react';

export const iconRegistry = {
  fuehrung: iconFuehrung,
  digitalisierung: iconDigitalisierung,
  team: iconTeam,
  strategie: iconStrategie,
  kommunikation: iconKommunikation,
  resilienz: iconResilienz,
} as const;

export type IconName = keyof typeof iconRegistry;

export const iconLabels: Record<IconName, string> = {
  fuehrung: 'Führung',
  digitalisierung: 'Digitalisierung',
  team: 'Team',
  strategie: 'Strategie',
  kommunikation: 'Kommunikation',
  resilienz: 'Resilienz',
};
