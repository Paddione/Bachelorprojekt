// scripts/lib/dense-embedding.d.mts
// Typisierte Exporte des EmbeddingGemma-Dense-Profils (SSOT).

export declare const DENSE_MODEL: 'embeddinggemma-300m';
export declare const DENSE_DIMENSIONS: 768;
export declare const DENSE_PROFILE: 'embeddinggemma-300m:768:Q8_0:v1';
export declare const DENSE_MAX_TOKENS: 2048;

export declare function profileContentHash(content: string): string;

export declare type DensePurpose = 'query' | 'index';

export declare function formatDenseInput(
  text: string,
  purpose: DensePurpose,
  title?: string,
): string;

export declare function assertDenseVectors(
  vectors: number[][],
  expectedCount: number,
): void;

export declare interface SplitDenseOptions {
  tokenize: (formattedText: string) => Promise<number>;
  purpose?: DensePurpose;
  maxTokens?: number;
  title?: string;
}

export declare function splitDenseText(
  text: string,
  options: SplitDenseOptions,
): Promise<string[]>;
