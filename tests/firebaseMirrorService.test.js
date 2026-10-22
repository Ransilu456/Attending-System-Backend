import assert from 'node:assert/strict';
import test from 'node:test';
import { consumeChangeStream } from '../services/firebaseMirrorService.js';

test('consumes MongoDB change streams through next() in order', async () => {
  const changes = [{ id: 1 }, { id: 2 }];
  const processed = [];
  const stream = {
    async next() {
      return changes.shift() ?? null;
    },
  };

  await consumeChangeStream(stream, async (change) => {
    processed.push(change.id);
  });

  assert.deepEqual(processed, [1, 2]);
});

test('rejects a change stream without next()', async () => {
  await assert.rejects(
    consumeChangeStream({}, async () => {}),
    /does not provide a next\(\) method/
  );
});
