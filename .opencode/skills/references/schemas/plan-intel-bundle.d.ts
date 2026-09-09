/**
 * Plan Intel Bundle — TypeScript mirror of plan-intel-bundle.schema.json.
 * Hand-maintained; the BATS drift-guard (tests/spec/dev-flow-plan.bats) asserts
 * top-level key parity with the JSON-Schema. Runtime path: openspec/changes/<slug>/intel.json
 */

export type IntelEdgeKind = "calls" | "data_flow" | "cross_service";
export type RiskSeverity = "info" | "warn" | "blocker";

export interface PlanIntelMeta {
  slug: string;
  ticket_id: string;
  generated_from: string;
  domains: string[];
  intel_sources: string[];
}

export interface ImpactFile {
  path: string;
  language: string;
  loc: number;
  s1_limit: number;
  s1_baseline: number | null;
  s1_budget: number;
}

export interface IntelSymbol {
  qualified_name: string;
  kind: string;
  file: string;
  signature: string;
  type_text: string;
  source: string;
}

export interface CallGraphEdge {
  from: string;
  to: string;
  kind: IntelEdgeKind;
}

export interface CallGraph {
  entrypoints: string[];
  edges: CallGraphEdge[];
}

export interface DbColumn {
  name: string;
  type: string;
  nullable: boolean;
  default: string | null;
  constraints: string[];
}

export interface DbTable {
  name: string;
  columns: DbColumn[];
}

export interface ApiContract {
  route: string;
  method: string;
  request_type: string;
  response_type: string;
  file: string;
}

export interface ExternalType {
  library: string;
  symbol: string;
  signature: string;
  source: string;
}

export interface Risk {
  note: string;
  severity: RiskSeverity;
}

export interface PlanIntelBundle {
  meta: PlanIntelMeta;
  impact_files: ImpactFile[];
  symbols: IntelSymbol[];
  call_graph?: CallGraph;
  db_tables?: DbTable[];
  api_contracts?: ApiContract[];
  external_types?: ExternalType[];
  risks?: Risk[];
}
