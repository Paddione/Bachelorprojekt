// Single source of truth for the Cockpit API contract (spec §8).
// Pure type declarations — no imports, no runtime code (S2-safe).

export type HealthStatus = 'green' | 'amber' | 'red';

export interface RollupMetrics {
  total: number;
  done: number;
  blocked: number;
  inProgress: number;
  open: number;
  pctDone: number;
}

export interface FeatureNode {
  id: string;
  extId: string;
  title: string;
  valueProp?: string;
  priority: string;
  health: HealthStatus;
  rollup: RollupMetrics;
  nextStep: boolean;
  discarded: boolean;
  majorFeature: boolean;
  suggestionComment?: string;
}

export interface ProductNode {
  id: string;
  extId: string;
  title: string;
  rollup: RollupMetrics;
  features: FeatureNode[];
}

export interface PortfolioPayload {
  products: ProductNode[];
}

export interface TicketRow {
  id: string;
  extId: string;
  title: string;
  status: string;
  priority: string;
  type: string;
  parentId?: string;
  planningRank?: number;
  estimateMinutes?: number;
  timeLoggedMinutes?: number;
  description?: string;
  component?: string;
  createdAt?: string;
}

export interface FeatureTickets {
  feature: FeatureNode;
  tickets: TicketRow[];
}

export interface BatchMutation {
  status?: string;
  priority?: string;
  parentId?: string | null;
  enqueue?: boolean;
}

export interface BatchResult {
  ticketId: string;
  success: boolean;
  error?: string;
}

export interface FeatureActionRequest {
  featureId: string;
  action: 'next_step' | 'discard' | 'major' | 'comment';
  value?: boolean | string;
}

export interface SuggestRequest {
  distribution?: 'equal' | 'manual';
  provider?: string;
  model?: string;
}

export interface SuggestResponse {
  suggestions: Array<{
    featureId: string;
    nextStep: boolean;
    reason: string;
  }>;
}
