const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const User = require('../src/models/User');

const joinCode = 'private-company-join-code';
const admin = { _id: 'admin-id', companyName: 'Himanshu' };

const previousJoinCode = process.env.EMPLOYEE_JOIN_CODE;
const previousJwtSecret = process.env.JWT_SECRET;
process.env.EMPLOYEE_JOIN_CODE = joinCode;
process.env.JWT_SECRET = 'test-jwt-secret';

test.after(() => {
  if (previousJoinCode === undefined) delete process.env.EMPLOYEE_JOIN_CODE;
  else process.env.EMPLOYEE_JOIN_CODE = previousJoinCode;
  if (previousJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = previousJwtSecret;
});

async function postJoin(body) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/join-company`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Connection: 'close' },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('company-code signup creates and signs in a linked employee', async (t) => {
  const findOne = t.mock.method(User, 'findOne', async (query) => (
    query.isPrimaryAdmin ? admin : null
  ));
  let created;
  t.mock.method(User, 'create', async (document) => {
    created = {
      ...document,
      _id: 'employee-id',
      authVersion: 0,
      openingBalance: 0,
      openingDate: new Date('2026-01-01T00:00:00.000Z'),
    };
    return created;
  });

  const result = await postJoin({
    name: ' Employee Name ',
    email: ' EMPLOYEE@EXAMPLE.COM ',
    password: 'employee-password',
    joinCode,
  });

  assert.equal(result.status, 201);
  assert.equal(created.name, 'Employee Name');
  assert.equal(created.email, 'employee@example.com');
  assert.equal(created.role, 'employee');
  assert.equal(created.isPrimaryAdmin, false);
  assert.equal(created.organizationId, admin._id);
  assert.equal(created.companyName, admin.companyName);
  assert.notEqual(created.password, 'employee-password');
  assert.equal(await bcrypt.compare('employee-password', created.password), true);
  assert.equal(result.body.user.role, 'employee');
  assert.equal(findOne.mock.callCount(), 2);
  assert.ok(result.body.token);
});

test('company-code signup links an existing unassigned employee using their current password', async (t) => {
  const passwordHash = await bcrypt.hash('current-password', 4);
  const existing = {
    _id: 'existing-employee-id',
    name: 'Old Name',
    email: 'employee@example.com',
    password: passwordHash,
    role: 'employee',
    isPrimaryAdmin: false,
    organizationId: null,
    companyName: 'Old Company',
    authVersion: 0,
    openingBalance: 0,
    openingDate: new Date('2026-01-01T00:00:00.000Z'),
    set(fields) { Object.assign(this, fields); },
    async save() {},
  };
  t.mock.method(User, 'findOne', async (query) => (
    query.isPrimaryAdmin ? admin : existing
  ));

  const result = await postJoin({
    name: 'Employee Name',
    email: existing.email,
    password: 'current-password',
    joinCode,
  });

  assert.equal(result.status, 201);
  assert.equal(existing._id, 'existing-employee-id');
  assert.equal(existing.organizationId, admin._id);
  assert.equal(existing.companyName, admin.companyName);
  assert.equal(existing.role, 'employee');
  assert.equal(result.body.user.id, existing._id);
});

test('company-code signup rejects an incorrect code before querying accounts', async (t) => {
  const findOne = t.mock.method(User, 'findOne', async () => {
    throw new Error('Account lookup should not run');
  });

  const result = await postJoin({
    name: 'Employee Name',
    email: 'employee@example.com',
    password: 'employee-password',
    joinCode: 'wrong-code',
  });

  assert.equal(result.status, 403);
  assert.equal(result.body.message, 'Invalid company join code');
  assert.equal(findOne.mock.callCount(), 0);
});
