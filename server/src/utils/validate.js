const { CATEGORIES, MODES, SOURCES } = require('./constants');
const { r2 } = require('./calc');
const text = (v, max) => String(v ?? '').trim().slice(0, max);

/** Validates + normalises a transaction payload (form-data strings or JSON). */
function parseTxn(b) {
  const errors = [];
  const type = b.type;
  if (!['received', 'expense', 'reimbursement'].includes(type)) return { errors: ['Invalid transaction type'] };
  const date = String(b.date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(new Date(date + 'T00:00:00Z'))) errors.push('A valid date is required');
  const amount = r2(b.amount);
  if (!(amount > 0) || amount > 1e9) errors.push('Amount must be greater than 0');
  const paymentMode = b.paymentMode || 'Cash';
  if (!MODES.includes(paymentMode)) errors.push('Payment mode must be Cash, Bank or UPI');

  const d = {
    type, date: new Date(date + 'T00:00:00.000Z'), amount, paymentMode, notes: text(b.notes, 500),
    description: '', category: '', party: '', paymentSource: undefined, companyPaid: 0, personalPaid: 0,
  };
  if (type === 'expense') {
    d.category = b.category;
    if (!CATEGORIES.includes(d.category)) errors.push('Choose a valid expense category');
    d.description = text(b.description, 200);
    if (!d.description) errors.push('Item / description is required');
    d.party = text(b.party, 100);
    if (!d.party) errors.push('Paid To is required');
    d.paymentSource = b.paymentSource;
    if (!SOURCES.includes(d.paymentSource)) errors.push('Choose whether it was paid from company money or personal pocket');
    else if (d.paymentSource === 'company') d.companyPaid = amount;
    else if (d.paymentSource === 'personal') d.personalPaid = amount;
    else {
      const pp = r2(b.personalPaid);
      if (!(pp > 0 && pp < amount)) errors.push('Personal portion must be more than 0 and less than the amount');
      else { d.personalPaid = pp; d.companyPaid = r2(amount - pp); }
    }
  } else {
    d.category = type === 'received' ? 'Money Received' : 'Reimbursement';
    d.party = text(b.party, 100) || (type === 'reimbursement' ? 'Company' : '');
    if (!d.party) errors.push('Received From is required');
    d.description = text(b.description, 200) || (type === 'received' ? 'Money received' : 'Reimbursement received');
  }
  return { errors, data: d };
}
module.exports = { parseTxn };
