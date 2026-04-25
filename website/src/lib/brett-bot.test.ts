import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyTalkSignature } from './brett-bot';

const secret = 'sekret';
const random = 'abc123';
const body = '{"hello":"world"}';
const validSig = createHmac('sha256', secret).update(random).update(body).digest('hex');

test('verifyTalkSignature: accepts valid signature', () => {
  assert.equal(verifyTalkSignature(secret, random, body, validSig), true);
});
test('verifyTalkSignature: rejects tampered body', () => {
  assert.equal(verifyTalkSignature(secret, random, '{"hello":"WORLD"}', validSig), false);
});
test('verifyTalkSignature: rejects wrong secret', () => {
  assert.equal(verifyTalkSignature('other', random, body, validSig), false);
});
test('verifyTalkSignature: rejects empty inputs', () => {
  assert.equal(verifyTalkSignature('', random, body, validSig), false);
  assert.equal(verifyTalkSignature(secret, '', body, validSig), false);
  assert.equal(verifyTalkSignature(secret, random, body, ''), false);
});
test('verifyTalkSignature: rejects different-length sig', () => {
  assert.equal(verifyTalkSignature(secret, random, body, 'short'), false);
});
