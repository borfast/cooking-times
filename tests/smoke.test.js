import { test } from 'node:test';
import assert from 'node:assert/strict';

test('test runner executes ES modules', () => {
  assert.equal(typeof import.meta.url, 'string');
});
