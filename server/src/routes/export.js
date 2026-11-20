const router = require('express').Router();
const Transaction = require('../models/Transaction');
const auth = require('../middleware/auth');
const wrap = require('../middleware/wrap');
const { prepare, buildWorkbook } = require('../services/excel');

router.use(auth);
const okDate = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d : '');

router.get('/excel', wrap(async (req, res) => {
  const from = okDate(req.query.from), to = okDate(req.query.to);
  const txns = await Transaction.find({ owner: req.user._id }).lean();
  const wb = await buildWorkbook({ ...prepare(req.user, txns, from, to), company: req.user.companyName, userName: req.user.name });
  const name = `Expense-Report_${from || 'start'}_to_${to || 'today'}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  await wb.xlsx.write(res);
  res.end();
}));

module.exports = router;
