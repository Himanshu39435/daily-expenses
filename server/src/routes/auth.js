const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const EmployeeInvite = require('../models/EmployeeInvite');
const auth = require('../middleware/auth');
const wrap = require('../middleware/wrap');
const { roleFor } = require('../utils/roles');
const { createPasswordResetToken, hashPasswordResetToken } = require('../utils/passwordReset');
const { createPasswordResetMailer } = require('../utils/passwordResetMailer');

const pub = (u) => ({
  id: u._id, name: u.name, email: u.email, companyName: u.companyName,
  role: roleFor(u),
  openingBalance: u.openingBalance, openingDate: new Date(u.openingDate).toISOString().slice(0, 10),
});
const sign = (u) => jwt.sign({ id: u._id, v: u.authVersion || 0 }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES || '7d' });
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false, message: { message: 'Too many attempts, try again in a few minutes' } });
const resetLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false, message: { message: 'Too many password reset attempts. Try again later.' } });
const bad = (res, message) => res.status(400).json({ message });

router.post('/register', limiter, wrap(async (req, res) => {
  if (process.env.ALLOW_REGISTRATION === 'false') return res.status(403).json({ message: 'Administrator setup is disabled' });
  if (await User.countDocuments()) return res.status(403).json({ message: 'Administrator setup is already complete. Employees must join using an invitation.' });
  const { name, email, password, companyName, adminSetupKey } = req.body || {};
  const expectedKey = process.env.ADMIN_SETUP_KEY;
  if (!expectedKey || expectedKey.length < 24) {
    return res.status(503).json({ message: 'Administrator setup is not configured. Set ADMIN_SETUP_KEY in the server environment.' });
  }
  const suppliedKey = typeof adminSetupKey === 'string' ? adminSetupKey : '';
  const expectedBuffer = Buffer.from(expectedKey);
  const suppliedBuffer = Buffer.from(suppliedKey);
  if (suppliedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)) {
    return res.status(403).json({ message: 'Invalid administrator setup key' });
  }
  if (typeof name !== 'string' || !name.trim()) return bad(res, 'Name is required');
  if (typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email)) return bad(res, 'Enter a valid email address');
  if (typeof password !== 'string' || password.length < 8) return bad(res, 'Password must be at least 8 characters');
  if (await User.findOne({ email: email.toLowerCase() })) return res.status(409).json({ message: 'An account with this email already exists' });
  const user = await User.create({
    name: name.trim(), email, companyName: typeof companyName === 'string' ? companyName.trim() || 'My Company' : 'My Company',
    password: await bcrypt.hash(password, 11), role: 'admin', isPrimaryAdmin: true,
  });
  res.status(201).json({ token: sign(user), user: pub(user) });
}));

router.post('/accept-invite', limiter, wrap(async (req, res) => {
  const { token, name, password } = req.body || {};
  if (typeof token !== 'string' || !/^[a-f\d]{64}$/i.test(token)) return bad(res, 'This invitation is invalid or has expired');
  if (typeof name !== 'string' || !name.trim()) return bad(res, 'Name is required');
  if (typeof password !== 'string' || password.length < 8) return bad(res, 'Password must be at least 8 characters');
  const invite = await EmployeeInvite.findOne({ tokenHash: crypto.createHash('sha256').update(token).digest('hex'), expiresAt: { $gt: new Date() } });
  if (!invite) return res.status(410).json({ message: 'This invitation is invalid or has expired' });
  const admin = await User.findById(invite.invitedBy);
  if (!admin) return res.status(410).json({ message: 'This invitation is no longer available' });
  let user = await User.findOne({ email: invite.email });
  if (user) {
    if (!(await bcrypt.compare(password, user.password))) return res.status(401).json({ message: 'Incorrect password for this existing account' });
    user.set({ name: name.trim(), role: 'employee', isPrimaryAdmin: false, organizationId: admin._id, companyName: admin.companyName });
    await user.save();
  } else {
    user = await User.create({
      name: name.trim(), email: invite.email, password: await bcrypt.hash(password, 11),
      role: 'employee', organizationId: admin._id, companyName: admin.companyName,
    });
  }
  await invite.deleteOne();
  res.status(201).json({ token: sign(user), user: pub(user) });
}));

router.post('/login', limiter, wrap(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: String(email || '').toLowerCase() });
  if (!user || !(await bcrypt.compare(password || '', user.password))) return res.status(401).json({ message: 'Incorrect email or password' });
  res.json({ token: sign(user), user: pub(user) });
}));

router.post('/forgot-password', resetLimiter, wrap(async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!/^\S+@\S+\.\S+$/.test(email)) return bad(res, 'Enter a valid email address');

  const mailer = createPasswordResetMailer();
  const user = await User.findOne({ email });
  if (user) {
    const reset = createPasswordResetToken();
    user.passwordResetTokenHash = reset.tokenHash;
    user.passwordResetExpires = reset.expiresAt;
    await user.save();

    try {
      await mailer.send(user.email, reset.token);
    } catch (error) {
      await User.updateOne(
        { _id: user._id, passwordResetTokenHash: reset.tokenHash },
        { $unset: { passwordResetTokenHash: 1, passwordResetExpires: 1 } }
      );
      console.error('Password reset email delivery failed:', error);
      return res.status(503).json({ message: 'Could not send the reset email. Check the email server settings and try again.' });
    }
  }
  res.json({ message: 'If an account exists for that email, a password reset link has been sent.' });
}));

router.post('/reset-password', resetLimiter, wrap(async (req, res) => {
  const { token, password } = req.body || {};
  if (typeof token !== 'string' || !/^[a-f\d]{64}$/i.test(token)) {
    return res.status(410).json({ message: 'This password reset link is invalid or has expired.' });
  }
  if (typeof password !== 'string' || password.length < 8) return bad(res, 'Password must be at least 8 characters');

  const result = await User.findOneAndUpdate(
    { passwordResetTokenHash: hashPasswordResetToken(token), passwordResetExpires: { $gt: new Date() } },
    {
      $set: { password: await bcrypt.hash(password, 11) },
      $inc: { authVersion: 1 },
      $unset: { passwordResetTokenHash: 1, passwordResetExpires: 1 },
    },
    { new: true }
  );
  if (!result) return res.status(410).json({ message: 'This password reset link is invalid or has expired.' });
  res.json({ message: 'Password reset successfully. You can now sign in.' });
}));

router.get('/me', auth, (req, res) => res.json({ user: pub(req.user) }));

router.put('/settings', auth, wrap(async (req, res) => {
  const { name, companyName, openingBalance, openingDate } = req.body;
  if (req.user.role === 'employee' && [companyName, openingBalance, openingDate].some((value) => value !== undefined)) {
    return res.status(403).json({ message: 'Only an administrator can change company settings' });
  }
  const upd = {};
  if (name !== undefined) { if (!String(name).trim()) return bad(res, 'Name is required'); upd.name = String(name).trim(); }
  if (companyName !== undefined) upd.companyName = String(companyName).trim() || 'My Company';
  if (openingBalance !== undefined) {
    const n = Number(openingBalance);
    if (!Number.isFinite(n) || n < 0 || n > 1e9) return bad(res, 'Opening balance must be a number, 0 or more');
    upd.openingBalance = Math.round(n * 100) / 100;
  }
  if (openingDate !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(openingDate) || isNaN(new Date(openingDate))) return bad(res, 'Enter a valid opening date');
    upd.openingDate = new Date(openingDate + 'T00:00:00.000Z');
  }
  const user = await User.findByIdAndUpdate(req.user._id, upd, { new: true });
  res.json({ user: pub(user) });
}));

router.put('/password', auth, wrap(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) return bad(res, 'New password must be at least 8 characters');
  const user = await User.findById(req.user._id);
  if (!(await bcrypt.compare(currentPassword || '', user.password))) return bad(res, 'Current password is incorrect');
  user.password = await bcrypt.hash(newPassword, 11);
  user.passwordResetTokenHash = undefined;
  user.passwordResetExpires = undefined;
  await user.save();
  res.json({ ok: true });
}));

module.exports = router;
