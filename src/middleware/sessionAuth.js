const { findUserBySession } = require('../auth/users');

function parseCookies(cookieHeader) {
  if (!cookieHeader) return {};
  const cookies = {};
  cookieHeader.split(';').forEach((pair) => {
    const [key, ...rest] = pair.trim().split('=');
    cookies[key] = rest.join('=');
  });
  return cookies;
}

function sessionAuth(req, res, next) {
  const cookies = parseCookies(req.headers.cookie);
  const sessionHash = cookies['provifier_session'];

  if (!sessionHash) {
    return res.status(401).json({
      error: { message: 'Not authenticated.', code: 'NOT_AUTHENTICATED' },
    });
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
  const user = findUserBySession(sessionHash, ip);

  if (!user) {
    return res.status(401).json({
      error: { message: 'Session expired or invalid.', code: 'SESSION_EXPIRED' },
    });
  }

  req.user = user;
  next();
}

module.exports = { sessionAuth };
