const fs = require('fs');
fs.writeFileSync('dist.bin', 'compiled-x-artifact');
console.log('Build complete. dist.bin written.');