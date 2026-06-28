// Test fixture factories for Cockpit types.
// Import-only — no runtime dependencies on DB or API layers (S2-safe).
import type { RollupMetrics, FeatureNode, ProductNode, PortfolioPayload } from '../cockpit-types';

export function makeRollup(overrides?: Partial<RollupMetrics>): RollupMetrics {
  return {
    total: 1,
    done: 0,
    blocked: 0,
    inProgress: 0,
    awaitingDeploy: 0,
    open: 1,
    pctDone: 0,
    ...overrides,
  };
}

export function makeFeature(overrides?: Partial<FeatureNode>): FeatureNode {
  return {
    id: 'f1',
    extId: 'F1',
    title: 'Feature',
    priority: 'mittel',
    health: 'green',
    rollup: makeRollup(),
    nextStep: false,
    discarded: false,
    majorFeature: false,
    ...overrides,
  };
}

export function makeProduct(overrides?: Partial<ProductNode>): ProductNode {
  return {
    id: 'p1',
    extId: 'P1',
    title: 'Product',
    rollup: makeRollup(),
    features: [],
    ...overrides,
  };
}

export function makePortfolio(products?: ProductNode[]): PortfolioPayload {
  return { products: products ?? [makeProduct()] };
}
