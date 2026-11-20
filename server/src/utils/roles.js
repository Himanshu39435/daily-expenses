function roleFor(user) {
  return user.role === 'admin' && user.isPrimaryAdmin === true ? 'admin' : 'employee';
}

module.exports = { roleFor };
