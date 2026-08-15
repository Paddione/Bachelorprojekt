// brett/test/late-join-toast.test.ts
// Offline-safe: tests pure text + container stacking via a minimal DOM stub.
import { test } from 'node:test';
import assert from 'node:assert';
import { lateJoinToastText, showLateJoinToast } from '../src/client/ui/late-join-toast';

test('lateJoinToastText: formats the join message', () => {
  assert.strictEqual(lateJoinToastText('Carla'), 'Carla ist beigetreten');
});

// Minimal DOM stub: just enough surface for the toast container logic.
function makeStubEl() {
  const el: any = {
    children: [] as any[],
    style: {},
    className: '',
    textContent: '',
    appendChild(c: any) { this.children.push(c); c.parentNode = this; return c; },
    remove() {
      if (this.parentNode) {
        const i = this.parentNode.children.indexOf(this);
        if (i >= 0) this.parentNode.children.splice(i, 1);
      }
    },
  };
  return el;
}

test('showLateJoinToast: appends a toast carrying the name; multiple stack', () => {
  const host = makeStubEl();
  let timers = 0;
  const stub = {
    createEl: () => makeStubEl(),
    container: host,
    setTimeout: (_fn: () => void, _ms: number) => { timers++; return 0 as any; },
  };
  showLateJoinToast('Anna', stub as any);
  showLateJoinToast('Ben', stub as any);
  assert.strictEqual(host.children.length, 2, 'two toasts stack in the container');
  assert.strictEqual(host.children[0].textContent, 'Anna ist beigetreten');
  assert.strictEqual(host.children[1].textContent, 'Ben ist beigetreten');
  assert.strictEqual(timers, 2, 'each toast schedules its own auto-dismiss');
});

test('showLateJoinToast: auto-dismiss removes the toast when the timer fires', () => {
  const host = makeStubEl();
  let fire: (() => void) | null = null;
  const stub = {
    createEl: () => makeStubEl(),
    container: host,
    setTimeout: (fn: () => void, _ms: number) => { fire = fn; return 0 as any; },
  };
  showLateJoinToast('Cem', stub as any);
  assert.strictEqual(host.children.length, 1);
  fire!();
  assert.strictEqual(host.children.length, 0, 'toast removed after timeout fires');
});
