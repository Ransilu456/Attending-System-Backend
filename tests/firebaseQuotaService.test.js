import assert from 'node:assert/strict';
import fsPromises from 'node:fs/promises';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

test('Firebase operation limits are concurrency-safe and persist across service reloads', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'firebase-quota-'));
  const usagePath = path.join(directory, 'usage.json');
  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  process.env.FIREBASE_QUOTA_USAGE_PATH = usagePath;
  process.env.FIREBASE_DAILY_READ_LIMIT = '2';
  process.env.FIREBASE_DAILY_WRITE_LIMIT = '1';

  const quota = await import(`../services/firebaseQuotaService.js?test=${randomUUID()}`);
  let readCalls = 0;
  await Promise.all([
    quota.runFirebaseRead(async () => { readCalls += 1; }),
    quota.runFirebaseRead(async () => { readCalls += 1; }),
  ]);
  assert.equal(readCalls, 2);
  await assert.rejects(
    quota.runFirebaseRead(async () => { readCalls += 1; }),
    { code: 'FIREBASE_DAILY_LIMIT', statusCode: 429 },
  );
  assert.equal(readCalls, 2);

  await quota.runFirebaseWrite(async () => {});
  await assert.rejects(
    quota.runFirebaseWrite(async () => {}),
    { code: 'FIREBASE_DAILY_LIMIT', statusCode: 429 },
  );

  const reloadedQuota = await import(`../services/firebaseQuotaService.js?test=${randomUUID()}`);
  await assert.rejects(
    reloadedQuota.runFirebaseRead(async () => {}),
    { code: 'FIREBASE_DAILY_LIMIT', statusCode: 429 },
  );
  assert.deepEqual(await reloadedQuota.getFirebaseQuotaUsage(), {
    date: new Date().toISOString().slice(0, 10),
    reads: 2,
    readLimit: 2,
    writes: 1,
    writeLimit: 1,
  });
});

test('quota persistence retries transient Windows rename locks', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'firebase-quota-rename-'));
  const usagePath = path.join(directory, 'usage.json');
  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  process.env.FIREBASE_QUOTA_USAGE_PATH = usagePath;
  process.env.FIREBASE_DAILY_READ_LIMIT = '2';
  process.env.FIREBASE_DAILY_WRITE_LIMIT = '2';

  const originalRename = fsPromises.rename.bind(fsPromises);
  let attempts = 0;
  t.mock.method(fsPromises, 'rename', async (...args) => {
    attempts += 1;
    if (attempts === 1) {
      throw Object.assign(new Error('File is temporarily locked.'), { code: 'EPERM' });
    }
    return originalRename(...args);
  });

  const quota = await import(`../services/firebaseQuotaService.js?test=${randomUUID()}`);
  await quota.runFirebaseRead(async () => 'read completed');

  assert.equal(attempts, 2);
  assert.deepEqual(JSON.parse(await fs.readFile(usagePath, 'utf8')), {
    date: new Date().toISOString().slice(0, 10),
    reads: 1,
    writes: 0,
  });
});
