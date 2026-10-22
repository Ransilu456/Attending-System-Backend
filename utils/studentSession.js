import { createHash, randomBytes } from 'node:crypto';

export const STUDENT_SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export const getStudentSessionCookieName = () =>
  process.env.NODE_ENV === 'production'
    ? '__Host-student_session'
    : 'student_session';

export const createStudentSessionToken = () =>
  randomBytes(32).toString('base64url');

export const hashStudentSessionToken = (token) =>
  createHash('sha256').update(token).digest('hex');

export const readStudentSessionToken = (req) => {
  const cookieHeader = req.headers.cookie || '';
  const cookiePrefix = `${getStudentSessionCookieName()}=`;
  const cookie = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(cookiePrefix));
  const token = cookie?.slice(cookiePrefix.length);
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
};

export const setStudentSessionCookie = (res, token) => {
  res.cookie(getStudentSessionCookieName(), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: STUDENT_SESSION_MAX_AGE_MS,
  });
};

export const clearStudentSessionCookie = (res) => {
  res.clearCookie(getStudentSessionCookieName(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
};
