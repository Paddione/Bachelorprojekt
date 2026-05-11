import { writable, type Writable } from 'svelte/store';

export type BannerState =
  | { phase: 'idle' }
  | { phase: 'open'; code: string; hostName: string; humans: number; expiresAt: number }
  | { phase: 'in-progress'; code: string; alive: number; total: number }
  | { phase: 'closing' };

export const banner: Writable<BannerState> = writable({ phase: 'idle' });

let started = false;

function isDismissed(code: string): boolean {
  try { return sessionStorage.getItem(`arena:dismissed:${code}`) === '1'; }
  catch { return false; }
}

function isSilent(): boolean {
  try { return localStorage.getItem('arena:silent') === '1'; } catch { return false; }
}

export function dismissBanner(code: string) {
  try { sessionStorage.setItem(`arena:dismissed:${code}`, '1'); } catch {}
  banner.set({ phase: 'idle' });
}

export function startArenaStream(getToken: () => Promise<string>) {
  if (started || typeof window === 'undefined') return;
  started = true;
  if (isSilent()) return;

  (async () => {
    const token = await getToken();
    // EventSource has no header support; we use a header-less fallback via cookie + ad-hoc fetch loop.
    const stream = await fetch('/api/arena/active', { headers: { authorization: `Bearer ${token}` } });
    const reader = stream.body!.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const event = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const line = event.split('\n').find(l => l.startsWith('data: '));
        if (!line) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (!data.active) { banner.set({ phase: 'idle' }); continue; }
          if (isDismissed(data.code)) continue;
          if (data.phase === 'open') {
            const host = (data.players ?? []).find((p: any) => p.key === data.hostKey);
            banner.set({
              phase: 'open',
              code: data.code,
              hostName: host?.displayName ?? 'host',
              humans: (data.players ?? []).filter((p: any) => !p.isBot).length,
              expiresAt: data.expiresAt,
            });
          } else if (data.phase === 'in-match' || data.phase === 'starting') {
            const alive = (data.players ?? []).filter((p: any) => p.alive).length;
            banner.set({ phase: 'in-progress', code: data.code, alive, total: 4 });
          } else if (data.phase === 'closed') {
            banner.set({ phase: 'closing' });
            setTimeout(() => banner.set({ phase: 'idle' }), 600);
          }
        } catch {/* ignore parse errors */}
      }
    }
  })().catch(() => banner.set({ phase: 'idle' }));
}