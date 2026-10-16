const path = require('path');

process.env.NODE_CONFIG_DIR = process.env.NODE_CONFIG_DIR || path.join('C:/Users/mayan/AppData/Roaming/npm/node_modules/n8n/bin', 'config');
process.env.N8N_PORT = '5678';
process.env.N8N_PROTOCOL = 'http';
process.env.N8N_HOST = 'localhost';
process.env.N8N_DIAGNOSTICS_ENABLED = 'false';
process.env.N8N_VERSION_NOTIFICATIONS_ENABLED = 'false';
process.env.N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS = 'false';

// Set argv to simulate 'n8n start'
process.argv = [process.execPath, 'C:/Users/mayan/AppData/Roaming/npm/node_modules/n8n/bin/n8n', 'start'];

require('source-map-support').install();
require('reflect-metadata');
require('dotenv').config({ quiet: true });
require('C:/Users/mayan/AppData/Roaming/npm/node_modules/n8n/dist/config');

console.log('Starting n8n via CommandRegistry...');

(async () => {
  try {
    const { Container } = await import('@n8n/di');
    const { CommandRegistry } = await import('C:/Users/mayan/AppData/Roaming/npm/node_modules/n8n/dist/command-registry.js');
    console.log('Container & CommandRegistry loaded.');
    await Container.get(CommandRegistry).execute();
    console.log('Execute called.');
  } catch (err) {
    console.error('CRASH in n8n:', err);
  }
})();
