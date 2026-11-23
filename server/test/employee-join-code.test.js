const test = require('node:test');
const assert = require('node:assert/strict');
const { isEmployeeJoinCodeConfigured, matchesEmployeeJoinCode } = require('../src/utils/employeeJoinCode');

test('employee join code must be configured with at least 16 characters', () => {
  assert.equal(isEmployeeJoinCodeConfigured('123456789012345'), false);
  assert.equal(isEmployeeJoinCodeConfigured('1234567890123456'), true);
  assert.equal(isEmployeeJoinCodeConfigured(''), false);
});

test('employee join code matching requires an exact string match', () => {
  const expected = 'a-long-private-company-code';
  assert.equal(matchesEmployeeJoinCode(expected, expected), true);
  assert.equal(matchesEmployeeJoinCode(expected, 'a-long-private-company-codf'), false);
  assert.equal(matchesEmployeeJoinCode(expected, 'short'), false);
  assert.equal(matchesEmployeeJoinCode(expected, undefined), false);
});
