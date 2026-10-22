import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeStudentProfileUpdates,
  STUDENT_PROFILE_EDIT_FIELDS,
} from '../utils/studentProfileEdits.js';

test('offline profile edit whitelist matches the student self-service fields', () => {
  assert.deepEqual(STUDENT_PROFILE_EDIT_FIELDS, [
    'name',
    'student_email',
    'address',
    'parent_email',
    'parent_telephone',
    'dateOfBirth',
    'profileImage',
  ]);
});

test('normalizes valid profile edits before saving them to MongoDB', () => {
  const result = normalizeStudentProfileUpdates({
    name: '  Ada Student ',
    student_email: ' ADA@example.com ',
    address: ' 10 Main Street ',
    parent_email: ' PARENT@example.com ',
    parent_telephone: '+1 234 567 8901',
    dateOfBirth: '2008-04-05',
    profileImage: null,
  });

  assert.equal(result.error, undefined);
  assert.equal(result.updates.name, 'Ada Student');
  assert.equal(result.updates.student_email, 'ada@example.com');
  assert.equal(result.updates.address, '10 Main Street');
  assert.equal(result.updates.parent_email, 'parent@example.com');
  assert.equal(result.updates.parent_telephone, '+12345678901');
  assert.ok(result.updates.dateOfBirth instanceof Date);
  assert.equal(result.updates.profileImage, null);
});

test('rejects attempts to modify identity, status, attendance, or unknown fields', () => {
  for (const updates of [
    { status: 'suspended' },
    { indexNumber: 'OTHER-STUDENT' },
    { attendanceHistory: [] },
    { unknown: true },
    {},
  ]) {
    assert.match(normalizeStudentProfileUpdates(updates).error, /unsupported fields|object/i);
  }
});

test('rejects malformed emails, addresses, phone numbers, and future birth dates', () => {
  assert.match(normalizeStudentProfileUpdates({ student_email: 'bad-email' }).error, /email/i);
  assert.match(normalizeStudentProfileUpdates({ address: 'abc' }).error, /address/i);
  assert.match(normalizeStudentProfileUpdates({ parent_telephone: '123' }).error, /telephone/i);
  assert.match(normalizeStudentProfileUpdates({ dateOfBirth: new Date(Date.now() + 60_000) }).error, /past/i);
});
