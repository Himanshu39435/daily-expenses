const mongoose = require('mongoose');
const schema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    passwordResetTokenHash: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },
    authVersion: { type: Number, default: 0 },
    role: { type: String, enum: ['admin', 'employee'], default: 'employee' },
    isPrimaryAdmin: { type: Boolean, default: false },
    isCompanyAdmin: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    companyName: { type: String, default: 'My Company', trim: true },
    openingBalance: { type: Number, default: 0 },
    openingDate: { type: Date, default: () => new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z') },
    txnSeq: { type: Number, default: 0 },
  },
  { timestamps: true }
);
schema.index({ isPrimaryAdmin: 1 }, { unique: true, partialFilterExpression: { isPrimaryAdmin: true } });
schema.index({ passwordResetTokenHash: 1 }, { sparse: true });
module.exports = mongoose.model('User', schema);
