/**
 * Single source of truth for every financial calculation (dashboard, ledger, reports, Excel).
 *
 *  Total Company Money = Opening Balance + Additional Money Received
 *  Company Balance     = Total Company Money - Company Paid Expenses
 *  Personal Used       = Personal Paid Expenses
 *  Total Expenses      = Company Paid + Personal Paid
 *  Pending Reimbursement = Personal Used - Reimbursements already received
 *
 * Payment source is tracked per transaction (companyPaid / personalPaid) - it is never guessed.
 */
const r2 = (n) => Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
const iso = (d) => new Date(d).toISOString().slice(0, 10);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const norm = (t) => ({
  received: t.type === 'received' ? r2(t.amount) : 0,
  reimbursed: t.type === 'reimbursement' ? r2(t.amount) : 0,
  companyExpense: t.type === 'expense' ? r2(t.companyPaid) : 0,
  personalExpense: t.type === 'expense' ? r2(t.personalPaid) : 0,
});

function sortTxns(list) {
  return [...list].sort(
    (a, b) =>
      iso(a.date).localeCompare(iso(b.date)) ||
      new Date(a.createdAt || 0) - new Date(b.createdAt || 0) ||
      String(a.txnId).localeCompare(String(b.txnId))
  );
}

/** Chronological ledger with running balances. */
function buildLedger(opening, txns) {
  let bal = r2(opening), per = 0, rei = 0;
  return sortTxns(txns).map((t) => {
    const n = norm(t);
    bal = r2(bal + n.received - n.companyExpense);
    per = r2(per + n.personalExpense);
    rei = r2(rei + n.reimbursed);
    return {
      _id: String(t._id), txnId: t.txnId, type: t.type, date: iso(t.date),
      description: t.description, category: t.category, party: t.party,
      paymentMode: t.paymentMode, paymentSource: t.paymentSource, amount: r2(t.amount),
      notes: t.notes || '', hasBill: !!t.billFile, billName: t.billName || '',
      ...n, balance: bal, personalRunning: per, reimbursedRunning: rei,
    };
  });
}

function summarize(opening, txns, now = new Date()) {
  const s = { openingBalance: r2(opening), totalReceived: 0, companyExpenses: 0, personalExpenses: 0, reimbursed: 0, currentMonthExpenses: 0, count: txns.length };
  const month = iso(now).slice(0, 7);
  for (const t of txns) {
    const n = norm(t);
    s.totalReceived += n.received;
    s.companyExpenses += n.companyExpense;
    s.personalExpenses += n.personalExpense;
    s.reimbursed += n.reimbursed;
    if (iso(t.date).slice(0, 7) === month) s.currentMonthExpenses += n.companyExpense + n.personalExpense;
  }
  for (const k of ['totalReceived', 'companyExpenses', 'personalExpenses', 'reimbursed', 'currentMonthExpenses']) s[k] = r2(s[k]);
  s.totalCompanyMoney = r2(s.openingBalance + s.totalReceived);
  s.totalExpenses = r2(s.companyExpenses + s.personalExpenses);
  s.companyBalance = r2(s.totalCompanyMoney - s.companyExpenses);
  s.pendingReimbursement = r2(Math.max(0, s.personalExpenses - s.reimbursed));
  s.overdrawn = s.companyBalance < 0;
  return s;
}

function weekStart(d) {
  const x = new Date(d + 'T00:00:00Z');
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return iso(x);
}

function groupRows(rows, groupBy) {
  const keyOf = { day: (r) => r.date, week: (r) => weekStart(r.date), month: (r) => r.date.slice(0, 7), category: (r) => r.category }[groupBy];
  const map = new Map();
  for (const r of rows) {
    if (groupBy === 'category' && r.type !== 'expense') continue;
    const k = keyOf(r);
    if (!map.has(k)) map.set(k, { key: k, received: 0, companyExpense: 0, personalExpense: 0, reimbursed: 0, count: 0, balance: 0 });
    const g = map.get(k);
    g.received += r.received; g.companyExpense += r.companyExpense; g.personalExpense += r.personalExpense; g.reimbursed += r.reimbursed;
    if (r.type === 'expense') g.count++;
    g.balance = r.balance;
  }
  const out = [...map.values()].map((g) => ({
    ...g, received: r2(g.received), companyExpense: r2(g.companyExpense), personalExpense: r2(g.personalExpense),
    reimbursed: r2(g.reimbursed), total: r2(g.companyExpense + g.personalExpense),
  }));
  return groupBy === 'category' ? out.sort((a, b) => b.total - a.total) : out.sort((a, b) => a.key.localeCompare(b.key));
}

const monthLabel = (k) => `${MON[+k.slice(5, 7) - 1]} ${k.slice(2, 4)}`;

function chartData(rows, opening, now = new Date()) {
  const dayMap = new Map(groupRows(rows, 'day').map((g) => [g.key, g]));
  const daily = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    const key = iso(d), g = dayMap.get(key);
    daily.push({ key, label: `${key.slice(8)} ${MON[d.getUTCMonth()]}`, company: g?.companyExpense || 0, personal: g?.personalExpense || 0, total: g?.total || 0 });
  }
  const monMap = new Map(groupRows(rows, 'month').map((g) => [g.key, g]));
  const monthly = [];
  let p = 0, bal = r2(opening);
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = iso(d).slice(0, 7), g = monMap.get(key);
    while (p < rows.length && rows[p].date.slice(0, 7) <= key) bal = rows[p++].balance;
    monthly.push({ key, label: monthLabel(key), received: g?.received || 0, company: g?.companyExpense || 0, personal: g?.personalExpense || 0, total: g?.total || 0, balance: bal });
  }
  const category = groupRows(rows, 'category').filter((g) => g.total > 0).map((g) => ({ name: g.key, value: g.total }));
  return { daily, monthly, category };
}

module.exports = { r2, iso, norm, sortTxns, buildLedger, summarize, groupRows, chartData, weekStart, monthLabel };
