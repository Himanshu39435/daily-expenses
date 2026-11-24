function roleFor(user) {
  return user.role === 'admin' && (user.isPrimaryAdmin === true || user.isCompanyAdmin === true) ? 'admin' : 'employee';
}

function companyIdFor(user) {
  return user.organizationId || user._id;
}

function canManageMember(actor, target) {
  if (!target || target.isPrimaryAdmin === true || String(actor._id) === String(target._id)) return false;
  const memberCompanyId = target.organizationId || (target.isPrimaryAdmin === true ? target._id : null);
  if (String(memberCompanyId || '') !== String(companyIdFor(actor))) return false;
  return actor.isPrimaryAdmin === true || roleFor(target) === 'employee';
}

module.exports = { roleFor, companyIdFor, canManageMember };
