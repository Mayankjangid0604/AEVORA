"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const model_gateway_1 = require("@aevora/model-gateway");
const fs = require("fs");
const path = require("path");
const envFile = fs.readFileSync(path.resolve(process.cwd(), '.env'), 'utf-8');
for (const line of envFile.split('\n')) {
    if (line.startsWith('GEMINI_API_KEY=')) {
        process.env.GEMINI_API_KEY = line.substring(15).trim();
    }
}
async function run() {
    const gateway = new model_gateway_1.ModelGateway();
    console.log('Sending test request to Gemini...');
    try {
        const response = await gateway.callWithTier(model_gateway_1.ModelTier.GEMINI, 'Respond with exactly the word: CONNECTED');
        console.log('Response:', response);
        if (response.includes('CONNECTED')) {
            console.log('Connectivity test PASSED');
            process.exit(0);
        }
        else {
            console.log('Unexpected response');
            process.exit(1);
        }
    }
    catch (err) {
        console.error('Connectivity test FAILED:', err);
        process.exit(1);
    }
}
run();
//# sourceMappingURL=test-connectivity.js.map