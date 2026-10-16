// Bootstrap script to launch the compiled NestJS API with SAFE_MODE_ALLOWED_HOSTS
const path = require('path');

const apiDir = path.resolve(__dirname, '../apps/api');
process.chdir(apiDir);

process.env.SAFE_MODE_ALLOWED_HOSTS = process.env.SAFE_MODE_ALLOWED_HOSTS || 'www.midtowndentistrydallas.com,midtowndentistrydallas.com,www.sweetsmiles4kids.com,sweetsmiles4kids.com,www.northtexaspediatricdentists.com,northtexaspediatricdentists.com,www.luckykidsdental.com,luckykidsdental.com';

const mainPath = path.resolve(apiDir, 'dist/main.js');
console.log(`[API Launcher] Starting API from ${mainPath} in ${apiDir} with SAFE_MODE_ALLOWED_HOSTS=${process.env.SAFE_MODE_ALLOWED_HOSTS}`);
require(mainPath);
