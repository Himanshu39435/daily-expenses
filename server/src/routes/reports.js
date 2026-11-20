const router = require('express').Router();
const Transaction = require('../models/Transaction');
const auth = require('../middleware/auth');
const wrap = require('../middleware/wrap');
const { buildLedger, summarize, groupRows, chartData, r2 } = require('../utils/calc');

router.use(auth);
const load = (u) => Transaction.find({ owner: u._id }).lean();

router.get('/summary', wrap(async (req, res) => {
  res.json(summarize(req.user.openingBalance, await load(req.user)));
}));

router.get('/dashboard', wrap(async (req, res) => {
  const txns = await load(req.user);
  const rows = buildLedger(req.user.openingBalance, txns);
  res.json({
    summary: summarize(req.user.openingBalance, txns),
    charts: chartData(rows, req.user.openingBalance),
    recent: rows.slice(-8).reverse(),
  });
}));

router.get('/report', wrap(async (req, res) => {
  const groupBy = ['day', 'week', 'month', 'category'].includes(req.query.groupBy) ? req.query.groupBy : 'day';
  const { from, to } = req.query;
  let rows = buildLedger(req.user.openingBalance, await load(req.user));
  if (from) rows = rows.filter((r) => r.date >= from);
  if (to) rows = rows.filter((r) => r.date <= to);
  const groups = groupRows(rows, groupBy);
  const sum = (k) => r2(groups.reduce((a, g) => a + g[k], 0));
  res.json({
    groupBy, rows: groups,
    totals: { received: sum('received'), companyExpense: sum('companyExpense'), personalExpense: sum('personalExpense'), total: sum('total'), count: groups.reduce((a, g) => a + g.count, 0) },
  });
}));

module.exports = router;
