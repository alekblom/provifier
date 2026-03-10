const { Router } = require('express');
const { checkBalance } = require('../auth/alexiuz-credits');
const { generateApiKey, getKeysForUser, insertApiKey, revokeApiKey } = require('../auth/apikeys');
const { updateUser, verifyPassword } = require('../auth/users');
const { getRecentCommitsForUser, getCommitsForUser, getCommitStats } = require('../db');
const bcrypt = require('bcrypt');

const router = Router();

// GET /api/dashboard/stats
router.get('/stats', async (req, res) => {
  try {
    const user = req.user;
    const stats = getCommitStats(user.id);
    const recent = getRecentCommitsForUser(user.id, 5);
    const keys = getKeysForUser(user.id);
    const activeKeys = keys.filter(k => !k.revoked).length;

    let credits = null;
    if (user.alexiuzUserId) {
      credits = await checkBalance(user.alexiuzUserId);
    }

    res.json({
      user: { id: user.id, email: user.email, alexiuzLinked: !!user.alexiuzUserId },
      credits,
      stats,
      activeKeys,
      recentCommits: recent,
    });
  } catch (err) {
    console.error('[DASHBOARD] Stats error:', err.message);
    res.status(500).json({ error: { message: 'Failed to load stats.', code: 'INTERNAL' } });
  }
});

// GET /api/dashboard/commits?page=1
router.get('/commits', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const result = getCommitsForUser(req.user.id, page, 20);
  res.json(result);
});

// GET /api/dashboard/keys
router.get('/keys', (req, res) => {
  const keys = getKeysForUser(req.user.id).map(k => ({
    id: k.id,
    name: k.name,
    prefix: k.prefix,
    createdAt: k.createdAt,
    lastUsedAt: k.lastUsedAt,
    revoked: k.revoked,
  }));
  res.json({ keys });
});

// POST /api/dashboard/keys
router.post('/keys', (req, res) => {
  const keys = getKeysForUser(req.user.id);
  const active = keys.filter(k => !k.revoked);
  if (active.length >= 5) {
    return res.status(400).json({
      error: { message: 'Maximum 5 active API keys.', code: 'KEY_LIMIT' },
    });
  }

  const { name } = req.body || {};
  const { fullKey, keyHash, prefix } = generateApiKey();
  insertApiKey({ userId: req.user.id, name: name || 'Default', keyHash, prefix });

  res.json({ key: fullKey, prefix });
});

// DELETE /api/dashboard/keys/:id
router.delete('/keys/:id', (req, res) => {
  const result = revokeApiKey(req.params.id, req.user.id);
  if (!result) {
    return res.status(404).json({ error: { message: 'Key not found.', code: 'NOT_FOUND' } });
  }
  res.json({ status: 'revoked' });
});

// PUT /api/dashboard/account
router.put('/account', async (req, res) => {
  try {
    const { email, currentPassword, newPassword } = req.body;
    const user = req.user;

    if (email && email !== user.email) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: { message: 'Invalid email.', code: 'INVALID_EMAIL' } });
      }
      updateUser(user.id, { email: email.toLowerCase() });
    }

    if (newPassword) {
      if (newPassword.length < 12) {
        return res.status(400).json({ error: { message: 'Password must be at least 12 characters.', code: 'SHORT_PASSWORD' } });
      }
      if (user.passwordHash && currentPassword) {
        const valid = await verifyPassword(user, currentPassword);
        if (!valid) {
          return res.status(401).json({ error: { message: 'Current password incorrect.', code: 'INVALID_PASSWORD' } });
        }
      }
      const passwordHash = await bcrypt.hash(newPassword, 10);
      updateUser(user.id, { passwordHash });
    }

    res.json({ status: 'updated' });
  } catch (err) {
    console.error('[DASHBOARD] Account update error:', err.message);
    res.status(500).json({ error: { message: 'Update failed.', code: 'INTERNAL' } });
  }
});

module.exports = router;
