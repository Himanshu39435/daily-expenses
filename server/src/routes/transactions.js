const router = require('express').Router();
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const DeletedTransaction = require('../models/DeletedTransaction');
const auth = require('../middleware/auth');
const wrap = require('../middleware/wrap');
const { upload, uploadDir, removeFile } = require('../middleware/upload');
const { buildLedger, summarize, r2, iso } = require('../utils/calc');
const { parseTxn } = require('../utils/validate');

router.use(auth);
const flag = (v) => v === true || v === 'true';
const fmt = (n) => '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const lc = (s) => String(s || '').trim().toLowerCase();

async function load(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) { res.status(404).json({ message: 'Transaction not found' }); return null; }
  const doc = await Transaction.findOne({ _id: req.params.id, owner: req.user._id });
  if (!doc) res.status(404).json({ message: 'Transaction not found' });
  return doc;
}

/** Runs duplicate + funds checks. Returns true if a response was sent. */
async function guard(req, res, data, excludeId) {
  const all = await Transaction.find({ owner: req.user._id }).lean();
  const others = all.filter((t) => String(t._id) !== String(excludeId || ''));
  if (!flag(req.body.force)) {
    const dup = others.find((t) => t.type === data.type && iso(t.date) === iso(data.date) && r2(t.amount) === data.amount &&
      lc(t.party) === lc(data.party) && lc(t.description) === lc(data.description) && t.category === data.category);
    if (dup) {
      res.status(409).json({ code: 'DUPLICATE', existing: dup.txnId, message: `Looks like a duplicate of ${dup.txnId} (same date, amount, payee and description).` });
      return true;
    }
  }
  if (data.type === 'expense' && data.companyPaid > 0 && !flag(req.body.allowOverdraw)) {
    const available = summarize(req.user.openingBalance, others).companyBalance;
    if (data.companyPaid > available + 0.004) {
      res.status(409).json({
        code: 'INSUFFICIENT_BALANCE', available: Math.max(available, 0), requested: data.companyPaid, amount: data.amount,
        message: `Company balance is ${fmt(Math.max(available, 0))} but ${fmt(data.companyPaid)} was marked as paid from company money.`,
      });
      return true;
    }
  }
  return false;
}

router.get('/', wrap(async (req, res) => {
  const txns = await Transaction.find({ owner: req.user._id }).lean();
  let rows = buildLedger(req.user.openingBalance, txns); // running balances are always computed on the FULL ledger
  rows = rows.map(({ lastEditedByName, lastEditedAt, editCount, editHistory, ...safe }) => safe);
  const { search, from, to, category, type, source, sort } = req.query;
  if (from) rows = rows.filter((r) => r.date >= from);
  if (to) rows = rows.filter((r) => r.date <= to);
  if (category) rows = rows.filter((r) => r.category === category);
  if (type) rows = rows.filter((r) => r.type === type);
  if (source === 'company') rows = rows.filter((r) => r.companyExpense > 0);
  if (source === 'personal') rows = rows.filter((r) => r.personalExpense > 0);
  if (search) {
    const q = String(search).toLowerCase();
    rows = rows.filter((r) => [r.txnId, r.description, r.party, r.category, r.notes, r.amount, r.date].join(' ').toLowerCase().includes(q));
  }
  const totals = rows.reduce((t, r) => ({
    received: r2(t.received + r.received), companyExpense: r2(t.companyExpense + r.companyExpense),
    personalExpense: r2(t.personalExpense + r.personalExpense), reimbursed: r2(t.reimbursed + r.reimbursed),
  }), { received: 0, companyExpense: 0, personalExpense: 0, reimbursed: 0 });
  if (sort !== 'asc') rows.reverse();
  res.json({ rows, totals, count: rows.length });
}));

router.get('/:id', wrap(async (req, res) => {
  const doc = await load(req, res); if (!doc) return;
  const all = await Transaction.find({ owner: req.user._id }).lean();
  const row = buildLedger(req.user.openingBalance, all).find((r) => r._id === String(doc._id));
  if (row) {
    delete row.lastEditedByName;
    delete row.lastEditedAt;
    delete row.editCount;
    delete row.editHistory;
  }
  res.json(row);
}));

router.post('/', upload.single('bill'), wrap(async (req, res) => {
  const { errors, data } = parseTxn(req.body);
  if (errors.length) { removeFile(req.file?.filename); return res.status(400).json({ message: errors[0], errors }); }
  if (await guard(req, res, data)) { removeFile(req.file?.filename); return; }
  const { txnSeq } = await User.findByIdAndUpdate(req.user._id, { $inc: { txnSeq: 1 } }, { new: true });
  const doc = await Transaction.create({
    ...data, owner: req.user._id, txnId: `TXN-${String(txnSeq).padStart(5, '0')}`,
    billFile: req.file?.filename, billName: req.file?.originalname, billMime: req.file?.mimetype,
    createdByName: req.user.name,
  });
  res.status(201).json({ ok: true, txnId: doc.txnId, id: doc._id });
}));

router.put('/:id', upload.single('bill'), wrap(async (req, res) => {
  const doc = await load(req, res); if (!doc) { removeFile(req.file?.filename); return; }
  const { errors, data } = parseTxn(req.body);
  if (errors.length) { removeFile(req.file?.filename); return res.status(400).json({ message: errors[0], errors }); }
  if (await guard(req, res, data, doc._id)) { removeFile(req.file?.filename); return; }
  const trackedFields = ['date', 'amount', 'party', 'paymentMode', 'description', 'category', 'notes', 'paymentSource', 'companyPaid', 'personalPaid'];
  const changes = {};
  trackedFields.forEach((key) => {
    const before = key === 'date' ? iso(doc[key]) : String(doc[key] ?? '');
    const after = key === 'date' ? iso(data[key]) : String(data[key] ?? '');
    if (before !== after) changes[key] = { before: doc[key] instanceof Date ? iso(doc[key]) : doc[key], after: data[key] };
  });
  if (req.file) changes.bill = { before: doc.billName || 'No bill', after: req.file.originalname };
  else if (flag(req.body.removeBill)) changes.bill = { before: doc.billName || 'Bill attached', after: 'Removed' };
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
  } else if (flag(req.body.removeBill)) {
    removeFile(doc.billFile);
    doc.set({ billFile: undefined, billName: undefined, billMime: undefined });
  }
  await doc.save();
  res.json({ ok: true, txnId: doc.txnId });
}));

router.delete('/:id', wrap(async (req, res) => {
  const doc = await load(req, res); if (!doc) return;
  let archivedBillFile;
  if (doc.billFile) {
    try {
      const source = path.join(uploadDir(), path.basename(doc.billFile));
      if (fs.existsSync(source)) {
        const ext = path.extname(doc.billFile);
        archivedBillFile = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}-deleted${ext}`;
        fs.mkdirSync(uploadDir(), { recursive: true });
        fs.copyFileSync(source, path.join(uploadDir(), archivedBillFile));
      }
    } catch { /* Keep the deleted transaction restorable even if its bill is unavailable. */ }
  }
  await DeletedTransaction.create({
    originalOwner: req.user._id,
    deletedBy: req.user._id,
    deletedByName: req.user.name,
    txnId: doc.txnId,
    type: doc.type,
    date: doc.date,
    description: doc.description,
    category: doc.category,
    party: doc.party,
    amount: doc.amount,
    paymentMode: doc.paymentMode,
    paymentSource: doc.paymentSource,
    companyPaid: doc.companyPaid,
    personalPaid: doc.personalPaid,
    notes: doc.notes,
    billFile: archivedBillFile,
    billName: doc.billName,
    billMime: doc.billMime,
    lastEditedByName: doc.lastEditedByName,
    lastEditedAt: doc.lastEditedAt,
    editCount: doc.editCount,
  });
  removeFile(doc.billFile);
  await doc.deleteOne();
  res.json({ ok: true });
}));

router.get('/:id/bill', wrap(async (req, res) => {
  const doc = await load(req, res); if (!doc) return;
  if (!doc.billFile) return res.status(404).json({ message: 'No bill attached' });
  res.type(doc.billMime || 'application/octet-stream');
  res.sendFile(path.join(uploadDir(), path.basename(doc.billFile)), (e) => { if (e && !res.headersSent) res.status(404).json({ message: 'Bill file is missing on the server' }); });
}));

module.exports = router;
