const assert = require('assert');
const { add } = require('./index.js');

assert.strictEqual(add(2, 3), 5);
console.log('Tests passed successfully!');
process.exit(0);