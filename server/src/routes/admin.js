const router = require('express').Router();
const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
const EmployeeInvite = require('../models/EmployeeInvite');
const Transaction = require('../models/Transaction');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const wrap = require('../middleware/wrap');
const { buildLedger, summarize } = require('../utils/calc');

router.use(auth, requireRole('admin'));

router.get('/dashboard', wrap(async (req, res) => {
  const members = await User.find({
    $or: [{ _id: req.user._id }, { organizationId: req.user._id, role: 'employee' }],
  }).select('name email role companyName openingBalance openingDate createdAt').lean();
  const ids = members.map((member) => member._id);
  const txns = await Transaction.find({ owner: { $in: ids } }).lean();
  const byOwner = new Map(ids.map((id) => [String(id), []]));
  for (const txn of txns) byOwner.get(String(txn.owner))?.push(txn);

  const users = members.map((member) => {
    const userTxns = byOwner.get(String(member._id)) || [];
    return {
      id: String(member._id), name: member.name, email: member.email,
      role: member.role || (String(member._id) === String(req.user._id) ? 'admin' : 'employee'),
      summary: summarize(member.openingBalance, userTxns),
      recent: buildLedger(member.openingBalance, userTxns).slice(-5).reverse()
        .map((row) => ({ ...row, userName: member.name })),
    };
  });
  const summary = users.reduce((total, member) => {
    for (const key of ['openingBalance', 'totalReceived', 'companyExpenses', 'personalExpenses', 'reimbursed', 'currentMonthExpenses', 'totalCompanyMoney', 'totalExpenses', 'companyBalance', 'pendingReimbursement']) {
      total[key] += member.summary[key];
    }
    total.count += member.summary.count;
    return total;
  }, {
    openingBalance: 0, totalReceived: 0, companyExpenses: 0, personalExpenses: 0,
    reimbursed: 0, currentMonthExpenses: 0, totalCompanyMoney: 0, totalExpenses: 0,
    companyBalance: 0, pendingReimbursement: 0, count: 0,
  });
  const recent = users.flatMap((member) => member.recent).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  res.json({
    summary, employeeCount: users.filter((member) => member.role === 'employee').length,
    employees: users.filter((member) => member.role === 'employee'),
    recent,
  });
}));

router.get('/employees', wrap(async (req, res) => {
  const [employees, invites] = await Promise.all([
    User.find({ organizationId: req.user._id, role: 'employee' }).select('name email createdAt').sort({ name: 1 }).lean(),
    EmployeeInvite.find({ invitedBy: req.user._id, expiresAt: { $gt: new Date() } }).select('email createdAt expiresAt').sort({ createdAt: -1 }).lean(),
  ]);
  res.json({ employees, invites });
}));

router.post('/invites', wrap(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ message: 'Enter a valid email address' });
  if (await User.findOne({ email, role: 'employee', organizationId: req.user._id })) {
    return res.status(409).json({ message: 'This employee is already part of your company' });
  }
  if (await EmployeeInvite.findOne({ email, invitedBy: req.user._id, expiresAt: { $gt: new Date() } })) {
    return res.status(409).json({ message: 'An active invitation already exists for this email' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  const invite = await EmployeeInvite.create({
    email, invitedBy: req.user._id, tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });
  res.status(201).json({ invite: { id: invite._id, email, expiresAt: invite.expiresAt }, token });
}));

router.delete('/invites/:id', wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Invitation not found' });
  const invite = await EmployeeInvite.findOneAndDelete({ _id: req.params.id, invitedBy: req.user._id });
  if (!invite) return res.status(404).json({ message: 'Invitation not found' });
  res.json({ ok: true });
}));

module.exports = router;
