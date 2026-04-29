import { test, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyTalkSignature } from './brett-bot';

const secret = 'sekret';
const random = 'abc123';
const body = '{"hello":"world"}';
const validSig = createHmac('sha256', secret).update(random).update(body).digest('hex');

test('verifyTalkSignature: accepts valid signature', () => {
  expect(verifyTalkSignature(secret, random, body, validSig)).toBe(true);
});
test('verifyTalkSignature: rejects tampered body', () => {
  expect(verifyTalkSignature(secret, random, '{"hello":"WORLD"}', validSig)).toBe(false);
});
test('verifyTalkSignature: rejects wrong secret', () => {
  expect(verifyTalkSignature('other', random, body, validSig)).toBe(false);
});
test('verifyTalkSignature: rejects empty inputs', () => {
  expect(verifyTalkSignature('', random, body, validSig)).toBe(false);
  expect(verifyTalkSignature(secret, '', body, validSig)).toBe(false);
  expect(verifyTalkSignature(secret, random, body, '')).toBe(false);
});
test('verifyTalkSignature: rejects different-length sig', () => {
  expect(verifyTalkSignature(secret, random, body, 'short')).toBe(false);
});
