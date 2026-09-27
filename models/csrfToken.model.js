import mongoose from 'mongoose';

const csrfTokenSchema = new mongoose.Schema({
  token: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  sessionId: {
    type: String,
    required: true,
    index: true
  },
  expiresAt: {
    type: Date,
    required: true,
    default: () => new Date(Date.now() + 2 * 60 * 60 * 1000)
  }
}, { timestamps: { createdAt: true, updatedAt: false } });

csrfTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const CsrfToken = mongoose.model('CsrfToken', csrfTokenSchema);

export default CsrfToken;
