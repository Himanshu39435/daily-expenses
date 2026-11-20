const test = require('node:test');
const assert = require('node:assert/strict');
const requireRole = require('../src/middleware/requireRole');
const { roleFor } = require('../src/utils/roles');

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('role guard permits administrators and blocks employees', () => {
  const guard = requireRole('admin');
  let continued = false;
  guard({ user: { role: 'admin' } }, response(), () => { continued = true; });
  assert.equal(continued, true);

  const res = response();
  guard({ user: { role: 'employee' } }, res, () => { continued = true; });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.message, 'You do not have permission to access this resource');
});

test('only the MongoDB primary admin record gets admin role', () => {
  assert.equal(roleFor({ role: 'admin', isPrimaryAdmin: true }), 'admin');
  assert.equal(roleFor({ role: 'admin', isPrimaryAdmin: false }), 'employee');
  assert.equal(roleFor({ role: 'admin' }), 'employee');
  assert.equal(roleFor({ role: 'employee', isPrimaryAdmin: true }), 'employee');
});
