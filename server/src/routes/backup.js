const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const auth = require('../middleware/auth');
const wrap = require('../middleware/wrap');
const { uploadDir, removeFile, OK } = require('../middleware/upload');
const { sortTxns, iso } = require('../utils/calc');
const { parseTxn } = require('../utils/validate');

router.use(auth);

router.get('/', wrap(async (req, res) => {
  const txns = sortTxns(await Transaction.find({ owner: req.user._id }).lean());
  const out = txns.map((t) => {
    const o = {
      txnId: t.txnId, type: t.type, date: iso(t.date), description: t.description, category: t.category, party: t.party,
      amount: t.amount, paymentMode: t.paymentMode, paymentSource: t.paymentSource, personalPaid: t.personalPaid, notes: t.notes,
    };
    if (t.billFile) {
      try {
        o.billName = t.billName; o.billMime = t.billMime;
        o.billData = fs.readFileSync(path.join(uploadDir(), path.basename(t.billFile))).toString('base64');
      } catch { /* bill file missing - skip */ }
    }
    return o;
  });
  const u = req.user;
  res.setHeader('Content-Disposition', `attachment; filename="expense-backup-${iso(new Date())}.json"`);
  res.json({
    app: 'company-daily-expense-manager', version: 1, exportedAt: new Date().toISOString(),
    settings: { companyName: u.companyName, openingBalance: u.openingBalance, openingDate: iso(u.openingDate) },
    transactions: out,
  });
}));

router.post('/restore', wrap(async (req, res) => {
  const d = req.body?.data;
  if (!d || d.app !== 'company-daily-expense-manager' || !Array.isArray(d.transactions)) {
    return res.status(400).json({ message: 'This is not a valid backup file from this application' });
  }
  const docs = [], errs = [];
  d.transactions.forEach((t, i) => {
    const { errors, data } = parseTxn(t);
    if (errors.length) errs.push(`Row ${i + 1}: ${errors.join(', ')}`);
    else docs.push({ ...data, txnId: t.txnId, _src: t });
  });
  if (errs.length) return res.status(400).json({ message: `Backup has invalid rows. ${errs.slice(0, 3).join(' | ')}`, errors: errs });

  let seq = docs.reduce((m, x) => Math.max(m, parseInt(String(x.txnId || '').replace(/\D/g, ''), 10) || 0), 0);
  const seen = new Set();
  const newFiles = [];
  const inserts = docs.map(({ _src, ...x }) => {
    if (!x.txnId || seen.has(x.txnId)) x.txnId = `TXN-${String(++seq).padStart(5, '0')}`;
    seen.add(x.txnId);
    if (_src.billData && OK[_src.billMime]) {
      const f = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${OK[_src.billMime]}`;
      fs.mkdirSync(uploadDir(), { recursive: true });
      fs.writeFileSync(path.join(uploadDir(), f), Buffer.from(_src.billData, 'base64'));
      newFiles.push(f);
      Object.assign(x, { billFile: f, billName: String(_src.billName || 'bill').slice(0, 120), billMime: _src.billMime });
    }
    return { ...x, owner: req.user._id };
  });

  const old = await Transaction.find({ owner: req.user._id }).select('billFile').lean();
  try {
    await Transaction.deleteMany({ owner: req.user._id });
    if (inserts.length) await Transaction.insertMany(inserts);
  } catch (e) { newFiles.forEach(removeFile); throw e; }
  old.forEach((o) => removeFile(o.billFile));

  const s = d.settings || {};
  const upd = { txnSeq: seq };
  if (s.companyName) upd.companyName = String(s.companyName).slice(0, 100);
  if (Number.isFinite(Number(s.openingBalance)) && Number(s.openingBalance) >= 0) upd.openingBalance = Number(s.openingBalance);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s.openingDate || '')) upd.openingDate = new Date(s.openingDate + 'T00:00:00.000Z');
  await User.findByIdAndUpdate(req.user._id, upd);
  res.json({ ok: true, restored: inserts.length });
}));

module.exports = router;
