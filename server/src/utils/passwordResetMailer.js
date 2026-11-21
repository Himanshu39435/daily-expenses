const nodemailer = require('nodemailer');
const { buildPasswordResetUrl } = require('./passwordReset');

function createPasswordResetMailer() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM, CLIENT_URL } = process.env;
  const port = Number(SMTP_PORT);
  if (!SMTP_HOST || !Number.isInteger(port) || port < 1 || port > 65535 || !SMTP_USER || !SMTP_PASS || !MAIL_FROM || !CLIENT_URL) {
    throw Object.assign(new Error('Password reset email is not configured. Set the SMTP, MAIL_FROM, and CLIENT_URL environment variables.'), { status: 503 });
  }
  buildPasswordResetUrl(CLIENT_URL, '0'.repeat(64));

  const transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  return {
    send: (to, token) => transport.sendMail({
      from: MAIL_FROM,
      to,
      subject: 'Reset your Daily Expense Manager password',
      text: `Use this link to reset your password. It expires in 15 minutes and can only be used once:\n\n${buildPasswordResetUrl(CLIENT_URL, token)}\n\nIf you did not request this, you can ignore this email.`,
    }),
  };
}

module.exports = { createPasswordResetMailer };
