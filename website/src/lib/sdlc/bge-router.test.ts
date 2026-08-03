import { describe, test, expect, afterEach } from 'vitest';
import { resolveEndpoint, BgeRoutingError } from './bge-router';

const ORIGINAL_EMBED_URL = process.env.LLM_EMBED_URL;
const ORIGINAL_RERANKER_URL = process.env.LLM_RERANKER_URL;

afterEach(() => {
  if (ORIGINAL_EMBED_URL === undefined) delete process.env.LLM_EMBED_URL;
  else process.env.LLM_EMBED_URL = ORIGINAL_EMBED_URL;
  if (ORIGINAL_RERANKER_URL === undefined) delete process.env.LLM_RERANKER_URL;
  else process.env.LLM_RERANKER_URL = ORIGINAL_RERANKER_URL;
});

describe('bge-router resolveEndpoint', () => {
  test('resolves embed from LLM_EMBED_URL', () => {
    process.env.LLM_EMBED_URL = 'http://llm-gateway-embed:8081';
    expect(resolveEndpoint('embed')).toBe('http://llm-gateway-embed:8081');
  });

  test('resolves rerank from LLM_RERANKER_URL', () => {
    process.env.LLM_RERANKER_URL = 'http://llm-gateway-rerank:8081';
    expect(resolveEndpoint('rerank')).toBe('http://llm-gateway-rerank:8081');
  });

  test('throws BgeRoutingError when LLM_EMBED_URL is missing (fail-closed)', () => {
    delete process.env.LLM_EMBED_URL;
    expect(() => resolveEndpoint('embed')).toThrow(BgeRoutingError);
  });

  test('throws BgeRoutingError when LLM_RERANKER_URL is missing (fail-closed)', () => {
    delete process.env.LLM_RERANKER_URL;
    expect(() => resolveEndpoint('rerank')).toThrow(BgeRoutingError);
  });
});
