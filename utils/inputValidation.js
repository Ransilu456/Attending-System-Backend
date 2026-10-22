const EMOJI_PATTERN = /\p{Extended_Pictographic}/u;
const KEYCAP_PATTERN = /\u20E3/u;
const EXECUTABLE_MARKUP_PATTERN =
  /<\s*\/?\s*[a-z][^>]*>|javascript\s*:|data\s*:\s*text\/html/iu;
const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const MONGO_OPERATOR_KEY = /^\$/u;
const MAX_NESTING_DEPTH = 20;

const containsEmoji = (value) =>
  EMOJI_PATTERN.test(value) ||
  KEYCAP_PATTERN.test(value) ||
  Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff;
  });

const containsControlCharacter = (value) =>
  Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint <= 0x0008 ||
      (codePoint >= 0x000b && codePoint <= 0x000c) ||
      (codePoint >= 0x000e && codePoint <= 0x001f) ||
      (codePoint >= 0x007f && codePoint <= 0x009f) ||
      (codePoint >= 0x200b && codePoint <= 0x200f) ||
      (codePoint >= 0x202a && codePoint <= 0x202e) ||
      (codePoint >= 0x2066 && codePoint <= 0x2069) ||
      codePoint === 0xfeff;
  });

export const isSafeUserText = (value) =>
  typeof value === 'string' &&
  !containsEmoji(value) &&
  !containsControlCharacter(value) &&
  !EXECUTABLE_MARKUP_PATTERN.test(value);

const validateNode = (value, path, errors, depth) => {
  if (depth > MAX_NESTING_DEPTH) {
    errors.push({ field: path, reason: 'maximum nesting depth exceeded' });
    return;
  }
  if (typeof value === 'string') {
    if (containsEmoji(value)) errors.push({ field: path, reason: 'emoji is not allowed' });
    if (containsControlCharacter(value)) {
      errors.push({ field: path, reason: 'control characters are not allowed' });
    }
    if (EXECUTABLE_MARKUP_PATTERN.test(value)) {
      errors.push({ field: path, reason: 'executable markup is not allowed' });
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => validateNode(entry, `${path}[${index}]`, errors, depth + 1));
    return;
  }
  if (!value || typeof value !== 'object') return;

  for (const [key, entry] of Object.entries(value)) {
    if (UNSAFE_OBJECT_KEYS.has(key) || MONGO_OPERATOR_KEY.test(key) || key.includes('.')) {
      errors.push({ field: path, reason: 'unsafe object key is not allowed' });
      continue;
    }
    validateNode(entry, path ? `${path}.${key}` : key, errors, depth + 1);
  }
};

export const validateInputPayload = (payload, root = 'body') => {
  const errors = [];
  validateNode(payload, root, errors, 0);
  return errors;
};
