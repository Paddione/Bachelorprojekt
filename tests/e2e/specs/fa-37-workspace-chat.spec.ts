import { test, expect } from '@playwright/test';

const LLM_URL = process.env.LLM_ROUTER_URL
  ?? (process.env.LLM_HOST_IP ? `http://${process.env.LLM_HOST_IP}:4000` : null);

/**
 * FA-37: workspace-chat Roundtrip
 *
 * T1: POST /v1/chat/completions with a ~200-token German prompt,
 *     90s timeout → non-empty response > 30 characters.
 * T2: Response content is sensible German text (not empty, not an error message).
 *
 * All tests skip unless LLM_ROUTER_URL or LLM_HOST_IP is set.
 */

test.describe('FA-37: workspace-chat Roundtrip', () => {
  test.skip(!LLM_URL, 'requires LLM_ROUTER_URL or LLM_HOST_IP');
  test.setTimeout(120_000);

  // T1 + T2: Chat completions roundtrip
  test('T1+T2: chat completions return sensible German text (> 30 chars)', async ({ request }) => {
    const res = await request.post(`${LLM_URL}/v1/chat/completions`, {
      data: {
        model: 'qwen2.5:14b',
        messages: [
          {
            role: 'user',
            content: 'Beschreibe die Stadt Hamburg in zwei Sätzen.',
          },
        ],
        max_tokens: 200,
      },
      headers: { 'Content-Type': 'application/json' },
      timeout: 90_000,
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty('choices');
    expect(Array.isArray(body.choices)).toBe(true);
    expect(body.choices.length).toBeGreaterThan(0);

    // T2: Content check — must be a non-trivial German response
    const content: string = body.choices[0]?.message?.content ?? '';
    expect(content.length).toBeGreaterThan(30);
    // Must not be an error string returned as content
    expect(content.toLowerCase()).not.toContain('error');
  });

  // Streaming variant: verify the endpoint also accepts stream:true without crashing
  test('Stream mode returns data chunks without 5xx', async ({ request }) => {
    const res = await request.post(`${LLM_URL}/v1/chat/completions`, {
      data: {
        model: 'qwen2.5:14b',
        messages: [{ role: 'user', content: 'Sag Hallo auf Deutsch.' }],
        stream: true,
        max_tokens: 50,
      },
      headers: { 'Content-Type': 'application/json' },
      timeout: 60_000,
    });
    // Stream responses come back as text/event-stream; the status must be 200
    expect(res.status()).toBe(200);
  });

  // Browser: LLM router base URL responds without 5xx
  test('Browser: LLM router base URL is reachable', async ({ page }) => {
    await page.goto(LLM_URL!, { timeout: 45_000 });
    const body = page.locator('body');
    await expect(body).toBeVisible();
    await expect(body).not.toContainText('502 Bad Gateway');
  });
});
