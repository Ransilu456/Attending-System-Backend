import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const indexesPath = path.resolve(currentDirectory, '../firestore.indexes.json');

test('student profile request status is indexed for collection and collection-group queries', () => {
  const configuration = JSON.parse(fs.readFileSync(indexesPath, 'utf8'));
  const statusOverride = configuration.fieldOverrides.find((override) =>
    override.collectionGroup === 'requests' && override.fieldPath === 'status'
  );
  const queryScopes = new Set(statusOverride?.indexes.map((index) => index.queryScope));

  assert.deepEqual(queryScopes, new Set(['COLLECTION', 'COLLECTION_GROUP']));
  assert.ok(statusOverride.indexes.every((index) => index.order === 'ASCENDING'));
});
