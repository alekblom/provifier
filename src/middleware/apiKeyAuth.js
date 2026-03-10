const config = require('../config');
const { hashApiKey, findKeyByHash, updateKeyLastUsed } = require('../auth/apikeys');
const { findUserById } = require('../auth/users');
const { checkBalance } = require('../auth/alexiuz-credits');

async function apiKeyAuth(req, res, next) {
  if (!config.requireApiKey) {
    req.pvfUser = null;
    req.pvfKeyId = null;
    return next();
  }

  let rawKey = req.headers['x-provifier-key'];
  if (!rawKey) {
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer pvf_live_')) {
      rawKey = authHeader.substring(7);
    }
  }

  if (!rawKey) {
    return res.status(401).json({
      error: {
        message: 'Missing API key. Provide X-Provifier-Key header or Authorization: Bearer pvf_live_...',
        code: 'MISSING_API_KEY',
      },
    });
  }

  if (!rawKey.startsWith('pvf_live_')) {
    return res.status(401).json({
      error: { message: 'Invalid API key format.', code: 'INVALID_API_KEY' },
    });
  }

  const keyHash = hashApiKey(rawKey);
  const keyRecord = findKeyByHash(keyHash);

  if (!keyRecord) {
    return res.status(401).json({
      error: { message: 'Invalid API key.', code: 'INVALID_API_KEY' },
    });
  }

  const user = findUserById(keyRecord.userId);
  if (!user || user.status !== 1) {
    return res.status(401).json({
      error: { message: 'Account inactive or not found.', code: 'ACCOUNT_INACTIVE' },
    });
  }

  if (user.alexiuzUserId) {
    const balance = await checkBalance(user.alexiuzUserId);
    if (balance && balance.total < 1) {
      return res.status(402).json({
        error: {
          message: 'Insufficient credits. Top up at alexiuz.com/credits.',
          code: 'INSUFFICIENT_CREDITS',
          balance: balance.total,
        },
      });
    }
  }

  req.pvfUser = user;
  req.pvfKeyId = keyRecord.id;

  updateKeyLastUsed(keyRecord.id);

  next();
}

module.exports = { apiKeyAuth };
