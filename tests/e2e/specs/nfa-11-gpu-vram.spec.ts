import { test, expect } from '@playwright/test';

test.describe('NFA-11: GPU-VRAM nach Modell-Rotation', () => {
  test.setTimeout(180_000); // 5 minutes for 4 model loads

  // T002258: waren :8081 / :8082 (TEI-CPU-Container). bge-m3 und der Reranker
  // laufen seit T002110/PR #3150 als llama-server auf :8095 / :8096; die
  // TEI-Container wurden zurückgebaut (scripts/llm-host-setup.sh, Schritt 2).
  test('T3: Embedding-Dienst (llm-gateway-embed :8095) erreichbar', async ({ request }) => {
    test.skip(!process.env.LLM_HOST_IP, 'requires LLM_HOST_IP (GPU host on wg-mesh)');
    const embedUrl = `http://${process.env.LLM_HOST_IP}:8095/health`;
    const res = await request.get(embedUrl);
    expect(res.status()).toBe(200);
  });

  test('T3: Rerank-Dienst (llm-gateway-rerank :8096) erreichbar', async ({ request }) => {
    test.skip(!process.env.LLM_HOST_IP, 'requires LLM_HOST_IP (GPU host on wg-mesh)');
    const rerankUrl = `http://${process.env.LLM_HOST_IP}:8096/health`;
    const res = await request.get(rerankUrl);
    expect(res.status()).toBe(200);
  });

  test('T3: Ollama-API (:11434) erreichbar', async ({ request }) => {
    test.skip(!process.env.LLM_HOST_IP, 'requires LLM_HOST_IP (GPU host on wg-mesh)');
    const ollamaUrl = `http://${process.env.LLM_HOST_IP}:11434`;
    const res = await request.get(`${ollamaUrl}/api/tags`);
    expect(res.status()).toBe(200);
  });

  test('T1: Alle 4 Ollama-Modelle antworten', async ({ request }) => {
    test.skip(!process.env.LLM_HOST_IP, 'requires LLM_HOST_IP (GPU host on wg-mesh)');
    const ollamaUrl = `http://${process.env.LLM_HOST_IP}:11434`;
    const models = ['qwen2.5:14b', 'qwen2.5-coder:14b', 'qwen2.5vl:7b', 'llama3.2:3b'];

    for (const model of models) {
      const res = await request.post(`${ollamaUrl}/api/generate`, {
        data: { model, prompt: 'Hi', stream: false },
        timeout: 60_000,
      });
      expect([200]).toContain(res.status());
      console.log(`Model ${model}: OK`);
    }
  });
});
