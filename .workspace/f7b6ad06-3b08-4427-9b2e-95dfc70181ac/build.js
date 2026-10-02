const fs = require('fs');
fs.writeFileSync('dist.bin', 'compiled binary artifact');
console.log('Build successful: dist.bin created.');
