const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const KEYS_PATH = path.join(DATA_DIR, 'apikeys.json');

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function loadKeys() {
  if (!fs.existsSync(KEYS_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(KEYS_PATH, 'utf-8'));
  } catch {
    return [];
  }
}

function saveKeys(keys) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(KEYS_PATH, JSON.stringify(keys, null, 2));
}

function generateKeyId() {
  const ts = Date.now().toString(36);
  const rand = crypto.randomBytes(4).toString('hex');
  return `key_${ts}_${rand}`;
}

function generateApiKey() {
  const raw = crypto.randomBytes(20).toString('hex');
  const fullKey = `pvf_live_${raw}`;
  const keyHash = sha256(fullKey);
  const prefix = fullKey.substring(0, 13);
  return { fullKey, keyHash, prefix };
}

function findKeyByHash(hash) {
  return loadKeys().find((k) => k.keyHash === hash && !k.revoked) || null;
}

function getKeysForUser(userId) {
  return loadKeys().filter((k) => k.userId === userId);
}

function insertApiKey({ userId, name, keyHash, prefix }) {
  const keys = loadKeys();
  const key = {
    id: generateKeyId(),
    userId,
    name: name || 'Default',
    keyHash,
    prefix,
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    revoked: false,
  };
  keys.push(key);
  saveKeys(keys);
  return key;
}

function revokeApiKey(keyId, userId) {
  const keys = loadKeys();
  const key = keys.find((k) => k.id === keyId && k.userId === userId);
  if (!key) return null;
  key.revoked = true;
  saveKeys(keys);
  return key;
}

function updateKeyLastUsed(keyId) {
  const keys = loadKeys();
  const key = keys.find((k) => k.id === keyId);
  if (key) {
    key.lastUsedAt = new Date().toISOString();
    saveKeys(keys);
  }
}

function hashApiKey(rawKey) {
  return sha256(rawKey);
}

module.exports = {
  generateApiKey,
  findKeyByHash,
  getKeysForUser,
  insertApiKey,
  revokeApiKey,
  updateKeyLastUsed,
  hashApiKey,
};
