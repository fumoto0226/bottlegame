import assert from 'node:assert/strict';

// V8/libm on ARM macOS and x64 Linux can differ in the final floating-point
// bit. This is far below a pixel; discrete visibility decisions stay exact.
export function assertGeometryClose(actual, expected, path = 'geometry') {
  if (typeof expected === 'number') {
    assert.ok(Number.isFinite(actual) && Number.isFinite(expected), `${path}: finite numbers required`);
    assert.ok(Math.abs(actual - expected) <= 1e-12 * Math.max(1, Math.abs(expected)),
      `${path}: ${actual} differs from ${expected}`);
    return;
  }
  if (expected === null || typeof expected !== 'object') {
    assert.equal(actual, expected, path);
    return;
  }
  assert.ok(actual !== null && typeof actual === 'object', path);
  assert.equal(Array.isArray(actual), Array.isArray(expected), path);
  if (Array.isArray(expected)) assert.equal(actual.length, expected.length, `${path}: length`);
  assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), `${path}: structure`);
  for (const key of Object.keys(expected))
    assertGeometryClose(actual[key], expected[key], `${path}.${key}`);
}

export function assertPreparedHeapClose(actual, expected) {
  for (const key of ['key', 'free', 'cover', 'coveredBy'])
    assert.deepEqual(actual[key], expected[key], key);
  assert.deepEqual(actual.poses.map(([id, p]) => [id, p.order]),
    expected.poses.map(([id, p]) => [id, p.order]), 'bottle IDs and stacking order');
  assertGeometryClose(actual, expected);
}
