const mongoose = require('mongoose');
const schema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['admin', 'employee'], default: 'employee' },
    isPrimaryAdmin: { type: Boolean, default: false },
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    companyName: { type: String, default: 'My Company', trim: true },
    openingBalance: { type: Number, default: 0 },
    openingDate: { type: Date, default: () => new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z') },
    txnSeq: { type: Number, default: 0 },
  },
  { timestamps: true }
);
schema.index({ isPrimaryAdmin: 1 }, { unique: true, partialFilterExpression: { isPrimaryAdmin: true } });
module.exports = mongoose.model('User', schema);
