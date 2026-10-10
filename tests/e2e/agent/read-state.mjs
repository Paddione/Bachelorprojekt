// Authenticated, same-origin observation for Brett apiEquals checks.
export async function readState(page, flow, base) {
  const text = await page.locator('body').innerText().catch(() => '');
  const observation = { url: page.url(), text, apiState: {} };
  if (!(flow?.goal_checks ?? flow?.checks ?? []).some(check => check.type === 'apiEquals')) {
    return observation;
  }

  let current, origin;
  try {
    origin = new URL(base).origin;
    current = new URL(observation.url);
  } catch {
    throw new Error('snapshot: invalid base or page URL');
  }
  if (current.origin !== origin) throw new Error('snapshot: page origin differs from base (authentication redirect?)');
  let room = current.searchParams.get('room');
  if (room === null) {
    let start;
    try {
      start = new URL(flow.start_url, base);
    } catch {
      throw new Error('snapshot: invalid start URL');
    }
    if (start.origin !== origin) throw new Error('snapshot: start URL origin differs from base');
    room = start.searchParams.get('room');
  }
  if (!room?.trim()) throw new Error('snapshot: room parameter is missing or empty');

  const url = `${origin}/api/sessions/${encodeURIComponent(room)}/snapshot`;
  let response;
  try {
    response = await page.context().request.get(url, { timeout: 10000, maxRedirects: 0 });
  } catch {
    // Playwright errors may include request headers, cookies or the room URL.
    throw new Error('snapshot: request failed (network or timeout)');
  }
  try {
    if (!response.ok()) throw new Error(`snapshot: HTTP ${response.status()}`);
    if (response.url() !== url) throw new Error('snapshot: unexpected response URL (authentication redirect?)');
    let snapshot;
    try {
      snapshot = await response.json();
    } catch {
      throw new Error('snapshot: response is not valid JSON');
    }
    const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    if (!object(snapshot) || !object(snapshot.state) ||
        typeof snapshot.recordedAt !== 'string' || !snapshot.recordedAt.trim()) {
      throw new Error('snapshot: invalid envelope (state and recordedAt required)');
    }
    observation.apiState = snapshot;
    return observation;
  } finally {
    // APIRequestContext retains response bodies until explicitly disposed.
    await response.dispose();
  }
}
