const { Router } = require('express');
const {
  findUserByEmail,
  findUserByAlexiuzId,
  insertSsoUser,
  updateUser,
  generateSessionHash,
  findUserBySession,
} = require('../auth/users');
const { consumeToken } = require('../auth/alexiuz-sso');
const config = require('../config');

const router = Router();

// POST /auth/logout
router.post('/logout', (req, res) => {
  const cookies = {};
  (req.headers.cookie || '').split(';').forEach((pair) => {
    const [key, ...rest] = pair.trim().split('=');
    cookies[key] = rest.join('=');
  });

  const sessionHash = cookies['provifier_session'];
  if (sessionHash) {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
    const user = findUserBySession(sessionHash, ip);
    if (user) {
      updateUser(user.id, { sessionHash: null, sessionIp: null });
    }
  }

  res.setHeader('Set-Cookie', 'provifier_session=; Path=/; HttpOnly; Max-Age=0');
  res.json({ status: 'success' });
});

// GET /auth/me
router.get('/me', (req, res) => {
  const cookies = {};
  (req.headers.cookie || '').split(';').forEach((pair) => {
    const [key, ...rest] = pair.trim().split('=');
    cookies[key] = rest.join('=');
  });

  const sessionHash = cookies['provifier_session'];
  if (!sessionHash) {
    return res.status(401).json({ error: { message: 'Not authenticated.', code: 'NOT_AUTHENTICATED' } });
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
  const user = findUserBySession(sessionHash, ip);

  if (!user) {
    return res.status(401).json({ error: { message: 'Session expired.', code: 'SESSION_EXPIRED' } });
  }

  res.json({
    id: user.id,
    email: user.email,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  });
});

// GET /auth/sso/callback?token=...
router.get('/sso/callback', async (req, res) => {
  try {
    const { token } = req.query;
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;

    const ssoUser = await consumeToken(token, clientIp);
    if (!ssoUser) {
      return res.redirect('/login?error=invalid-token');
    }

    let user = findUserByAlexiuzId(ssoUser.alexiuzUserId);

    if (!user) {
      user = findUserByEmail(ssoUser.email);
      if (user) {
        if (!user.alexiuzUserId) {
          updateUser(user.id, { alexiuzUserId: ssoUser.alexiuzUserId });
        }
      } else {
        user = insertSsoUser({
          email: ssoUser.email,
          alexiuzUserId: ssoUser.alexiuzUserId,
        });
      }
    }

    const sessionHash = generateSessionHash();
    updateUser(user.id, {
      sessionHash,
      sessionIp: clientIp,
      status: 1,
      lastLoginAt: new Date().toISOString(),
    });

    res.setHeader('Set-Cookie',
      `provifier_session=${sessionHash}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 3600}` +
      (config.nodeEnv === 'production' ? '; Secure' : '')
    );

    res.redirect('/dashboard');
  } catch (err) {
    console.error('[AUTH] SSO callback error:', err.message);
    res.redirect('/login?error=sso-failed');
  }
});

module.exports = router;
