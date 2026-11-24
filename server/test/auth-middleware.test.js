const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const auth = require('../src/middleware/auth');
const User = require('../src/models/User');

const previousJwtSecret = process.env.JWT_SECRET;
process.env.JWT_SECRET = 'auth-middleware-test-secret';

test.after(() => {
  if (previousJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = previousJwtSecret;
});

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('deactivated accounts cannot use existing sessions', async (t) => {
  const user = { _id: 'user-id', isActive: false, authVersion: 0 };
  t.mock.method(User, 'findById', () => ({
    select() { return this; },
    async lean() { return user; },
  }));
  const req = {
    headers: {
      authorization: `Bearer ${jwt.sign({ id: user._id, v: 0 }, process.env.JWT_SECRET)}`,
    },
  };
  const res = response();
  let continued = false;

  await auth(req, res, () => { continued = true; });

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.message, 'This account has been deactivated. Contact your administrator.');
  assert.equal(continued, false);
});

test('promoted admins retain their organization for company-wide permissions', async (t) => {
  const user = {
    _id: 'manager-id',
    role: 'admin',
    isPrimaryAdmin: false,
    isCompanyAdmin: true,
    organizationId: 'owner-id',
    authVersion: 0,
  };
  t.mock.method(User, 'findById', () => ({
    select() { return this; },
    async lean() { return user; },
  }));
  const req = {
    headers: {
      authorization: `Bearer ${jwt.sign({ id: user._id, v: 0 }, process.env.JWT_SECRET)}`,
    },
  };
  let continued = false;

  await auth(req, response(), () => { continued = true; });

  assert.equal(continued, true);
  assert.equal(req.user.role, 'admin');
  assert.equal(String(req.user.organizationId), 'owner-id');
});
