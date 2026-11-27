const router = require('express').Router();
const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
const EmployeeInvite = require('../models/EmployeeInvite');
const Transaction = require('../models/Transaction');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const wrap = require('../middleware/wrap');
const { upload, uploadDir, removeFile } = require('../middleware/upload');
const { buildLedger, summarize } = require('../utils/calc');
const { roleFor, companyIdFor, canManageMember } = require('../utils/roles');
const { parseTxn } = require('../utils/validate');
const path = require('path');

router.use(auth, requireRole('admin'));

const ownerAuditView = (req, row) => {
  if (req.user.isPrimaryAdmin === true) return row;
  const { lastEditedByName, lastEditedAt, editCount, editHistory, ...safe } = row;
  return safe;
};

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
        .map((row) => ownerAuditView(req, { ...row, userName: member.name })),
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

async function findManagedEmployee(req, res) {
  if (!mongoose.isValidObjectId(req.params.employeeId)) {
    res.status(404).json({ message: 'Employee not found' });
    return null;
  }
  const companyId = companyIdFor(req.user);
  const employee = await User.findOne({
    _id: req.params.employeeId,
    organizationId: companyId,
    isPrimaryAdmin: { $ne: true },
  }).select('name email role isPrimaryAdmin isCompanyAdmin isActive openingBalance');
  if (!employee || roleFor(employee) !== 'employee') {
    res.status(404).json({ message: 'Employee not found' });
    return null;
  }
  return employee;
}

router.get('/employees/:employeeId/transactions', wrap(async (req, res) => {
  const employee = await findManagedEmployee(req, res);
  if (!employee) return;
  const txns = await Transaction.find({ owner: employee._id }).lean();
  res.json({
    employee: memberView(employee),
    summary: summarize(employee.openingBalance, txns),
    rows: buildLedger(employee.openingBalance, txns).reverse().map((row) => ownerAuditView(req, row)),
  });
}));

router.get('/employees/:employeeId/transactions/:id', wrap(async (req, res) => {
  const employee = await findManagedEmployee(req, res);
  if (!employee) return;
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Transaction not found' });
  const doc = await Transaction.findOne({ _id: req.params.id, owner: employee._id }).lean();
  if (!doc) return res.status(404).json({ message: 'Transaction not found' });
  const all = await Transaction.find({ owner: employee._id }).lean();
  res.json(buildLedger(employee.openingBalance, all).find((row) => row._id === String(doc._id)));
}));

router.put('/employees/:employeeId/transactions/:id', upload.single('bill'), wrap(async (req, res) => {
  const employee = await findManagedEmployee(req, res);
  if (!employee) { removeFile(req.file?.filename); return; }
  if (!mongoose.isValidObjectId(req.params.id)) { removeFile(req.file?.filename); return res.status(404).json({ message: 'Transaction not found' }); }
  const doc = await Transaction.findOne({ _id: req.params.id, owner: employee._id });
  if (!doc) { removeFile(req.file?.filename); return res.status(404).json({ message: 'Transaction not found' }); }
  const { errors, data } = parseTxn(req.body);
  if (errors.length) { removeFile(req.file?.filename); return res.status(400).json({ message: errors[0], errors }); }

  const all = await Transaction.find({ owner: employee._id }).lean();
  const others = all.filter((txn) => String(txn._id) !== String(doc._id));
  if (req.body.force !== 'true') {
    const duplicate = others.find((txn) => txn.type === data.type &&
      new Date(txn.date).toISOString().slice(0, 10) === new Date(data.date).toISOString().slice(0, 10) &&
      txn.amount === data.amount && String(txn.party).trim().toLowerCase() === String(data.party).trim().toLowerCase() &&
      String(txn.description).trim().toLowerCase() === String(data.description).trim().toLowerCase() &&
      txn.category === data.category);
    if (duplicate) {
      removeFile(req.file?.filename);
      return res.status(409).json({ code: 'DUPLICATE', existing: duplicate.txnId, message: `Looks like a duplicate of ${duplicate.txnId} (same date, amount, payee and description).` });
    }
  }
  if (data.type === 'expense' && data.companyPaid > 0 && req.body.allowOverdraw !== 'true') {
    const available = summarize(employee.openingBalance, others).companyBalance;
    if (data.companyPaid > available + 0.004) {
      removeFile(req.file?.filename);
      return res.status(409).json({
        code: 'INSUFFICIENT_BALANCE', available: Math.max(available, 0), requested: data.companyPaid, amount: data.amount,
        message: `Company balance is \u20B9${Math.max(available, 0).toLocaleString('en-IN')} but \u20B9${data.companyPaid.toLocaleString('en-IN')} was marked as paid from company money.`,
      });
    }
  }

  const trackedFields = ['date', 'amount', 'party', 'paymentMode', 'description', 'category', 'notes', 'paymentSource', 'companyPaid', 'personalPaid'];
  const changes = {};
  trackedFields.forEach((key) => {
    const before = key === 'date' ? new Date(doc[key]).toISOString().slice(0, 10) : String(doc[key] ?? '');
    const after = key === 'date' ? new Date(data[key]).toISOString().slice(0, 10) : String(data[key] ?? '');
    if (before !== after) changes[key] = { before: doc[key] instanceof Date ? before : doc[key], after: data[key] };
  });
  if (req.file) changes.bill = { before: doc.billName || 'No bill', after: req.file.originalname };
  else if (req.body.removeBill === 'true') changes.bill = { before: doc.billName || 'Bill attached', after: 'Removed' };
  const editedAt = new Date();
  if (Object.keys(changes).length) {
    doc.editHistory = [...(doc.editHistory || []), {
      editedByName: req.user.name,
      editedAt,
      changes,
    }];
  }
  doc.set(data);
  if (Object.keys(changes).length) {
    doc.lastEditedByName = req.user.name;
    doc.lastEditedAt = editedAt;
    doc.editCount = (doc.editCount || 0) + 1;
  }
  if (req.file) {
    removeFile(doc.billFile);
    doc.set({ billFile: req.file.filename, billName: req.file.originalname, billMime: req.file.mimetype });
  } else if (req.body.removeBill === 'true') {
    removeFile(doc.billFile);
    doc.set({ billFile: undefined, billName: undefined, billMime: undefined });
  }
  await doc.save();
  res.json({ ok: true, txnId: doc.txnId });
}));

router.get('/employees/:employeeId/transactions/:id/bill', wrap(async (req, res) => {
  const employee = await findManagedEmployee(req, res);
  if (!employee) return;
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Transaction not found' });
  const doc = await Transaction.findOne({ _id: req.params.id, owner: employee._id });
  if (!doc || !doc.billFile) return res.status(404).json({ message: doc ? 'No bill attached' : 'Transaction not found' });
  res.type(doc.billMime || 'application/octet-stream');
  res.sendFile(path.join(uploadDir(), path.basename(doc.billFile)), (e) => {
    if (e && !res.headersSent) res.status(404).json({ message: 'Bill file is missing on the server' });
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
