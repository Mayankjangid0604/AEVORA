const assert = require('assert');
const { hasX } = require('./index.js');

assert.strictEqual(hasX('Must have X'), true, "Should find X");
assert.strictEqual(hasX('hello world'), false, "Should not find X");
console.log('All tests passed successfully!');
process.exit(0);