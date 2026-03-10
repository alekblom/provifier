const mysql = require('mysql2/promise');
const crypto = require('crypto');
const config = require('../config');

let pool = null;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: config.alexiuzDb.host,
      user: config.alexiuzDb.user,
      password: config.alexiuzDb.password,
      database: config.alexiuzDb.database,
      waitForConnections: true,
      connectionLimit: 5,
      charset: 'utf8mb4',
    });
  }
  return pool;
}

function hashIP(ip) {
  return ip ? crypto.createHash('sha256').update(ip).digest('hex') : '';
}

async function consumeToken(token, clientIp) {
  if (!token || !/^[a-f0-9]{128}$/.test(token)) return null;

  const ipHash = hashIP(clientIp);
  const db = getPool();

  const [rows] = await db.execute(
    `SELECT at.user_id, at.redirect_url, at.created_at, at.used, at.ip_hash,
            u.user_email, u.user_username, u.user_role, u.user_status
     FROM auth_tokens at
     JOIN users u ON u.user_id = at.user_id
     WHERE at.token = ?`,
    [token]
  );

  if (rows.length === 0) return null;
  const row = rows[0];

  if (Number(row.used) === 1) return null;
  const created = new Date(row.created_at).getTime();
  if (Date.now() - created > 300000) return null;
  if (row.ip_hash && row.ip_hash !== ipHash) return null;
  if (Number(row.user_status) !== 1) return null;

  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  await db.execute(
    'UPDATE auth_tokens SET used = 1, used_at = ? WHERE token = ?',
    [now, token]
  );

  await db.execute(
    'INSERT INTO logins (user_id, login_ip, login_datetime, login_service) VALUES (?, ?, ?, ?)',
    [row.user_id, ipHash, now, 'provifier']
  );

  return {
    alexiuzUserId: Number(row.user_id),
    email: row.user_email,
    username: row.user_username || null,
    role: row.user_role,
  };
}

module.exports = { consumeToken };
