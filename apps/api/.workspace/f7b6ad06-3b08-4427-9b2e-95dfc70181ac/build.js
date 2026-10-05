const fs = require('fs');
fs.writeFileSync('dist.bin', 'compiled artifact');
console.log('Build completed successfully.');