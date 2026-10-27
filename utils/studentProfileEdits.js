import { isSafeUserText } from './inputValidation.js';

export const STUDENT_PROFILE_EDIT_FIELDS = Object.freeze([
  'name',
  'student_email',
  'address',
  'parent_email',
  'parent_telephone',
  'dateOfBirth',
  'profileImage',
]);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_PATTERN = /^[\p{L}\p{M}\s'.,-]+$/u;
const PHONE_PATTERN = /^\+?\d{10,15}$/;

const timestampValue = (value) => {
  const date = value instanceof Date
    ? value
    : value && typeof value.toDate === 'function'
      ? value.toDate()
      : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
};

export const isProfileEditVersionCurrent = (baseUpdatedAt, currentUpdatedAt) => {
  const baseVersion = timestampValue(baseUpdatedAt);
  return baseVersion !== null && timestampValue(currentUpdatedAt) === baseVersion;
};

export const normalizeStudentProfileUpdates = (input) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { error: 'Profile changes must be an object.' };
  }

  const keys = Object.keys(input);
  if (!keys.length || keys.some((key) => !STUDENT_PROFILE_EDIT_FIELDS.includes(key))) {
    return { error: 'Profile changes contain unsupported fields.' };
  }

  const updates = {};
  for (const [field, value] of Object.entries(input)) {
    if (field === 'dateOfBirth') {
      if (value === null) {
        updates[field] = null;
        continue;
      }
      const date = value instanceof Date
        ? value
        : value && typeof value.toDate === 'function'
          ? value.toDate()
          : new Date(value);
      if (Number.isNaN(date.getTime()) || date >= new Date()) {
        return { error: 'Date of birth must be a valid date in the past.' };
      }
      updates[field] = date;
      continue;
    }

    if (field === 'profileImage') {
      if (value === null) {
        updates[field] = null;
        continue;
      }
      if (typeof value !== 'string' || value.length > 2 * 1024 * 1024) {
        return { error: 'Profile image must be a string no larger than 2 MB.' };
      }
      if (!isSafeUserText(value)) {
        return { error: 'Profile image contains unsupported input.' };
      }
      updates[field] = value;
      continue;
    }

    if (typeof value !== 'string') {
      return { error: `${field} must be text.` };
    }
    const normalized = value.trim();
    if (!isSafeUserText(normalized)) {
      return { error: `${field} contains unsupported characters or markup.` };
    }

    if (field === 'name' && (
      normalized.length < 2 ||
      normalized.length > 50 ||
      !NAME_PATTERN.test(normalized)
    )) {
      return { error: 'Name must be 2-50 characters and contain valid name characters.' };
    }
    if (field === 'student_email' && (
      normalized.length > 254 ||
      !EMAIL_PATTERN.test(normalized)
    )) {
      return { error: 'Enter a valid student email address.' };
    }
    if (field === 'parent_email' && (
      normalized.length > 254 ||
      !EMAIL_PATTERN.test(normalized)
    )) {
      return { error: 'Enter a valid parent email address.' };
    }
    if (field === 'address' && (
      normalized.length < 5 ||
      normalized.length > 200
    )) {
      return { error: 'Address must be 5-200 characters.' };
    }
    if (field === 'parent_telephone') {
      const phone = normalized.replace(/[\s-]/g, '');
      if (!PHONE_PATTERN.test(phone) || /^0+$/.test(phone.replace(/\D/g, ''))) {
        return { error: 'Parent telephone must contain 10-15 digits.' };
      }
      updates[field] = phone;
      continue;
    }

    updates[field] = field.endsWith('_email') ? normalized.toLowerCase() : normalized;
  }

  return { updates };
};
