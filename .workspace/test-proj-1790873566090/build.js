const fs = require('fs');
fs.writeFileSync('dist.bin', 'compiled');
console.log('Artifact written to dist.bin');