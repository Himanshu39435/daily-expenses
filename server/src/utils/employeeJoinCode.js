const crypto = require('crypto');

const MIN_EMPLOYEE_JOIN_CODE_LENGTH = 16;

function isEmployeeJoinCodeConfigured(code) {
  return typeof code === 'string' && code.length >= MIN_EMPLOYEE_JOIN_CODE_LENGTH;
}

function matchesEmployeeJoinCode(expectedCode, suppliedCode) {
  if (typeof expectedCode !== 'string' || typeof suppliedCode !== 'string') return false;
  const expected = Buffer.from(expectedCode);
  const supplied = Buffer.from(suppliedCode);
  return expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied);
}

module.exports = { isEmployeeJoinCodeConfigured, matchesEmployeeJoinCode };
