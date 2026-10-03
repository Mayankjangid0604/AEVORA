import { NestFactory } from '@nestjs/core';
import { AppModule } from './apps/api/src/app.module';
import { ChairmanCommandService } from './apps/api/src/chairman/chairman-command.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const service = app.get(ChairmanCommandService);
  
  // Test A - Natural-language information request
  console.log('Testing: What is the company currently working on?');
  const r1 = await service.submitCommand('default-company-id', 'default-chairman-id', 'What is the company currently working on?');
  console.log(r1);

  // Test B - CEO Instruction
  console.log('Testing: Ask the CEO to investigate this opportunity.');
  const r2 = await service.submitCommand('default-company-id', 'default-chairman-id', 'Ask the CEO to investigate this opportunity.');
  console.log(r2);

  // Test C - Research
  console.log('Testing: Show me the latest research opportunities.');
  const r3 = await service.submitCommand('default-company-id', 'default-chairman-id', 'Show me the latest research opportunities.');
  console.log(r3);

  // Test D - Marketing
  console.log('Testing: Show me the current marketing campaigns.');
  const r4 = await service.submitCommand('default-company-id', 'default-chairman-id', 'Show me the current marketing campaigns.');
  console.log(r4);

  // Test E - Approval
  console.log('Testing: Should we launch the product?');
  const r5 = await service.submitCommand('default-company-id', 'default-chairman-id', 'Should we launch the product?');
  console.log(r5);
  
  console.log('Testing: Approve the product launch.');
  const r6 = await service.submitCommand('default-company-id', 'default-chairman-id', 'Approve the product launch.');
  console.log(r6);

  await app.close();
}
bootstrap();
