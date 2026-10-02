const fs = require('fs');
fs.writeFileSync('dist.bin', 'compiled-artifact');
console.log('Build complete: dist.bin created.');
