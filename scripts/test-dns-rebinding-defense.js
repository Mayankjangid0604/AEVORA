const http = require('http');
const https = require('https');
const dns = require('dns');

function isPrivateOrReservedIp(ip) {
  if (!ip) return true;
  if (typeof ip !== 'string') {
    if (ip && typeof ip.address === 'string') ip = ip.address;
    else if (Array.isArray(ip) && ip[0] && typeof ip[0].address === 'string') ip = ip[0].address;
    else return true;
  }
  const clean = ip.replace(/^::ffff:/, '').replace(/^\[|\]$/g, '');
  if (clean === '127.0.0.1' || clean === '::1' || clean === 'localhost') return true;
  if (clean.startsWith('10.') || clean.startsWith('192.168.') || clean.startsWith('169.254.')) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(clean)) return true;
  return false;
}

// Custom lookup function that intercepts resolution at socket connection time
function createSafeLookup(isPrivateCheck) {
  return function safeLookup(hostname, options, callback) {
    dns.lookup(hostname, { all: true }, (err, addresses) => {
      if (err) return callback(err);
      if (!addresses || addresses.length === 0) {
        return callback(new Error(`No DNS records found for ${hostname}`));
      }
      for (const addr of addresses) {
        if (isPrivateCheck(addr.address)) {
          return callback(new Error(`[DNS Rebinding Guard] Host ${hostname} resolved to blocked IP ${addr.address}`));
        }
      }
      // Return the first validated address
      const primary = addresses[0];
      if (options && options.all) {
        return callback(null, addresses);
      }
      return callback(null, primary.address, primary.family);
    });
  };
}

async function testFetchWithSafeLookup(url, mockRebindAddress) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;

    const lookupFn = mockRebindAddress
      ? (hostname, opts, cb) => cb(null, mockRebindAddress, 4) // simulates attacker DNS returning private IP on socket connect
      : createSafeLookup(isPrivateOrReservedIp);

    const req = client.request(parsed, {
      lookup: (hostname, opts, cb) => {
        console.log(`[LOOKUP INTERCEPTED] Host: ${hostname}, Mock: ${mockRebindAddress || 'none'}`);
        lookupFn(hostname, opts, (err, address, family) => {
          if (err) return cb(err);
          if (isPrivateOrReservedIp(address)) {
            console.log(`[LOOKUP DETECTED PRIVATE IP] ${address}`);
            return cb(new Error(`[DNS Rebinding Guard] Blocked private IP: ${address}`));
          }
          cb(null, address, family);
        });
      },
      agent: false,
      headers: {
        'User-Agent': 'AevoraBot/1.0',
        'Host': parsed.host
      },
      timeout: 5000
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, bodyLength: body.length }));
    });

    req.on('error', (err) => reject(err));
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

async function main() {
  console.log('Testing legitimate connection with safe lookup...');
  try {
    const legit = await testFetchWithSafeLookup('https://www.midtowndentistrydallas.com/');
    console.log('Legitimate connection succeeded:', legit);
  } catch (err) {
    console.log('Legitimate connection result:', err.message);
  }

  console.log('\nTesting simulated DNS rebinding attack (DNS returns 127.0.0.1 at socket connect time)...');
  try {
    await testFetchWithSafeLookup('https://www.midtowndentistrydallas.com/', '127.0.0.1');
    console.error('FAIL: Rebinding attack was NOT blocked!');
  } catch (err) {
    console.log('SUCCESS: DNS rebinding blocked with error:', err.message);
  }

  console.log('\nTesting simulated DNS rebinding to Cloud Metadata (169.254.169.254)...');
  try {
    await testFetchWithSafeLookup('https://www.midtowndentistrydallas.com/', '169.254.169.254');
    console.error('FAIL: Metadata rebinding was NOT blocked!');
  } catch (err) {
    console.log('SUCCESS: Metadata rebinding blocked with error:', err.message);
  }
}

main().catch(console.error);
