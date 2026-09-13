const { getDb } = require('../db/connection.js');

function authenticateUser(username, password) {
  const db = getDb();
  const user = db.query(
    'SELECT * FROM app_user WHERE username = ? AND is_active = 1',
    [username]
  )[0];

  if (!user || user.password_hash !== password) {
    return null;
  }
  return {
    userId: user.user_id,
    username: user.username,
    fullName: user.full_name,
    role: user.role,
    scopeSpvId: user.scope_spv_id,
    scopeSalesmanId: user.scope_salesman_id,
    permissions: {
      canUploadSales: Boolean(user.can_upload_sales),
      canEditCustomer: Boolean(user.can_edit_customer),
      canEditTarget: Boolean(user.can_edit_target),
      canManageIncentive: Boolean(user.can_manage_incentive)
    }
  };
}

function enforceScope(user, requestedScope = {}) {
  // Returns safe scoped filters based on role
  const filter = { ...requestedScope };

  if (user.role === 'DSM') {
    // DSM has unrestricted access to all Garut data
    return filter;
  }

  if (user.role === 'SPV') {
    // SPV is locked to their assigned team
    filter.spvId = user.scopeSpvId;
    return filter;
  }

  if (user.role === 'SALESMAN') {
    // Salesman is strictly locked to their own salesman ID
    filter.salesmanId = user.scopeSalesmanId;
    return filter;
  }

  return filter;
}

module.exports = {
  authenticateUser,
  enforceScope
};
