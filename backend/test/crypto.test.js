const crypto = require('crypto');
process.env.BOT_TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');

const { test } = require('node:test');
const assert = require('node:assert');
const { encrypt, decrypt } = require('../src/crypto');

test('encrypt/decrypt round-trip', () => {
  const original = '1234567890:AABBCCDDaabbccddeeff_test_token__xyz';
  assert.strictEqual(decrypt(encrypt(original)), original);
});

test('different IVs produce different ciphertexts', () => {
  const original = 'same_token_123';
  assert.notStrictEqual(encrypt(original), encrypt(original));
});

test('tampered ciphertext throws', () => {
  const enc = encrypt('secret_token');
  const tampered = enc.slice(0, -4) + 'FFFF';
  assert.throws(() => decrypt(tampered));
});
