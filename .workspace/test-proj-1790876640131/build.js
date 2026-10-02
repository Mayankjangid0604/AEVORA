const fs = require('fs');
fs.writeFileSync('dist.bin', 'compiled artifact with X');
console.log('Build complete: dist.bin generated.');