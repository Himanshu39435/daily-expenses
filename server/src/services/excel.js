const ExcelJS = require('exceljs');
const { CATEGORIES } = require('../utils/constants');
const { r2, buildLedger, iso } = require('../utils/calc');

const NAVY = 'FF1F3A5F', GREY = 'FFF1F5F9', GREEN = 'FF15803D', RED = 'FFB91C1C';
const INR = '"₹"#,##0.00;[Red]-"₹"#,##0.00';
const DATE = 'DD-MM-YYYY';
const L = "'Daily Transactions'";
const thin = { style: 'thin', color: { argb: 'FFCBD5E1' } };
const border = { top: thin, left: thin, bottom: thin, right: thin };
const D = (s) => new Date(s + 'T00:00:00.000Z'); // UTC midnight => exact calendar date in Excel
const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

function head(ws, row = 1) {
  const r = ws.getRow(row);
  r.height = 28;
  r.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    c.fill = fill(NAVY);
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    c.border = border;
  });
}
const redGreen = (ws, ref) => ws.addConditionalFormatting({
  ref,
  rules: [
    { type: 'cellIs', operator: 'lessThan', formulae: [0], style: { font: { bold: true, color: { argb: RED } }, fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFEE2E2' } } } },
    { type: 'cellIs', operator: 'greaterThan', formulae: [0], style: { font: { bold: true, color: { argb: GREEN } }, fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFDCFCE7' } } } },
  ],
});
const redIfPositive = (ws, ref) => ws.addConditionalFormatting({
  ref,
  rules: [{ type: 'cellIs', operator: 'greaterThan', formulae: [0], style: { font: { bold: true, color: { argb: RED } }, fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFEE2E2' } } } }],
});

/** Splits the ledger for an optional [from, to] range and works out the brought-forward figures. */
function prepare(user, txns, from, to) {
  const all = buildLedger(user.openingBalance, txns);
  let carried = { balance: r2(user.openingBalance), personal: 0, reimbursed: 0 };
  let label = 'Opening Balance', bfDate = iso(user.openingDate), rows = all;
  if (from) {
    const before = all.filter((r) => r.date < from);
    if (before.length) {
      const l = before[before.length - 1];
      carried = { balance: l.balance, personal: l.personalRunning, reimbursed: l.reimbursedRunning };
    }
    label = 'Balance Brought Forward';
    bfDate = from;
    rows = rows.filter((r) => r.date >= from);
  }
  if (to) rows = rows.filter((r) => r.date <= to);
  return { carried, label, bfDate, rows, from, to };
}

async function buildWorkbook({ company, userName, carried, label, bfDate, rows, from, to }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Company Daily Expense Manager';
  wb.created = new Date();
  wb.calcProperties = { fullCalcOnLoad: true }; // Excel recalculates every formula on open

  const sum = wb.addWorksheet('Expense Summary', { views: [{ showGridLines: false }] });
  const led = wb.addWorksheet('Daily Transactions', { views: [{ state: 'frozen', ySplit: 1 }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  const cat = wb.addWorksheet('Category Report', { views: [{ state: 'frozen', ySplit: 1 }] });
  const mon = wb.addWorksheet('Monthly Report', { views: [{ state: 'frozen', ySplit: 1 }] });

  /* ---------------- Sheet 2: Daily Transactions ---------------- */
  // SPARE empty rows already contain the formulas, so anyone can type a new entry
  // (date, item, amount) in the next empty row and every balance/total/report updates by itself.
  const SPARE = 300;
  const SRC = { company: 'Company Money', personal: 'Personal Pocket', split: 'Split' };
  led.columns = [13, 36, 18, 24, 17, 17, 17, 21, 21, 32, 20, 14, 13, 17, 12].map((width) => ({ width }));
  led.addRow(['Date', 'Description', 'Category', 'Paid To', 'Money Received', 'Company Expense', 'Personal Expense', 'Running Company Balance', 'Running Personal Expense', 'Notes', 'Reimbursement Received', 'Transaction ID', 'Payment Mode', 'Paid From', 'Bill Attached']);
  head(led);
  led.addRow([D(bfDate), label, from ? 'Brought Forward' : 'Opening Balance', '-', carried.balance, null, null,
    { formula: 'E2-F2', result: carried.balance }, carried.personal, from ? 'Closing position before the selected period' : '', carried.reimbursed, null, null, null, null]);

  const list = [...rows, ...Array(SPARE).fill(null)];
  let bal = carried.balance, per = carried.personal, recv = 0, comp = 0, pers = 0;
  list.forEach((r, i) => {
    const n = 3 + i;
    if (r) {
      bal = r2(bal + r.received - r.companyExpense); per = r2(per + r.personalExpense);
      recv += r.received; comp += r.companyExpense; pers += r.personalExpense;
    }
    const ex = r && r.type === 'expense';
    led.addRow([
      r ? D(r.date) : null, r ? r.description : null, r ? r.category : null, r ? r.party : null,
      r && r.received ? r.received : null, r && r.companyExpense ? r.companyExpense : null, r && r.personalExpense ? r.personalExpense : null,
      { formula: `H${n - 1}+E${n}-F${n}`, result: bal },     // Running Company Balance = previous + received - company expense
      { formula: `I${n - 1}+G${n}`, result: per },           // Running Personal Expense = previous + personal expense
      r ? r.notes || null : null, r && r.reimbursed ? r.reimbursed : null,
      r ? r.txnId : null, r ? r.paymentMode : null, ex ? SRC[r.paymentSource] : null, ex ? (r.hasBill ? 'Yes' : 'No') : null,
    ]);
  });
  const end = 2 + list.length;
  recv = r2(recv); comp = r2(comp); pers = r2(pers);
  const totRecv = r2(carried.balance + recv), finalBal = r2(totRecv - comp);

  const CATLIST = `"${[...CATEGORIES, 'Money Received', 'Reimbursement'].join(',')}"`;
  for (let r = 2; r <= end; r++) {
    const row = led.getRow(r);
    row.eachCell({ includeEmpty: true }, (c, col) => {
      if (col > 15) return;
      c.border = border;
      c.alignment = { vertical: 'middle', wrapText: col === 2 || col === 10, horizontal: col === 1 || col >= 12 ? 'center' : undefined };
      if (col === 1) c.numFmt = DATE;
      if ([5, 6, 7, 8, 9, 11].includes(col)) c.numFmt = INR;
      if (r > 2 && col === 5 && c.value) c.font = { color: { argb: GREEN }, bold: true };
      if (r > 2 && (col === 6 || col === 7) && c.value) c.font = { color: { argb: RED } };
      if (r === 2) { c.fill = fill(GREY); c.font = { italic: true, bold: [2, 5].includes(col) }; }
      if (r > 2) {
        if (col === 3) c.dataValidation = { type: 'list', allowBlank: true, formulae: [CATLIST] };
        if (col === 13) c.dataValidation = { type: 'list', allowBlank: true, formulae: ['"Cash,Bank,UPI"'] };
        if (col === 14) c.dataValidation = { type: 'list', allowBlank: true, formulae: ['"Company Money,Personal Pocket,Split"'] };
        if (col === 15) c.dataValidation = { type: 'list', allowBlank: true, formulae: ['"Yes,No"'] };
      }
    });
  }
  led.autoFilter = { from: 'A1', to: `O${end}` };
  // Empty rows keep carrying the balance forward but stay visually blank until something is typed in them.
  const hide = { type: 'expression', priority: 1, stopIfTrue: true, formulae: ['COUNT($E3:$G3,$K3)=0'], style: { font: { color: { argb: 'FFFFFFFF' } } } };
  const live = (op) => ({ type: 'expression', formulae: [`AND(COUNT($E3:$G3,$K3)>0,H3${op}0)`], style: { font: { bold: true, color: { argb: op === '<' ? RED : GREEN } }, fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: op === '<' ? 'FFFEE2E2' : 'FFDCFCE7' } } } });
  redGreen(led, 'H2');
  led.addConditionalFormatting({ ref: `H3:H${end}`, rules: [hide, live('<'), live('>')] });
  led.addConditionalFormatting({ ref: `I3:I${end}`, rules: [hide] });

  const t0 = end + 2;
  const totals = [
    ['Total Money Received', `SUM(E2:E${end})`, totRecv],
    ['Total Company Expenses', `SUM(F3:F${end})`, comp],
    ['Total Personal Expenses', `SUM(G3:G${end})`, pers],
    ['Final Company Balance', `E${t0}-E${t0 + 1}`, finalBal],
  ];
  totals.forEach(([lab, f, v], i) => {
    const r = t0 + i;
    led.mergeCells(`A${r}:D${r}`);
    const a = led.getCell(`A${r}`), e = led.getCell(`E${r}`);
    a.value = lab; a.font = { bold: true, color: { argb: 'FFFFFFFF' } }; a.fill = fill(NAVY); a.alignment = { horizontal: 'right' };
    e.value = { formula: f, result: v }; e.numFmt = INR; e.font = { bold: true }; e.border = border; e.fill = fill(GREY);
  });
  redGreen(led, `E${t0 + 3}`);

  /* ---------------- Sheet 3: Category Report ---------------- */
  const rng = (c) => `${L}!$${c}$3:$${c}$${end}`;
  cat.columns = [26, 22, 22, 20, 20, 14].map((width) => ({ width }));
  cat.addRow(['Category Name', 'Number of Transactions', 'Total Amount Spent', 'Paid from Company', 'Paid from Personal', '% of Spend']);
  head(cat);
  const catRes = CATEGORIES.map((name) => {
    const m = rows.filter((r) => r.type === 'expense' && r.category === name);
    return { name, n: m.length, co: r2(m.reduce((a, r) => a + r.companyExpense, 0)), pe: r2(m.reduce((a, r) => a + r.personalExpense, 0)) };
  });
  const catTotal = r2(catRes.reduce((a, c) => a + c.co + c.pe, 0));
  const ct = 2 + CATEGORIES.length;
  catRes.forEach((c, i) => {
    const r = 2 + i;
    cat.addRow([c.name,
      { formula: `COUNTIF(${rng('C')},A${r})`, result: c.n },
      { formula: `SUMIF(${rng('C')},A${r},${rng('F')})+SUMIF(${rng('C')},A${r},${rng('G')})`, result: r2(c.co + c.pe) },
      { formula: `SUMIF(${rng('C')},A${r},${rng('F')})`, result: c.co },
      { formula: `SUMIF(${rng('C')},A${r},${rng('G')})`, result: c.pe },
      { formula: `IF($C$${ct}=0,0,C${r}/$C$${ct})`, result: catTotal ? (c.co + c.pe) / catTotal : 0 }]);
  });
  cat.addRow(['Total',
    { formula: `SUM(B2:B${ct - 1})`, result: catRes.reduce((a, c) => a + c.n, 0) },
    { formula: `SUM(C2:C${ct - 1})`, result: catTotal },
    { formula: `SUM(D2:D${ct - 1})`, result: r2(catRes.reduce((a, c) => a + c.co, 0)) },
    { formula: `SUM(E2:E${ct - 1})`, result: r2(catRes.reduce((a, c) => a + c.pe, 0)) },
    { formula: `SUM(F2:F${ct - 1})`, result: catTotal ? 1 : 0 }]);
  for (let r = 2; r <= ct; r++) cat.getRow(r).eachCell((c, col) => {
    c.border = border;
    if (col >= 3 && col <= 5) c.numFmt = INR;
    if (col === 6) c.numFmt = '0.0%';
    if (col === 2) c.alignment = { horizontal: 'center' };
    if (r === ct) { c.font = { bold: true }; c.fill = fill(GREY); }
  });
  cat.autoFilter = { from: 'A1', to: `F${ct - 1}` };

  /* ---------------- Sheet 4: Monthly Report ---------------- */
  mon.columns = [16, 20, 20, 20, 20].map((width) => ({ width }));
  mon.addRow(['Month', 'Money Received', 'Company Expenses', 'Personal Expenses', 'Closing Balance']);
  head(mon);
  const keys = [...new Set([bfDate.slice(0, 7), ...rows.map((r) => r.date.slice(0, 7))])].sort();
  const shift = (k, n) => { const t = +k.slice(0, 4) * 12 + (+k.slice(5, 7) - 1) + n; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; };
  const months = [];
  for (let k = keys[0]; k <= shift(keys[keys.length - 1], 11); k = shift(k, 1)) months.push(k); // + 12 spare months with formulas
  let close = carried.balance;
  months.forEach((k, i) => {
    const r = 2 + i, mr = rows.filter((x) => x.date.slice(0, 7) === k);
    const re = r2(mr.reduce((a, x) => a + x.received, 0)), co = r2(mr.reduce((a, x) => a + x.companyExpense, 0)), pe = r2(mr.reduce((a, x) => a + x.personalExpense, 0));
    close = r2(close + re - co);
    const crit = (c) => `SUMIFS(${rng(c)},${rng('A')},">="&A${r},${rng('A')},"<"&EDATE(A${r},1))`;
    mon.addRow([D(k + '-01'), { formula: crit('E'), result: re }, { formula: crit('F'), result: co }, { formula: crit('G'), result: pe },
      { formula: i === 0 ? `${L}!$E$2+B${r}-C${r}` : `E${r - 1}+B${r}-C${r}`, result: close }]);
  });
  const mt = 2 + months.length;
  mon.addRow(['Total', { formula: `SUM(B2:B${mt - 1})`, result: recv }, { formula: `SUM(C2:C${mt - 1})`, result: comp },
    { formula: `SUM(D2:D${mt - 1})`, result: pers }, { formula: `E${mt - 1}`, result: close }]);
  for (let r = 2; r <= mt; r++) mon.getRow(r).eachCell((c, col) => {
    c.border = border;
    if (col === 1) { c.numFmt = 'MMM YYYY'; c.alignment = { horizontal: 'center' }; } else c.numFmt = INR;
    if (r === mt) { c.font = { bold: true }; c.fill = fill(GREY); }
  });
  mon.autoFilter = { from: 'A1', to: `E${mt - 1}` };
  redGreen(mon, `E2:E${mt}`);

  /* ---------------- Sheet 1: Expense Summary ---------------- */
  sum.columns = [40, 24, 62].map((width) => ({ width }));
  sum.mergeCells('A1:C1');
  Object.assign(sum.getCell('A1'), { value: `${company || 'Company'} - Daily Expense Summary` });
  sum.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
  sum.getCell('A1').fill = fill(NAVY);
  sum.getCell('A1').alignment = { vertical: 'middle', indent: 1 };
  sum.getRow(1).height = 34;
  sum.getCell('A2').value = `Period: ${from ? from.split('-').reverse().join('-') : 'Beginning'} to ${to ? to.split('-').reverse().join('-') : 'Today'}`;
  sum.getCell('A3').value = `Prepared for: ${userName || ''}   |   Generated: ${new Date().toISOString().slice(0, 10).split('-').reverse().join('-')}`;
  sum.getCell('A2').font = { bold: true }; sum.getCell('A3').font = { color: { argb: 'FF64748B' } };
  sum.addRow([]); sum.addRow([]);
  sum.addRow(['Particulars', 'Amount', 'How it is calculated']);
  head(sum, 6);
  const tcm = r2(carried.balance + recv);
  const items = [
    [from ? 'Opening Balance (Brought Forward)' : 'Opening Balance', `${L}!E2`, carried.balance, 'Balance at the start of the period'],
    ['Total Money Received', `SUM(${L}!E3:E${end})`, recv, 'Additional money received from the company'],
    ['Total Company Money', 'B7+B8', tcm, 'Opening Balance + Money Received'],
    ['Total Company Expenses', `SUM(${L}!F3:F${end})`, comp, 'Expenses paid from company money'],
    ['Total Personal Expenses', `SUM(${L}!G3:G${end})`, pers, 'Expenses paid from personal pocket'],
    ['Total Expenses', 'B10+B11', r2(comp + pers), 'Company Expenses + Personal Expenses'],
    ['Remaining Company Balance', 'B9-B10', finalBal, 'Total Company Money - Company Expenses'],
    ['Total Personal Money Used', `${L}!I${end}`, per, 'Running personal expense total (incl. brought forward)'],
    ['Reimbursement Received', `SUM(${L}!K2:K${end})`, r2(carried.reimbursed + rows.reduce((a, r) => a + r.reimbursed, 0)), 'Personal money already paid back by the company'],
    ['Reimbursement Amount (Pending)', 'MAX(0,B14-B15)', Math.max(0, r2(per - (carried.reimbursed + rows.reduce((a, r) => a + r.reimbursed, 0)))), 'Personal Money Used - Reimbursement Received'],
  ];
  items.forEach(([lab, f, v, note]) => sum.addRow([lab, { formula: f, result: v }, note]));
  for (let r = 7; r <= 16; r++) sum.getRow(r).eachCell((c, col) => {
    c.border = border; c.alignment = { vertical: 'middle', horizontal: col === 2 ? 'right' : undefined };
    if (col === 2) { c.numFmt = INR; c.font = { bold: true }; }
    if (col === 3) c.font = { italic: true, color: { argb: 'FF64748B' } };
    if ([9, 13, 16].includes(r) && col < 3) c.fill = fill(GREY);
  });
  sum.getRow(13).font = { bold: true };
  redGreen(sum, 'B13');
  redIfPositive(sum, 'B14'); redIfPositive(sum, 'B16');
  sum.addRow([]);
  const notes = [
    'HOW TO ADD A NEW ENTRY IN EXCEL (no formulas needed)',
    `1. Open the "Daily Transactions" sheet and go to the first empty row (after the last entry). ${SPARE} rows are ready.`,
    '2. Type Date, Description (e.g. Milk), Category, Paid To. Put the amount in Money Received, Company Expense or Personal Expense.',
    '3. Running balances, totals, this Summary, the Category Report and the Monthly Report all recalculate instantly.',
    'Tip: use the filter arrows on the Date column to see everything bought on one date.',
  ];
  notes.forEach((t, i) => { const r = sum.addRow([t]); sum.mergeCells(`A${r.number}:C${r.number}`); r.getCell(1).font = { bold: i === 0, size: i === 0 ? 11 : 10, color: { argb: i === 0 ? NAVY : 'FF475569' } }; });

  return wb;
}

module.exports = { prepare, buildWorkbook };
