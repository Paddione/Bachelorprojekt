// brett/test/topbar-invite.test.ts
// Offline-safe: tests the pure URL builder + visibility predicate. No jsdom.
import { test } from 'node:test';
import assert from 'node:assert';
import { buildInviteUrl, inviteButtonVisible } from '../src/client/ui/topbar-invite';

test('buildInviteUrl: builds an encoded /api/join URL from origin + code', () => {
  assert.strictEqual(
    buildInviteUrl('https://brett.example.com', 'KRB-9A2'),
    'https://brett.example.com/api/join?code=KRB-9A2',
  );
});

test('buildInviteUrl: percent-encodes codes with special characters', () => {
  assert.strictEqual(
    buildInviteUrl('https://x.test', 'A B+C'),
    'https://x.test/api/join?code=A%20B%2BC',
  );
});

test('inviteButtonVisible: true only when a non-empty session code exists', () => {
  assert.strictEqual(inviteButtonVisible('KRB-9A2'), true);
  assert.strictEqual(inviteButtonVisible(null), false);
  assert.strictEqual(inviteButtonVisible(''), false);
});
