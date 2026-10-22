import test from 'node:test';
import assert from 'node:assert/strict';
import { validateInputPayload } from '../utils/inputValidation.js';

test('rejects emoji and executable markup recursively', () => {
  assert.deepEqual(
    validateInputPayload({ profile: { name: 'Student 😀' } }),
    [{ field: 'body.profile.name', reason: 'emoji is not allowed' }]
  );
  assert.equal(validateInputPayload({ name: '<script>alert(1)</script>' })[0].reason,
    'executable markup is not allowed');
  assert.equal(validateInputPayload({ name: 'Flag 🇱🇰' })[0].reason, 'emoji is not allowed');
  assert.equal(validateInputPayload({ name: 'Keycap 1️⃣' })[0].reason, 'emoji is not allowed');
});

test('rejects Mongo operator keys and prototype-pollution keys', () => {
  assert.equal(validateInputPayload({ filter: { $where: 'true' } })[0].reason,
    'unsafe object key is not allowed');
  assert.equal(validateInputPayload(JSON.parse('{"__proto__":{"polluted":true}}')).length, 1);
});

test('accepts ordinary values including database-related words as plain text', () => {
  assert.deepEqual(
    validateInputPayload({ name: 'Select a new address', address: 'Drop Street' }),
    []
  );
});

test('rejects deeply nested request structures', () => {
  let payload = 'value';
  for (let index = 0; index < 22; index += 1) payload = { nested: payload };
  assert.equal(validateInputPayload(payload).at(-1).reason, 'maximum nesting depth exceeded');
});
