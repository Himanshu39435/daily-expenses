const test = require('node:test');
const assert = require('node:assert/strict');
const requireRole = require('../src/middleware/requireRole');
const { roleFor, canManageMember } = require('../src/utils/roles');

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

test('only primary owner and explicitly promoted accounts get admin role', () => {
  assert.equal(roleFor({ role: 'admin', isPrimaryAdmin: true }), 'admin');
  assert.equal(roleFor({ role: 'admin', isPrimaryAdmin: false, isCompanyAdmin: true }), 'admin');
  assert.equal(roleFor({ role: 'admin', isPrimaryAdmin: false }), 'employee');
  assert.equal(roleFor({ role: 'admin' }), 'employee');
  assert.equal(roleFor({ role: 'employee', isPrimaryAdmin: true }), 'employee');
});

test('admins can manage employees, but only the owner can manage other admins', () => {
  const owner = { _id: 'owner', isPrimaryAdmin: true };
  const admin = { _id: 'admin', role: 'admin', isCompanyAdmin: true, isPrimaryAdmin: false, organizationId: 'owner' };
  const employee = { _id: 'employee', role: 'employee', organizationId: 'owner' };
  const otherAdmin = { _id: 'other-admin', role: 'admin', isCompanyAdmin: true, organizationId: 'owner' };

  assert.equal(canManageMember(admin, employee), true);
  assert.equal(canManageMember(admin, otherAdmin), false);
  assert.equal(canManageMember(owner, otherAdmin), true);
  assert.equal(canManageMember(owner, { ...employee, isPrimaryAdmin: true }), false);
  assert.equal(canManageMember(owner, { ...employee, organizationId: 'another-owner' }), false);
});
