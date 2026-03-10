const crypto = require('crypto');

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/** Hash arbitrary data with Provifier domain prefix. */
function hash(data) {
  const input = Buffer.isBuffer(data) ? data : String(data);
  return sha256(Buffer.concat([Buffer.from('provifier:v1:'), Buffer.isBuffer(input) ? input : Buffer.from(input)]));
}

/** Hash a record with table + rowId context for domain separation. */
function hashRecord(table, rowId, data) {
  const body = Buffer.isBuffer(data) ? data.toString('utf-8') : typeof data === 'string' ? data : JSON.stringify(data);
  return sha256(`provifier:v1:${table}:${rowId}:${body}`);
}

module.exports = { sha256, hash, hashRecord };
