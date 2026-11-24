const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const User = require('../src/models/User');

const previousJwtSecret = process.env.JWT_SECRET;
process.env.JWT_SECRET = 'admin-members-test-secret';
const companyId = '507f1f77bcf86cd799439011';

test.after(() => {
  if (previousJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = previousJwtSecret;
});

async function putMember(actor, memberId, body, t, target) {
  t.mock.method(User, 'findById', () => ({
    select() { return this; },
    async lean() { return actor; },
  }));
  const findTarget = t.mock.method(User, 'findOne', async () => target);
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/employees/${memberId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${jwt.sign({ id: actor._id, v: 0 }, process.env.JWT_SECRET)}`,
        'Content-Type': 'application/json',
        Connection: 'close',
      },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json(), findTarget };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('owner account cannot be edited or deactivated through team management', async (t) => {
  const owner = { _id: companyId, role: 'admin', isPrimaryAdmin: true, isActive: true };
  const manager = { _id: '507f1f77bcf86cd799439012', role: 'admin', isCompanyAdmin: true, organizationId: companyId };
  const result = await putMember(manager, companyId, { name: 'Changed', isActive: false }, t, null);

  assert.equal(result.status, 404);
  assert.equal(result.findTarget.mock.calls[0].arguments[0].isPrimaryAdmin.$ne, true);
  assert.notEqual(owner.name, 'Changed');
});

test('non-owner administrators cannot edit or deactivate other administrators', async (t) => {
  const manager = { _id: '507f1f77bcf86cd799439012', role: 'admin', isCompanyAdmin: true, organizationId: companyId };
  const otherAdmin = { _id: '507f1f77bcf86cd799439013', role: 'admin', isCompanyAdmin: true, isPrimaryAdmin: false, organizationId: companyId };
  const result = await putMember(manager, otherAdmin._id, { name: 'Changed', isActive: false }, t, otherAdmin);

  assert.equal(result.status, 403);
  assert.equal(result.body.message, 'You cannot manage this account');
});

test('administrator can promote an employee and the session version is advanced', async (t) => {
  const manager = { _id: '507f1f77bcf86cd799439012', role: 'admin', isCompanyAdmin: true, organizationId: companyId };
  const employee = { _id: '507f1f77bcf86cd799439013', role: 'employee', isCompanyAdmin: false, organizationId: companyId };
  const findUpdate = t.mock.method(User, 'findOneAndUpdate', (_filter, update) => ({
    lean: async () => ({
      ...employee,
      ...update.$set,
      authVersion: update.$inc.authVersion,
      name: 'Employee Name',
      email: 'employee@example.com',
      isActive: true,
    }),
  }));
  const result = await putMember(manager, employee._id, { name: 'Employee Name', email: 'EMPLOYEE@example.com', role: 'admin' }, t, employee);

  assert.equal(result.status, 200);
  assert.equal(findUpdate.mock.calls[0].arguments[1].$set.role, 'admin');
  assert.equal(findUpdate.mock.calls[0].arguments[1].$set.isCompanyAdmin, true);
  assert.equal(findUpdate.mock.calls[0].arguments[1].$inc.authVersion, 1);
  assert.equal(result.body.member.role, 'admin');
});

test('administrator can deactivate an employee while preserving its account record', async (t) => {
  const manager = { _id: '507f1f77bcf86cd799439012', role: 'admin', isCompanyAdmin: true, organizationId: companyId };
  const employee = { _id: '507f1f77bcf86cd799439013', role: 'employee', isCompanyAdmin: false, isActive: true, organizationId: companyId };
  const findUpdate = t.mock.method(User, 'findOneAndUpdate', (_filter, update) => ({
    lean: async () => ({ ...employee, ...update.$set, authVersion: update.$inc.authVersion }),
  }));
  const result = await putMember(manager, employee._id, { isActive: false }, t, employee);

  assert.equal(result.status, 200);
  assert.equal(findUpdate.mock.calls[0].arguments[1].$set.isActive, false);
  assert.equal(findUpdate.mock.calls[0].arguments[1].$inc.authVersion, 1);
  assert.equal(result.body.member.isActive, false);
});
