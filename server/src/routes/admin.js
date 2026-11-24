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
const { roleFor, companyIdFor, canManageMember } = require('../utils/roles');

router.use(auth, requireRole('admin'));

const memberView = (member) => ({
  _id: String(member._id),
  name: member.name,
  email: member.email,
  role: roleFor(member),
  isActive: member.isActive !== false,
  createdAt: member.createdAt,
});

router.get('/dashboard', wrap(async (req, res) => {
  const companyId = companyIdFor(req.user);
  const members = await User.find({
    $or: [{ _id: companyId }, { organizationId: companyId }],
  }).select('name email role isPrimaryAdmin isCompanyAdmin isActive companyName openingBalance openingDate createdAt').lean();
  const ids = members.map((member) => member._id);
  const txns = await Transaction.find({ owner: { $in: ids } }).lean();
  const byOwner = new Map(ids.map((id) => [String(id), []]));
  for (const txn of txns) byOwner.get(String(txn.owner))?.push(txn);

  const users = members.map((member) => {
    const userTxns = byOwner.get(String(member._id)) || [];
    return {
      id: String(member._id), name: member.name, email: member.email,
      role: roleFor(member),
      summary: summarize(member.openingBalance, userTxns),
      isActive: member.isActive !== false,
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
  const employees = users.filter((member) => member.role === 'employee' && member.isActive);
  res.json({
    summary, employeeCount: employees.length,
    employees,
    recent,
  });
}));

router.get('/employees', wrap(async (req, res) => {
  const companyId = companyIdFor(req.user);
  const roles = req.user.isPrimaryAdmin === true ? ['employee', 'admin'] : ['employee'];
  const [employees, invites] = await Promise.all([
    User.find({ organizationId: companyId, role: { $in: roles }, isPrimaryAdmin: { $ne: true } })
      .select('name email role isPrimaryAdmin isCompanyAdmin isActive createdAt')
      .sort({ name: 1 }).lean(),
    EmployeeInvite.find({ invitedBy: req.user._id, expiresAt: { $gt: new Date() } }).select('email createdAt expiresAt').sort({ createdAt: -1 }).lean(),
  ]);
  const members = employees.map(memberView);
  res.json({
    employees: members.filter((member) => member.role === 'employee'),
    admins: req.user.isPrimaryAdmin === true ? members.filter((member) => member.role === 'admin') : [],
    invites,
    canManageAdmins: req.user.isPrimaryAdmin === true,
  });
}));

router.put('/employees/:id', wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Team member not found' });
  const companyId = companyIdFor(req.user);
  const target = await User.findOne({
    _id: req.params.id,
    organizationId: companyId,
    isPrimaryAdmin: { $ne: true },
  });
  if (!target) return res.status(404).json({ message: 'Team member not found' });
  if (!canManageMember(req.user, target)) return res.status(403).json({ message: 'You cannot manage this account' });

  const { name, email: rawEmail, role, isActive } = req.body || {};
  const update = {};
  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ message: 'Name is required' });
    update.name = name.trim();
  }
  if (rawEmail !== undefined) {
    const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ message: 'Enter a valid email address' });
    update.email = email;
  }
  if (role !== undefined) {
    if (!['admin', 'employee'].includes(role)) return res.status(400).json({ message: 'Choose a valid account role' });
    if (role === 'employee' && roleFor(target) === 'admin' && req.user.isPrimaryAdmin !== true) {
      return res.status(403).json({ message: 'Only the owner can change another administrator to employee' });
    }
    update.role = role;
    update.isCompanyAdmin = role === 'admin';
    update.isPrimaryAdmin = false;
  }
  if (isActive !== undefined) {
    if (typeof isActive !== 'boolean') return res.status(400).json({ message: 'Account status must be active or inactive' });
    update.isActive = isActive;
  }
  if (!Object.keys(update).length) return res.status(400).json({ message: 'No changes were provided' });

  const accessChanged = (update.role !== undefined && update.role !== target.role) ||
    (update.isActive !== undefined && update.isActive !== (target.isActive !== false));
  const filter = {
    _id: target._id,
    organizationId: companyId,
    isPrimaryAdmin: { $ne: true },
    role: target.role,
    isCompanyAdmin: target.isCompanyAdmin === true ? true : { $ne: true },
  };
  const updateOperation = { $set: update };
  if (accessChanged) updateOperation.$inc = { authVersion: 1 };

  try {
    const updated = await User.findOneAndUpdate(filter, updateOperation, { new: true, runValidators: true }).lean();
    if (!updated) return res.status(409).json({ message: 'This account changed while you were editing it. Refresh and try again.' });
    res.json({ member: memberView(updated) });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: 'An account with this email already exists' });
    throw error;
  }
}));

router.post('/invites', wrap(async (req, res) => {
  const companyId = companyIdFor(req.user);
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ message: 'Enter a valid email address' });
  if (await User.findOne({ email, organizationId: companyId })) {
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
