const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const COMMITS_FILE = path.join(DATA_DIR, 'commits.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJSON(filePath) {
  ensureDataDir();
  if (!fs.existsSync(filePath)) return [];
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function writeJSON(filePath, data) {
  ensureDataDir();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function generateId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

// --- Commits ---

function insertCommit(commit) {
  const commits = readJSON(COMMITS_FILE);
  const record = {
    id: generateId('cmt'),
    ...commit,
    createdAt: new Date().toISOString(),
  };
  commits.push(record);
  writeJSON(COMMITS_FILE, commits);
  return record;
}

function findCommitByTxDigest(txDigest) {
  const commits = readJSON(COMMITS_FILE);
  return commits.find(c => c.txDigest === txDigest) || null;
}

function getCommitsForUser(userId, page = 1, perPage = 20) {
  const commits = readJSON(COMMITS_FILE);
  const userCommits = commits.filter(c => c.userId === userId).reverse();
  const total = userCommits.length;
  const start = (page - 1) * perPage;
  return { commits: userCommits.slice(start, start + perPage), total, page, perPage };
}

function getRecentCommitsForUser(userId, limit = 5) {
  const commits = readJSON(COMMITS_FILE);
  return commits.filter(c => c.userId === userId).reverse().slice(0, limit);
}

function getCommitStats(userId) {
  const commits = readJSON(COMMITS_FILE);
  const userCommits = commits.filter(c => c.userId === userId);
  return {
    total: userCommits.length,
    singles: userCommits.filter(c => c.type === 'single').length,
    batches: userCommits.filter(c => c.type === 'batch').length,
  };
}

module.exports = {
  generateId,
  insertCommit,
  findCommitByTxDigest,
  getCommitsForUser,
  getRecentCommitsForUser,
  getCommitStats,
  DATA_DIR,
};
