import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createStudentSessionToken,
  getStudentSessionCookieName,
  hashStudentSessionToken,
  readStudentSessionToken,
  setStudentSessionCookie,
  STUDENT_SESSION_MAX_AGE_MS,
} from '../utils/studentSession.js';

test('student session tokens are random, opaque values stored as hashes', () => {
  const first = createStudentSessionToken();
  const second = createStudentSessionToken();

  assert.equal(first.length, 43);
  assert.notEqual(first, second);
  assert.notEqual(hashStudentSessionToken(first), first);
  assert.equal(hashStudentSessionToken(first), hashStudentSessionToken(first));
  assert.equal(STUDENT_SESSION_MAX_AGE_MS, 604800000);
});

test('student session cookie name uses the host prefix only in production', () => {
  const originalEnvironment = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  assert.equal(getStudentSessionCookieName(), '__Host-student_session');
  process.env.NODE_ENV = 'development';
  assert.equal(getStudentSessionCookieName(), 'student_session');
  if (originalEnvironment === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalEnvironment;
});

test('student session token is read only from its named cookie', () => {
  const originalEnvironment = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  const token = createStudentSessionToken();
  assert.equal(
    readStudentSessionToken({
      headers: { cookie: `other=value; student_session=${token}; theme=dark` },
    }),
    token,
  );
  assert.equal(readStudentSessionToken({ headers: { cookie: 'student_session_extra=bad' } }), null);
  if (originalEnvironment === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalEnvironment;
});

test('production session cookie is HTTP-only, secure, same-site, host-only, and seven days long', () => {
  const originalEnvironment = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  let cookie;
  setStudentSessionCookie({
    cookie: (name, value, options) => { cookie = { name, value, options }; },
  }, 'opaque');

  assert.equal(cookie.name, '__Host-student_session');
  assert.equal(cookie.value, 'opaque');
  assert.deepEqual(cookie.options, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: STUDENT_SESSION_MAX_AGE_MS,
  });
  assert.equal('domain' in cookie.options, false);

  if (originalEnvironment === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalEnvironment;
});
