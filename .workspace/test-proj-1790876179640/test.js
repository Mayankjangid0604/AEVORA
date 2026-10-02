
        const m = require('./index.js');
        if (m.status !== 'OK') throw new Error('Test failed');
        console.log('Test passed');
      