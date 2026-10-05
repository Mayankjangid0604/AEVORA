import { ModelGateway } from '@aevora/model-gateway';

async function testModel() {
  const gw = new ModelGateway();
  console.log('Testing ModelGateway generation...');
  const start = Date.now();
  try {
    const res = await gw.generate({ prompt: 'Hello, respond in one short sentence.' });
    console.log('Result in', Date.now() - start, 'ms:', res.text);
  } catch (e: any) {
    console.error('ModelGateway error:', e.message);
  }
}

testModel().catch(console.error);
