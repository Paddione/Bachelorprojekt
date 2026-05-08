// website/src/components/inbox/inbox-shortcuts.test.ts
import { describe, it, expect } from 'vitest';
import { handle, type ShortcutCtx } from './inbox-shortcuts';
import type { InboxType } from '../../lib/messaging-db';

const baseCtx = (over: Partial<ShortcutCtx> = {}): ShortcutCtx => ({
  selectedType: 'registration',
  awaitingG: false,
  pointerFine: true,
  ...over,
});

function ev(
  key: string,
  extra: {
    metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean;
    target?: { tagName?: string; getAttribute?: (a: string) => string | null } | null;
  } = {},
) {
  return {
    key,
    metaKey: extra.metaKey ?? false,
    ctrlKey: extra.ctrlKey ?? false,
    shiftKey: extra.shiftKey ?? false,
    target: extra.target ?? null,
  };
}

describe('inbox-shortcuts: selection', () => {
  it('j and ArrowDown both emit select-next', () => {
    const a = handle({ event: ev('j'), ctx: baseCtx() });
    const b = handle({ event: ev('ArrowDown'), ctx: baseCtx() });
    expect(a.action).toEqual({ kind: 'select-next' });
    expect(b.action).toEqual({ kind: 'select-next' });
    expect(a.preventDefault).toBe(true);
  });

  it('k and ArrowUp both emit select-prev', () => {
    const a = handle({ event: ev('k'), ctx: baseCtx() });
    const b = handle({ event: ev('ArrowUp'), ctx: baseCtx() });
    expect(a.action).toEqual({ kind: 'select-prev' });
    expect(b.action).toEqual({ kind: 'select-prev' });
  });
});

describe('inbox-shortcuts: g chord', () => {
  it('g alone arms the chord without dispatching an action', () => {
    const r = handle({ event: ev('g'), ctx: baseCtx() });
    expect(r.action).toBeNull();
    expect(r.awaitingG).toBe(true);
    expect(r.preventDefault).toBe(true);
  });

  it.each<[string, InboxType | 'all']>([
    ['1', 'registration'],
    ['2', 'booking'],
    ['3', 'bug'],
    ['4', 'user_message'],
    ['5', 'meeting_finalize'],
    ['6', 'contact'],
    ['a', 'all'],
  ])('g %s sets type to %s', (key, type) => {
    const r = handle({ event: ev(key), ctx: baseCtx({ awaitingG: true }) });
    expect(r.action).toEqual({ kind: 'set-type', type });
    expect(r.awaitingG).toBe(false);
  });

  it('g followed by an unmapped key drops the chord silently', () => {
    const r = handle({ event: ev('z'), ctx: baseCtx({ awaitingG: true }) });
    expect(r.action).toBeNull();
    expect(r.awaitingG).toBe(false);
  });
});

describe('inbox-shortcuts: status tabs', () => {
  it('1/2/3 cycle status tabs', () => {
    expect(handle({ event: ev('1'), ctx: baseCtx() }).action).toEqual({ kind: 'set-status', status: 'pending' });
    expect(handle({ event: ev('2'), ctx: baseCtx() }).action).toEqual({ kind: 'set-status', status: 'actioned' });
    expect(handle({ event: ev('3'), ctx: baseCtx() }).action).toEqual({ kind: 'set-status', status: 'archived' });
  });
});

describe('inbox-shortcuts: actions', () => {
  it('A always triggers primary action', () => {
    for (const t of ['registration','booking','contact','bug','meeting_finalize','user_message'] as InboxType[]) {
      const r = handle({ event: ev('A'), ctx: baseCtx({ selectedType: t }) });
      expect(r.action).toEqual({ kind: 'action', name: 'primary' });
    }
  });

  it('D triggers secondary only on registration / booking', () => {
    expect(handle({ event: ev('D'), ctx: baseCtx({ selectedType: 'registration' }) }).action)
      .toEqual({ kind: 'action', name: 'secondary' });
    expect(handle({ event: ev('D'), ctx: baseCtx({ selectedType: 'booking' }) }).action)
      .toEqual({ kind: 'action', name: 'secondary' });
    expect(handle({ event: ev('D'), ctx: baseCtx({ selectedType: 'bug' }) }).action).toBeNull();
    expect(handle({ event: ev('D'), ctx: baseCtx({ selectedType: 'contact' }) }).action).toBeNull();
  });

  it('E triggers primary only on contact / user_message', () => {
    expect(handle({ event: ev('E'), ctx: baseCtx({ selectedType: 'contact' }) }).action)
      .toEqual({ kind: 'action', name: 'primary' });
    expect(handle({ event: ev('E'), ctx: baseCtx({ selectedType: 'user_message' }) }).action)
      .toEqual({ kind: 'action', name: 'primary' });
    expect(handle({ event: ev('E'), ctx: baseCtx({ selectedType: 'bug' }) }).action).toBeNull();
  });

  it('Enter (no shift, no field) triggers primary action', () => {
    const r = handle({ event: ev('Enter'), ctx: baseCtx({ selectedType: 'bug' }) });
    expect(r.action).toEqual({ kind: 'action', name: 'primary' });
  });

  it('R focuses reply only on user_message', () => {
    expect(handle({ event: ev('R'), ctx: baseCtx({ selectedType: 'user_message' }) }).action)
      .toEqual({ kind: 'focus-reply' });
    expect(handle({ event: ev('R'), ctx: baseCtx({ selectedType: 'bug' }) }).action).toBeNull();
  });
});

describe('inbox-shortcuts: search & misc', () => {
  it('/ focuses the search input', () => {
    expect(handle({ event: ev('/'), ctx: baseCtx() }).action).toEqual({ kind: 'focus-search' });
  });

  it('? toggles help', () => {
    expect(handle({ event: ev('?'), ctx: baseCtx() }).action).toEqual({ kind: 'toggle-help' });
  });

  it('Escape always emits clear, even from inside a textarea', () => {
    const target = { tagName: 'TEXTAREA' };
    expect(handle({ event: ev('Escape', { target }), ctx: baseCtx() }).action).toEqual({ kind: 'clear' });
  });
});

describe('inbox-shortcuts: editable target guard', () => {
  it('ignores letter/number keys when an INPUT is focused', () => {
    const target = { tagName: 'INPUT' };
    expect(handle({ event: ev('j', { target }), ctx: baseCtx() }).action).toBeNull();
    expect(handle({ event: ev('A', { target }), ctx: baseCtx() }).action).toBeNull();
    expect(handle({ event: ev('1', { target }), ctx: baseCtx() }).action).toBeNull();
  });

  it('ignores letter/number keys when a TEXTAREA is focused', () => {
    const target = { tagName: 'TEXTAREA' };
    expect(handle({ event: ev('j', { target }), ctx: baseCtx() }).action).toBeNull();
    expect(handle({ event: ev('Enter', { target }), ctx: baseCtx() }).action).toBeNull();
  });

  it('⌘⏎ inside the reply textarea sends the reply', () => {
    const target = { tagName: 'TEXTAREA', getAttribute: (a: string) => (a === 'data-testid' ? 'inbox-reply' : null) };
    const r = handle({
      event: ev('Enter', { metaKey: true, target }),
      ctx: baseCtx({ selectedType: 'user_message' }),
    });
    expect(r.action).toEqual({ kind: 'send-reply' });
    expect(r.preventDefault).toBe(true);
  });

  it('Ctrl+Enter inside the reply textarea also sends the reply', () => {
    const target = { tagName: 'TEXTAREA', getAttribute: (a: string) => (a === 'data-testid' ? 'inbox-reply' : null) };
    const r = handle({
      event: ev('Enter', { ctrlKey: true, target }),
      ctx: baseCtx({ selectedType: 'user_message' }),
    });
    expect(r.action).toEqual({ kind: 'send-reply' });
  });

  it('⌘⏎ inside an unrelated textarea is a no-op', () => {
    const target = { tagName: 'TEXTAREA', getAttribute: () => null };
    const r = handle({ event: ev('Enter', { metaKey: true, target }), ctx: baseCtx() });
    expect(r.action).toBeNull();
  });
});

describe('inbox-shortcuts: pointer guard (mobile)', () => {
  it('returns no action on touch devices (pointerFine=false)', () => {
    expect(handle({ event: ev('j'),  ctx: baseCtx({ pointerFine: false }) }).action).toBeNull();
    expect(handle({ event: ev('A'),  ctx: baseCtx({ pointerFine: false }) }).action).toBeNull();
    expect(handle({ event: ev('/'),  ctx: baseCtx({ pointerFine: false }) }).action).toBeNull();
  });
});
