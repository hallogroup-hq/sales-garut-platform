const { getDb } = require('../db/connection.js');
const crypto = require('node:crypto');

function logAudit({
  userId = 'SYSTEM',
  userName = 'System Process',
  userRole = 'SYSTEM',
  action,
  entityType,
  entityId,
  beforeState = null,
  afterState = null,
  ipAddress = '127.0.0.1'
}) {
  const db = getDb();
  const auditId = 'AUD_' + crypto.randomUUID();
  const beforeJson = beforeState ? JSON.stringify(beforeState) : null;
  const afterJson = afterState ? JSON.stringify(afterState) : null;

  db.run(
    "INSERT INTO audit_log (audit_id, user_id, user_name, user_role, action, entity_type, entity_id, before_state_json, after_state_json, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [auditId, userId, userName, userRole, action, entityType, String(entityId), beforeJson, afterJson, ipAddress]
  );
  return auditId;
}

function getAuditLogs({ entityType, entityId, limit = 50 } = {}) {
  const db = getDb();
  let sql = 'SELECT * FROM audit_log';
  const params = [];
  const where = [];

  if (entityType) {
    where.push('entity_type = ?');
    params.push(entityType);
  }
  if (entityId) {
    where.push('entity_id = ?');
    params.push(String(entityId));
  }
  if (where.length > 0) {
    sql += ' WHERE ' + where.join(' AND ');
  }
  sql += ' ORDER BY timestamp DESC LIMIT ' + parseInt(limit, 10);
  return db.query(sql, params);
}

module.exports = {
  logAudit,
  getAuditLogs
};
