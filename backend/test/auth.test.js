const { test } = require('node:test');
const assert = require('node:assert');
const { verifyInitData } = require('../src/auth/verifyInitData');

test('rejects fake hash', () => {
  assert.strictEqual(verifyInitData('user=%7B%22id%22%3A1%7D&hash=fake', 'token'), null);
});

test('returns null when hash is missing', () => {
  assert.strictEqual(verifyInitData('user=%7B%22id%22%3A1%7D', 'token'), null);
});

test('returns null for empty initData', () => {
  assert.strictEqual(verifyInitData('', 'token'), null);
});
