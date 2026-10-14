import { describe, expect, it } from 'vitest';
import { defaultEndpoints, parseExposition, parseNvidiaSmi, summarizeEndpoint } from './cockpit-serving';

const EXPO = `# HELP vllm:num_requests_running Number of requests currently running on GPU.
# TYPE vllm:num_requests_running gauge
vllm:num_requests_running{engine="0",model_name="w4a4"} 3.0
vllm:num_requests_waiting{engine="0",model_name="w4a4"} 7.0
vllm:num_requests_swapped{engine="0",model_name="w4a4"} 1.0
vllm:kv_cache_usage_perc{engine="0",model_name="w4a4"} 0.42
vllm:prompt_tokens_total{engine="0",model_name="w4a4"} 120.0
some_other_metric{foo="bar"} 9.0
malformed line without value
`;

describe('parseExposition', () => {
  it('nimmt nur gewollte Gauges, ignoriert HELP/TYPE/Fremdmetriken', () => {
    const names = parseExposition(EXPO).map((s) => s.name);
    expect(names).toContain('vllm:num_requests_running');
    expect(names).toContain('vllm:kv_cache_usage_perc');
    expect(names).not.toContain('vllm:prompt_tokens_total');
    expect(names).not.toContain('some_other_metric');
  });

  it('liest Labels und Werte', () => {
    const s = parseExposition(EXPO).find((x) => x.name === 'vllm:num_requests_running');
    expect(s?.labels.model_name).toBe('w4a4');
    expect(s?.value).toBe(3);
  });
});

describe('summarizeEndpoint', () => {
  it('verdichtet auf eine Zeile pro Endpunkt', () => {
    const row = summarizeEndpoint('http://x/metrics', EXPO);
    expect(row).toMatchObject({
      url: 'http://x/metrics',
      ok: true,
      model: 'w4a4',
      running: 3,
      waiting: 7,
      swapped: 1,
      kvCache: 0.42,
    });
  });

  it('liefert Nullen ohne vLLM-Serien', () => {
    const row = summarizeEndpoint('http://x/metrics', 'up 1.0\n');
    expect(row.ok).toBe(true);
    expect(row.running).toBe(0);
    expect(row.model).toBe('');
  });
});

describe('parseNvidiaSmi', () => {
  it('parst CSV-Zeilen', () => {
    const rows = parseNvidiaSmi(
      '0, NVIDIA GeForce RTX 3060 Ti, 6399 MiB, 8192 MiB, 11 %\n1, NVIDIA GeForce RTX 5070 Ti, 11982 MiB, 16303 MiB, 0 %\n',
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ index: '0', usedMiB: 6399, totalMiB: 8192, utilPct: 11 });
  });

  it('ignoriert Schrottzeilen', () => {
    expect(parseNvidiaSmi('index, name\n\n')).toHaveLength(0);
  });
});

describe('defaultEndpoints', () => {
  it('nimmt $VLLM_METRICS_ENDPOINTS wenn gesetzt', () => {
    process.env.VLLM_METRICS_ENDPOINTS = 'http://a/m http://b/m';
    expect(defaultEndpoints()).toEqual(['http://a/m', 'http://b/m']);
    delete process.env.VLLM_METRICS_ENDPOINTS;
  });

  it('faellt auf das lokale Set zurueck', () => {
    delete process.env.VLLM_METRICS_ENDPOINTS;
    expect(defaultEndpoints()).toEqual([
      'http://127.0.0.1:8123/metrics',
      'http://127.0.0.1:8002/metrics',
      'http://127.0.0.1:8003/metrics',
    ]);
  });
});
