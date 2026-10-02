const assert = require('assert');
const { hasX } = require('./index.js');

try {
  assert.strictEqual(hasX('Hello X'), true, 'Should find uppercase X');
  assert.strictEqual(hasX('Hello x'), true, 'Should find lowercase x');
  assert.strictEqual(hasX('Hello'), false, 'Should not find X');
  console.log('All tests passed successfully!');
  process.exit(0);
} catch (err) {
  console.error('Test failed:', err.message);
  process.exit(1);
}