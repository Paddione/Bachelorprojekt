import { it, expect, vi, beforeEach } from 'vitest';
import { createBehaviorStore } from './behaviorStore';

beforeEach(() => vi.useFakeTimers());

it('autosaves once after debounce when valid', async () => {
  const saveFn = vi.fn().mockResolvedValue({ version: 2 });
  const s = createBehaviorStore({ contentKey: 'kontakt', initialValue: { footerEmail: 'a@b.de' }, initialVersion: 1, validate: () => [], saveFn, debounceMs: 2000 });
  s.setValue({ footerEmail: 'c@d.de' });
  expect(s.get().state).toBe('dirty');
  await vi.advanceTimersByTimeAsync(2000);
  expect(saveFn).toHaveBeenCalledTimes(1);
  expect(saveFn).toHaveBeenCalledWith('kontakt', 1, { footerEmail: 'c@d.de' });
  expect(s.get().state).toBe('saved');
  expect(s.get().version).toBe(2);
});

it('enters conflict on 409 and stops autosaving', async () => {
  const saveFn = vi.fn().mockRejectedValue({ status: 409, body: { currentVersion: 5, currentValue: { footerEmail: 'x@y.de' } } });
  const s = createBehaviorStore({ contentKey: 'kontakt', initialValue: {}, initialVersion: 1, validate: () => [], saveFn, debounceMs: 1000 });
  s.setValue({ footerEmail: 'c@d.de' });
  await vi.advanceTimersByTimeAsync(1000);
  expect(s.get().state).toBe('conflict');
  expect(s.get().conflict?.currentVersion).toBe(5);
});
