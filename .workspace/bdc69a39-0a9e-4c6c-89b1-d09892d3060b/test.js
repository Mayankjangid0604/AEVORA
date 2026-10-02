const assert = require('assert');
const { add } = require('./index.js');

assert.strictEqual(add(2, 3), 5);
assert.strictEqual(add(-1, 1), 0);

console.log('All tests passed successfully!');
process.exit(0);
