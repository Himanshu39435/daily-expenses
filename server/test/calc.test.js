const test = require('node:test');
const assert = require('node:assert');
const ExcelJS = require('exceljs');
const { buildLedger, summarize, groupRows } = require('../src/utils/calc');
const { parseTxn } = require('../src/utils/validate');
const { prepare, buildWorkbook } = require('../src/services/excel');

const d = (s) => new Date(s + 'T00:00:00.000Z');
let n = 0;
const exp = (date, description, category, amount, src = 'company', pp = 0) => {
  const { errors, data } = parseTxn({ type: 'expense', date, description, category, party: 'Shop', amount, paymentSource: src, personalPaid: pp });
  assert.deepStrictEqual(errors, []);
  return { ...data, _id: 'e' + n, txnId: 'TXN-' + String(++n).padStart(5, '0') };
};
const user = { openingBalance: 50000, openingDate: d('2026-11-19') };

const example = () => [
  exp('2026-11-19', 'Transport', 'Transport', 500),
  exp('2026-11-19', 'Material Purchase', 'Material', 5000),
  exp('2026-11-20', 'Labour Payment', 'Labour Payment', 10000),
  exp('2026-11-20', 'Courier', 'Courier', 500),
];

test('spec example: 50,000 - 16,000 = 34,000 remaining', () => {
  const s = summarize(50000, example(), d('2026-11-25'));
  assert.strictEqual(s.companyBalance, 34000);
  assert.strictEqual(s.totalExpenses, 16000);
  assert.strictEqual(s.personalExpenses, 0);
  assert.strictEqual(s.currentMonthExpenses, 16000);
});

test('spec example: company 50,000, expenses 55,000 -> balance 0, personal 5,000, reimburse 5,000', () => {
  const list = [exp('2026-11-19', 'Big purchase', 'Purchase', 50000), exp('2026-11-20', 'Extra from pocket', 'Other', 5000, 'personal')];
  const s = summarize(50000, list);
  assert.deepStrictEqual([s.totalCompanyMoney, s.totalExpenses, s.companyBalance, s.personalExpenses, s.pendingReimbursement], [50000, 55000, 0, 5000, 5000]);
});

test('expenses above company money are NOT auto-labelled personal; payment source decides', () => {
  const s = summarize(50000, [exp('2026-11-19', 'Everything on company money', 'Purchase', 55000, 'company')]);
  assert.strictEqual(s.companyBalance, -5000); assert.strictEqual(s.personalExpenses, 0); assert.strictEqual(s.overdrawn, true);
});

test('split payment, additional funds and reimbursement', () => {
  const list = [
    exp('2026-11-19', 'Split', 'Hotel', 8000, 'split', 3000),
    { ...parseTxn({ type: 'received', date: '2026-11-21', amount: 20000, party: 'Company' }).data, _id: 'r1', txnId: 'TXN-90001' },
    { ...parseTxn({ type: 'reimbursement', date: '2026-11-22', amount: 1000 }).data, _id: 'r2', txnId: 'TXN-90002' },
  ];
  const s = summarize(50000, list);
  assert.strictEqual(s.companyBalance, 50000 + 20000 - 5000);
  assert.strictEqual(s.personalExpenses, 3000);
  assert.strictEqual(s.pendingReimbursement, 2000);
});

test('running ledger balances', () => {
  const rows = buildLedger(50000, example());
  assert.deepStrictEqual(rows.map((r) => r.balance), [49500, 44500, 34500, 34000]);
});

test('validation rejects bad input', () => {
  assert.ok(parseTxn({ type: 'expense', date: 'x', amount: -1 }).errors.length >= 4);
  assert.ok(parseTxn({ type: 'expense', date: '2026-11-19', description: 'a', category: 'Food', party: 'b', amount: 100, paymentSource: 'split', personalPaid: 100 }).errors.length);
});

test('empty data does not break summary or grouping', () => {
  const s = summarize(0, []); assert.strictEqual(s.companyBalance, 0);
  assert.deepStrictEqual(groupRows([], 'month'), []);
});

async function roundTrip(wb) {
  const buf = await wb.xlsx.writeBuffer();
  const w2 = new ExcelJS.Workbook(); await w2.xlsx.load(buf); return w2;
}

test('Excel: 4 sheets, formulas present, correct row references', async () => {
  const rows = example();
  const wb = await buildWorkbook({ ...prepare(user, rows, '', ''), company: 'ACME', userName: 'Tester' });
  const w = await roundTrip(wb);
  assert.deepStrictEqual(w.worksheets.map((s) => s.name), ['Expense Summary', 'Daily Transactions', 'Category Report', 'Monthly Report']);
  const led = w.getWorksheet('Daily Transactions');
  assert.strictEqual(led.getCell('H3').formula, 'H2+E3-F3');
  assert.strictEqual(led.getCell('H6').formula, 'H5+E6-F6');
  // spare rows below the data already hold formulas, and full detail columns are written
  assert.strictEqual(led.getCell('H100').formula, 'H99+E100-F100');
  assert.strictEqual(led.getCell('H306').formula, 'H305+E306-F306');
  assert.match(led.getCell('L3').value, /^TXN-\d{5}$/);
  assert.strictEqual(led.getCell('N3').value, 'Company Money');
  assert.strictEqual(led.getCell('M3').value, 'Cash');
  assert.strictEqual(led.getCell('I4').formula, 'I3+G4');
  assert.strictEqual(led.getCell('H6').result, 34000);
  assert.strictEqual(led.getCell('E308').formula, 'SUM(E2:E306)');
  assert.strictEqual(led.getCell('E311').formula, 'E308-E309');
  assert.match(w.getWorksheet('Category Report').getCell('B2').formula, /^COUNTIF\('Daily Transactions'!\$C\$3:\$C\$306,A2\)$/);
  assert.match(w.getWorksheet('Category Report').getCell('D2').formula, /^SUMIF/);
  assert.match(w.getWorksheet('Monthly Report').getCell('B2').formula, /^SUMIFS/);
  assert.strictEqual(w.getWorksheet('Expense Summary').getCell('B13').formula, 'B9-B10');
  const zip = await require('jszip').loadAsync(await wb.xlsx.writeBuffer());
  assert.match(await zip.file('xl/workbook.xml').async('string'), /fullCalcOnLoad="1"/);
});

test('Excel: empty data and date-range export (brought forward) are valid', async () => {
  const w0 = await roundTrip(await buildWorkbook({ ...prepare(user, [], '', ''), company: 'ACME' }));
  assert.strictEqual(w0.getWorksheet('Daily Transactions').getCell('H3').formula, 'H2+E3-F3');
  const rows = example();
  const p = prepare(user, rows, '2026-11-20', '2026-11-20');
  assert.strictEqual(p.carried.balance, 44500);
  const w1 = await roundTrip(await buildWorkbook({ ...p, company: 'ACME' }));
  assert.strictEqual(w1.getWorksheet('Daily Transactions').getCell('H4').result, 34000);
});
