const mongoose = require('mongoose');
const { CATEGORIES, MODES, SOURCES } = require('../utils/constants');
const schema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    txnId: { type: String, required: true },
    type: { type: String, enum: ['received', 'expense', 'reimbursement'], required: true },
    date: { type: Date, required: true },
    description: { type: String, required: true, maxlength: 200 },
    category: { type: String, required: true, enum: [...CATEGORIES, 'Money Received', 'Reimbursement'] },
    party: { type: String, required: true, maxlength: 100 }, // Paid To (expense) / Received From (money)
    amount: { type: Number, required: true, min: 0.01 },
    paymentMode: { type: String, enum: MODES, default: 'Cash' },
    paymentSource: { type: String, enum: SOURCES },
    companyPaid: { type: Number, default: 0, min: 0 },
    personalPaid: { type: Number, default: 0, min: 0 },
    notes: { type: String, default: '', maxlength: 500 },
    billFile: String, billName: String, billMime: String,
    createdByName: { type: String, default: '' },
    lastEditedByName: { type: String, default: '' },
    lastEditedAt: Date,
    editCount: { type: Number, default: 0 },
    editHistory: [{
      editedByName: String,
      editedAt: Date,
      changes: { type: Object, default: {} },
    }],
  },
  { timestamps: true }
);
schema.index({ owner: 1, date: 1 });
schema.index({ owner: 1, txnId: 1 }, { unique: true });
module.exports = mongoose.model('Transaction', schema);
