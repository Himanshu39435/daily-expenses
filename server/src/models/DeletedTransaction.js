const mongoose = require('mongoose');

const deletedTransactionSchema = new mongoose.Schema(
  {
    originalOwner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    deletedByName: { type: String, default: '' },
    txnId: { type: String, required: true },
    type: { type: String, enum: ['received', 'expense', 'reimbursement'], required: true },
    date: { type: Date, required: true },
    description: { type: String, required: true, maxlength: 200 },
    category: { type: String, required: true },
    party: { type: String, required: true, maxlength: 100 },
    amount: { type: Number, required: true, min: 0.01 },
    paymentMode: { type: String, default: 'Cash' },
    paymentSource: String,
    companyPaid: { type: Number, default: 0, min: 0 },
    personalPaid: { type: Number, default: 0, min: 0 },
    notes: { type: String, default: '', maxlength: 500 },
    billFile: String,
    billName: String,
    billMime: String,
    lastEditedByName: { type: String, default: '' },
    lastEditedAt: Date,
    editCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

deletedTransactionSchema.index({ originalOwner: 1, createdAt: -1 });
module.exports = mongoose.model('DeletedTransaction', deletedTransactionSchema);
