import crypto from 'crypto';

const SECRET = process.env.ID_MASK_SECRET || process.env.JWT_SECRET || 'fallback-mask-secret-32chars!!';

// Deterministically encrypt a MongoDB ObjectId into a safe opaque token
export function maskId(id) {
  if (!id) return null;
  const str = id.toString();
  const key = crypto.createHash('sha256').update(SECRET).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(str, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64url');
}

// Decrypt a masked token back into the original MongoDB ObjectId string
export function unmaskId(masked) {
  if (!masked) return null;
  try {
    const buf = Buffer.from(masked, 'base64url');
    if (buf.length < 28) return null;
    const iv = buf.slice(0, 12);
    const tag = buf.slice(12, 28);
    const encrypted = buf.slice(28);
    const key = crypto.createHash('sha256').update(SECRET).digest();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(encrypted) + decipher.final('utf8');
  } catch {
    return null;
  }
}

// Resolve an ID that might be raw 24-hex ObjectId or a masked token
export function resolveId(idOrMasked) {
  if (!idOrMasked) return null;
  const str = idOrMasked.toString().trim();
  if (/^[a-fA-F0-9]{24}$/.test(str)) {
    return str;
  }
  const unmasked = unmaskId(str);
  if (unmasked && /^[a-fA-F0-9]{24}$/.test(unmasked)) {
    return unmasked;
  }
  return null;
}
