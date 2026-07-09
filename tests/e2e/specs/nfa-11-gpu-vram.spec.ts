import { test, expect } from '@playwright/test';

test.describe('NFA-11: GPU-VRAM nach Modell-Rotation', () => {
  test.setTimeout(180_000); // 5 minutes for 4 model loads

  test('T3: TEI-Dienst (llm-gateway-embed :8081) erreichbar', async ({ request }) => {
    test.skip(!process.env.LLM_HOST_IP, 'requires LLM_HOST_IP (GPU host on wg-mesh)');
    const teiUrl = `http://${process.env.LLM_HOST_IP}:8081/health`;
    const res = await request.get(teiUrl);
    expect(res.status()).toBe(200);
  });

  test('T3: TEI-Dienst (llm-gateway-rerank :8082) erreichbar', async ({ request }) => {
    test.skip(!process.env.LLM_HOST_IP, 'requires LLM_HOST_IP (GPU host on wg-mesh)');
    const teiUrl = `http://${process.env.LLM_HOST_IP}:8082/health`;
    const res = await request.get(teiUrl);
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

  test.skip(true, 'T2: nvidia-smi VRAM-Prüfung (< 14 GB) erfordert SSH-Zugriff auf GPU-Host');
});
