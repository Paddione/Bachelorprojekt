import { injectTheme } from './ui/theme';
import { currentUser } from './state';

async function main(): Promise<void> {
  (window as any).__brettIsZuschauer = true;
  injectTheme();
  const status = document.getElementById('share-status');
  const token = location.pathname.split('/').filter(Boolean).at(-1) ?? '';

  let roomToken: string;
  try {
    const resp = await fetch(`/api/zuschauer/${encodeURIComponent(token)}`);
    if (!resp.ok) throw new Error('invalid');
    ({ roomToken } = await resp.json());
  } catch {
    if (status) status.textContent = 'Zuschauer-Link ungültig oder abgelaufen.';
    return;
  }

  if (status) status.remove();
  currentUser.userId = 'anon';
  currentUser.name = 'Zuschauer';

  const params = new URLSearchParams({ room: roomToken, zuschauer_token: token });
  history.replaceState(null, '', `${location.pathname}?${params.toString()}`);

  const board = await import('./board-boot');
  await board.bootBoard();
}

main();
