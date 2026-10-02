import { ModelGateway, ModelTier } from '@aevora/model-gateway';
import * as fs from 'fs';
import * as path from 'path';

// Load .env
const envFile = fs.readFileSync(path.resolve(process.cwd(), '.env'), 'utf-8');
for (const line of envFile.split('\n')) {
  if (line.startsWith('GEMINI_API_KEY=')) {
    process.env.GEMINI_API_KEY = line.substring(15).trim();
  }
}

async function run() {
  const gateway = new ModelGateway();
  console.log('Sending test request to Gemini...');
  try {
    const response = await gateway.callWithTier(ModelTier.GEMINI, 'Respond with exactly the word: CONNECTED');
    console.log('Response:', response);
    if (response.includes('CONNECTED')) {
      console.log('Connectivity test PASSED');
      process.exit(0);
    } else {
      console.log('Unexpected response');
      process.exit(1);
    }
  } catch (err) {
    console.error('Connectivity test FAILED:', err);
    process.exit(1);
  }
}

run();
