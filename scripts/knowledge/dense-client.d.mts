// scripts/knowledge/dense-client.d.mts
// Strikte Typdeklarationen fuer den Gemma-Transport (dense-client.mjs).

export declare const DENSE_DIMENSIONS: 768;
export declare const DENSE_MAX_TOKENS: 2048;
export declare const DENSE_MODEL: 'embeddinggemma-300m';
export declare const DENSE_PROFILE: 'embeddinggemma-300m:768:Q8_0:v1';

export declare interface DenseEmbedResult {
  embeddings: number[][];
  tokens: number;
  model: 'embeddinggemma-300m';
  profile: 'embeddinggemma-300m:768:Q8_0:v1';
}

export declare interface DenseClientOptions {
  url: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export declare interface DenseClient {
  url: string;
  timeoutMs: number;
  tokenize(formattedText: string): Promise<number>;
  embedQueries(texts: string[]): Promise<DenseEmbedResult>;
  embedDocuments(texts: string[]): Promise<DenseEmbedResult>;
}

export declare function makeDenseClient(options?: DenseClientOptions): DenseClient;

export declare interface DenseSourceChunk {
  position: number;
  text: string;
  metadata?: Record<string, unknown>;
}

export declare interface DenseSubChunk {
  position: number;
  text: string;
  metadata: Record<string, unknown> & { sourcePosition: number; partIndex: number };
  sourcePosition: number;
  partIndex: number;
}

export declare function prepareDenseChunks(
  chunks: DenseSourceChunk[],
  client: Pick<DenseClient, 'tokenize'>,
): Promise<DenseSubChunk[]>;
