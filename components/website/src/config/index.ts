import type { BrandConfig } from './types';
import { mentolderConfig } from './brands/mentolder';
import { korczewskiConfig } from './brands/korczewski';
import { massageConfig } from './brands/massage';
import { presentationConfig } from './brands/presentation';

const brand = process.env.BRAND ?? 'mentolder';
export const config: BrandConfig = brand === 'korczewski' ? korczewskiConfig : brand === 'massage' ? massageConfig : brand === 'presentation' ? presentationConfig : mentolderConfig;
