import assert from 'node:assert/strict';
import { test } from 'node:test';

test('test runner executes ES modules', () => {
    assert.equal(typeof import.meta.url, 'string');
});
