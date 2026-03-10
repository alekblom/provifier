const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const USERS_PATH = path.join(DATA_DIR, 'users.json');

function loadUsers() {
  if (!fs.existsSync(USERS_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(USERS_PATH, 'utf-8'));
  } catch {
    return [];
  }
}

function saveUsers(users) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(USERS_PATH, JSON.stringify(users, null, 2));
}

function generateUserId() {
  const ts = Date.now().toString(36);
  const rand = crypto.randomBytes(4).toString('hex');
  return `usr_${ts}_${rand}`;
}

function findUserByEmail(email) {
  return loadUsers().find((u) => u.email === email.toLowerCase()) || null;
}

function findUserById(id) {
  return loadUsers().find((u) => u.id === id) || null;
}

function findUserBySession(sessionHash, ip) {
  if (!sessionHash) return null;
  return loadUsers().find(
    (u) => u.sessionHash === sessionHash && u.sessionIp === ip && u.status === 1
  ) || null;
}

function findUserByAlexiuzId(alexiuzUserId) {
  return loadUsers().find((u) => u.alexiuzUserId === alexiuzUserId) || null;
}

function insertSsoUser({ email, alexiuzUserId }) {
  const users = loadUsers();
  const user = {
    id: generateUserId(),
    email: email.toLowerCase(),
    passwordHash: null,
    status: 1,
    alexiuzUserId,
    sessionHash: null,
    sessionIp: null,
    createdAt: new Date().toISOString(),
    lastLoginAt: null,
  };
  users.push(user);
  saveUsers(users);
  return user;
}

function updateUser(id, fields) {
  const users = loadUsers();
  const idx = users.findIndex((u) => u.id === id);
  if (idx === -1) return null;
  Object.assign(users[idx], fields);
  saveUsers(users);
  return users[idx];
}

async function verifyPassword(user, password) {
  return bcrypt.compare(password, user.passwordHash);
}

function generateSessionHash() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = {
  findUserByEmail,
  findUserById,
  findUserBySession,
  findUserByAlexiuzId,
  insertSsoUser,
  updateUser,
  verifyPassword,
  generateSessionHash,
};
