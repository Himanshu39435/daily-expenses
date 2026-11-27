const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const DeletedTransaction = require('../models/DeletedTransaction');
const auth = require('../middleware/auth');
const wrap = require('../middleware/wrap');
const { uploadDir, removeFile, OK } = require('../middleware/upload');
const { sortTxns, iso } = require('../utils/calc');
const { parseTxn } = require('../utils/validate');
const { companyIdFor, roleFor } = require('../utils/roles');

router.use(auth);

router.get('/', wrap(async (req, res) => {
  const companyWide = roleFor(req.user) === 'admin';
  let members = [req.user];
  if (companyWide) {
    const companyId = companyIdFor(req.user);
    members = await User.find({
      $or: [{ _id: companyId }, { organizationId: companyId }],
    }).select('_id name email role isPrimaryAdmin isCompanyAdmin').lean();
  }
  const memberIds = members.map((member) => member._id);
  const memberNames = new Map(members.map((member) => [String(member._id), member.name]));
  const txns = sortTxns(await Transaction.find({ owner: { $in: memberIds } }).lean());
  const out = txns.map((t) => {
    const o = {
      txnId: t.txnId, type: t.type, date: iso(t.date), description: t.description, category: t.category, party: t.party,
      amount: t.amount, paymentMode: t.paymentMode, paymentSource: t.paymentSource, personalPaid: t.personalPaid, notes: t.notes,
      createdByName: t.createdByName || '', lastEditedByName: t.lastEditedByName || '',
      lastEditedAt: t.lastEditedAt ? t.lastEditedAt.toISOString() : '', editCount: t.editCount || 0,
      editHistory: (t.editHistory || []).map((entry) => ({
        editedByName: entry.editedByName || '', editedAt: entry.editedAt ? entry.editedAt.toISOString() : '', changes: entry.changes || {},
      })),
    };
    if (companyWide) {
      o.ownerId = String(t.owner);
      o.employeeName = memberNames.get(String(t.owner)) || '';
    }
    if (t.billFile) {
      try {
        o.billName = t.billName; o.billMime = t.billMime;
        o.billData = fs.readFileSync(path.join(uploadDir(), path.basename(t.billFile))).toString('base64');
      } catch { /* bill file missing - skip */ }
    }
    return o;
  });
  const deleted = await DeletedTransaction.find({ originalOwner: { $in: memberIds } }).sort({ createdAt: -1 }).lean();
  const deletedOut = deleted.map((t) => {
    const o = {
      txnId: t.txnId, type: t.type, date: iso(t.date), description: t.description, category: t.category, party: t.party,
      amount: t.amount, paymentMode: t.paymentMode, paymentSource: t.paymentSource, companyPaid: t.companyPaid,
      personalPaid: t.personalPaid, notes: t.notes,
      ownerId: String(t.originalOwner),
      employeeName: memberNames.get(String(t.originalOwner)) || '',
      deletedAt: t.createdAt ? t.createdAt.toISOString() : '',
      deletedByName: t.deletedByName || '',
      lastEditedByName: t.lastEditedByName || '',
      lastEditedAt: t.lastEditedAt ? t.lastEditedAt.toISOString() : '',
      editCount: t.editCount || 0,
    };
    if (t.billFile) {
      try {
        o.billName = t.billName; o.billMime = t.billMime;
        o.billData = fs.readFileSync(path.join(uploadDir(), path.basename(t.billFile))).toString('base64');
      } catch { /* deleted bill file missing - skip */ }
    }
    return o;
  });
  const u = req.user;
  res.setHeader('Content-Disposition', `attachment; filename="expense-backup-${iso(new Date())}.json"`);
  res.json({
    app: 'company-daily-expense-manager', version: 2, exportedAt: new Date().toISOString(),
    settings: { companyName: u.companyName, openingBalance: u.openingBalance, openingDate: iso(u.openingDate) },
    transactions: out,
    deletedTransactions: deletedOut,
  });
}));

router.post('/restore', wrap(async (req, res) => {
  const d = req.body?.data;
  if (!d || d.app !== 'company-daily-expense-manager' || !Array.isArray(d.transactions)) {
    return res.status(400).json({ message: 'This is not a valid backup file from this application' });
  }
  const companyWide = roleFor(req.user) === 'admin';
  let allowedOwnerIds = new Set([String(req.user._id)]);
  if (companyWide) {
    const companyId = companyIdFor(req.user);
    const members = await User.find({
      $or: [{ _id: companyId }, { organizationId: companyId }],
    }).select('_id').lean();
    allowedOwnerIds = new Set(members.map((member) => String(member._id)));
  }
  const docs = [], errs = [];
  d.transactions.forEach((t, i) => {
    const { errors, data } = parseTxn(t);
    if (errors.length) errs.push(`Row ${i + 1}: ${errors.join(', ')}`);
    else {
      const ownerId = companyWide && t.ownerId ? String(t.ownerId) : String(req.user._id);
      if (!allowedOwnerIds.has(ownerId)) errs.push(`Row ${i + 1}: transaction belongs outside this company`);
      else docs.push({ ...data, txnId: t.txnId, ownerId, _src: t });
    }
  });
  const deletedRows = Array.isArray(d.deletedTransactions) ? d.deletedTransactions : [];
  deletedRows.forEach((t, i) => {
    const { errors, data } = parseTxn(t);
    if (errors.length) errs.push(`Deleted row ${i + 1}: ${errors.join(', ')}`);
    else {
      const ownerId = companyWide && t.ownerId ? String(t.ownerId) : String(req.user._id);
      if (!allowedOwnerIds.has(ownerId)) errs.push(`Deleted row ${i + 1}: transaction belongs outside this company`);
      else docs.push({ ...data, txnId: t.txnId, ownerId, _src: t });
    }
  });
  if (errs.length) return res.status(400).json({ message: `Backup has invalid rows. ${errs.slice(0, 3).join(' | ')}`, errors: errs });

  let seq = docs.reduce((m, x) => Math.max(m, parseInt(String(x.txnId || '').replace(/\D/g, ''), 10) || 0), 0);
  const seen = new Set();
  const newFiles = [];
  const inserts = docs.map(({ _src, ownerId, ...x }) => {
    if (!x.txnId || seen.has(x.txnId)) x.txnId = `TXN-${String(++seq).padStart(5, '0')}`;
    seen.add(x.txnId);
    if (_src.billData && OK[_src.billMime]) {
      const f = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${OK[_src.billMime]}`;
      fs.mkdirSync(uploadDir(), { recursive: true });
      fs.writeFileSync(path.join(uploadDir(), f), Buffer.from(_src.billData, 'base64'));
      newFiles.push(f);
      Object.assign(x, { billFile: f, billName: String(_src.billName || 'bill').slice(0, 120), billMime: _src.billMime });
    }
    if (_src.lastEditedByName) {
      x.lastEditedByName = String(_src.lastEditedByName).slice(0, 100);
      if (_src.lastEditedAt) x.lastEditedAt = new Date(_src.lastEditedAt);
      x.editCount = Number(_src.editCount) || 0;
      if (Array.isArray(_src.editHistory)) x.editHistory = _src.editHistory.slice(-100);
    }
    return { ...x, owner: ownerId };
  });

  const old = await Transaction.find({ owner: { $in: [...allowedOwnerIds] } }).select('billFile').lean();
  const oldDeleted = await DeletedTransaction.find({ originalOwner: { $in: [...allowedOwnerIds] } }).select('billFile').lean();
  try {
    await Transaction.deleteMany({ owner: { $in: [...allowedOwnerIds] } });
    await DeletedTransaction.deleteMany({ originalOwner: { $in: [...allowedOwnerIds] } });
    if (inserts.length) await Transaction.insertMany(inserts);
  } catch (e) { newFiles.forEach(removeFile); throw e; }
  old.forEach((o) => removeFile(o.billFile));
  oldDeleted.forEach((o) => removeFile(o.billFile));

  const s = d.settings || {};
  const upd = {};
  if (req.user.isPrimaryAdmin === true) {
    for (const memberId of allowedOwnerIds) {
      const memberSeq = inserts
        .filter((insert) => String(insert.owner) === memberId)
        .reduce((m, insert) => Math.max(m, parseInt(String(insert.txnId || '').replace(/\D/g, ''), 10) || 0), 0);
      if (memberSeq > 0) await User.findByIdAndUpdate(memberId, { txnSeq: memberSeq });
    }
    if (s.companyName) upd.companyName = String(s.companyName).slice(0, 100);
    if (Number.isFinite(Number(s.openingBalance)) && Number(s.openingBalance) >= 0) upd.openingBalance = Number(s.openingBalance);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s.openingDate || '')) upd.openingDate = new Date(s.openingDate + 'T00:00:00.000Z');
  }
  if (!req.user.isPrimaryAdmin) upd.txnSeq = seq;
  await User.findByIdAndUpdate(req.user._id, upd);
  res.json({ ok: true, restored: inserts.length });
}));

module.exports = router;
