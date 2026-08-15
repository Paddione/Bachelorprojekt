import { test } from 'node:test';
import assert from 'node:assert';
import {
  handleAdminSetOptik,
  buildStateFromMutations,
} from '../src/server/index';
import type { OptikSettings } from '../src/types/state';

// D4 — Board-Optik handler. admin_set_optik persists the optik in server state
// (via optik_set) AND propagates it to OTHER clients via lobby_settings_change.

test('handleAdminSetOptik persists optik and emits lobby_settings_change', () => {
  const room = 'admin-set-optik-d4';
  const settings: OptikSettings = { floor: 'felt-green', sky: 'dusk', lightMood: 'warm' };
  const collected: any[] = [];
  const collect = (m: any) => collected.push(m);

  const res = handleAdminSetOptik(room, settings, collect);
  assert.strictEqual(res.ok, true);

  // Propagation payload (to OTHER clients, §13).
  assert.deepStrictEqual(collected, [{ type: 'lobby_settings_change', optik: settings }]);

  // Server state persisted via optik_set.
  assert.deepStrictEqual(buildStateFromMutations(room).optik, settings);
});
