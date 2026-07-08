export interface ModelProbeResult { reachable: boolean; models: string[]; }

/**
 * GET `<baseUrl>/models` and parse the OpenAI shape { data: [{ id }] }.
 * Any network/timeout/parse/non-2xx error → { reachable: false, models: [] }.
 * baseUrl is the endpoint root WITHOUT a trailing /models (e.g. http://host:1234/v1).
 */
export async function fetchModelIds(baseUrl: string, timeoutMs = 2000): Promise<ModelProbeResult> {
  try {
    const url = `${baseUrl.replace(/\/$/, '')}/models`;
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return { reachable: false, models: [] };
    const body = (await res.json().catch(() => null)) as { data?: { id?: unknown }[] } | null;
    const models = Array.isArray(body?.data)
      ? body!.data.map((m) => m?.id).filter((id): id is string => typeof id === 'string')
      : [];
    return { reachable: true, models };
  } catch {
    return { reachable: false, models: [] };
  }
}
