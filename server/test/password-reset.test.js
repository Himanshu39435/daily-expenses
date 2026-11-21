const test = require('node:test');
const assert = require('node:assert/strict');
const {
  RESET_TOKEN_TTL_MS,
  buildPasswordResetUrl,
  createPasswordResetToken,
  hashPasswordResetToken,
} = require('../src/utils/passwordReset');
const { authVersionMatches } = require('../src/utils/authVersion');

test('password reset tokens are random, hashed for storage, and expire after 15 minutes', () => {
  const now = 1_800_000_000_000;
  const first = createPasswordResetToken(now);
  const second = createPasswordResetToken(now);

  assert.match(first.token, /^[a-f\d]{64}$/);
  assert.notEqual(first.token, second.token);
  assert.equal(first.tokenHash, hashPasswordResetToken(first.token));
  assert.notEqual(first.tokenHash, first.token);
  assert.equal(first.expiresAt.getTime(), now + RESET_TOKEN_TTL_MS);
});

test('password reset URL requires HTTPS except for localhost development', () => {
  assert.equal(
    buildPasswordResetUrl('https://expenses.example', 'abc123'),
    'https://expenses.example/reset-password/abc123'
  );
  assert.equal(
    buildPasswordResetUrl('http://localhost:5173', 'abc123'),
    'http://localhost:5173/reset-password/abc123'
  );
  assert.throws(() => buildPasswordResetUrl('http://expenses.example', 'abc123'), { status: 503 });
});

test('password reset invalidates older sessions while preserving legacy version-zero tokens', () => {
  assert.equal(authVersionMatches(undefined, undefined), true);
  assert.equal(authVersionMatches(0, 0), true);
  assert.equal(authVersionMatches(0, 1), false);
  assert.equal(authVersionMatches(1, 1), true);
});
