const crypto = require('crypto');

const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;

function hashPasswordResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function createPasswordResetToken(now = Date.now()) {
  const token = crypto.randomBytes(32).toString('hex');
  return {
    token,
    tokenHash: hashPasswordResetToken(token),
    expiresAt: new Date(now + RESET_TOKEN_TTL_MS),
  };
}

function buildPasswordResetUrl(clientUrl, token) {
  let url;
  try {
    url = new URL(clientUrl);
  } catch {
    throw Object.assign(new Error('Password reset client URL is not configured correctly.'), { status: 503 });
  }

  const isLocalHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !isLocalHttp) || url.username || url.password) {
    throw Object.assign(new Error('Password reset client URL must use HTTPS.'), { status: 503 });
  }

  return new URL(`/reset-password/${encodeURIComponent(token)}`, url.origin).toString();
}

module.exports = {
  RESET_TOKEN_TTL_MS,
  buildPasswordResetUrl,
  createPasswordResetToken,
  hashPasswordResetToken,
};
