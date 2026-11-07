import assert from 'node:assert/strict';
import { test } from 'node:test';
import { crumbsOf, formatSize, isSwipeRight, parentOf, remember, splitArgs } from '../lib/nav.js';

test('folders', () => {
  assert.equal(parentOf('a/b/c'), 'a/b');
  assert.equal(parentOf('a'), '');
  assert.deepEqual(crumbsOf('Dropbox/GitHub'), [
    { name: 'Home', path: '' },
    { name: 'Dropbox', path: 'Dropbox' },
    { name: 'GitHub', path: 'Dropbox/GitHub' }
  ]);
  assert.deepEqual(crumbsOf(''), [{ name: 'Home', path: '' }]);
});

test('recent list keeps newest first without repeats', () => {
  assert.deepEqual(remember(['a', 'b', 'c'], 'b'), ['b', 'a', 'c']);
  assert.deepEqual(remember(['a', 'b'], 'z', 2), ['z', 'a']);
});

test('command splitting', () => {
  assert.deepEqual(splitArgs('git commit -m "two words" \'x y\''), ['git', 'commit', '-m', 'two words', 'x y']);
  assert.deepEqual(splitArgs('ls   -la'), ['ls', '-la']);
});

test('sizes and swipes', () => {
  assert.equal(formatSize(512), '512 B');
  assert.equal(formatSize(2048), '2.0 KB');
  assert.equal(formatSize(5 * 1024 * 1024), '5.0 MB');
  assert.ok(isSwipeRight(120, 10, 300));
  assert.ok(!isSwipeRight(120, 90, 300));
  assert.ok(!isSwipeRight(40, 0, 300));
});
