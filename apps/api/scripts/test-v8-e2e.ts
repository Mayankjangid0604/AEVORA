import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { CompanyService } from '../src/company/company.service';
import * as crypto from 'crypto';

async function bootstrap() {
  console.log('Bootstrapping V8 E2E Isolation & Security Tests...');
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [
      AppModule,
      import('@nestjs/jwt').then(m => m.JwtModule.register({ secret: process.env.JWT_SECRET || 'test-secret', signOptions: { expiresIn: '1h' } }))
    ],
  }).compile();

  const app: INestApplication = moduleFixture.createNestApplication();
  await app.init();

  const prisma = app.get(PrismaService);
  
  // 1. Create a Chairman and Group
  const chairman = await prisma.chairman.create({
    data: {
      name: 'V8 Test Chairman',
      email: 'chairman_v8_' + Date.now() + '@test.com',
    }
  });

  const group = await prisma.aevoraGroup.create({
    data: {
      name: 'V8 Test Group',
      chairmanId: chairman.id,
    }
  });

  // 2. Create Company A and Company B using the service
  const companyService = app.get(CompanyService);
  const companyA = await companyService.createCompany('Company A', 'Company A Inc', 'Test A', chairman.id, group.id);
  const companyB = await companyService.createCompany('Company B', 'Company B Inc', 'Test B', chairman.id, group.id);

  // 3. Fetch automatically provisioned CEOs for both companies
  const deptA = await prisma.department.findFirst({ where: { companyId: companyA.id, name: 'Executive' } });
  const ceoA = await prisma.employee.findFirst({ where: { companyId: companyA.id, role: { title: 'CEO' } } });

  const deptB = await prisma.department.findFirst({ where: { companyId: companyB.id, name: 'Executive' } });
  const ceoB = await prisma.employee.findFirst({ where: { companyId: companyB.id, role: { title: 'CEO' } } });

  // 4. Get JWTs
  const jwtService = app.get(JwtService);
  const tokenChairman = await jwtService.signAsync({
    actorId: chairman.id,
    actorRole: 'CHAIRMAN',
  });

  const tokenCeoA = await jwtService.signAsync({
    actorId: ceoA!.id,
    actorRole: 'MANAGEMENT',
    companyId: companyA.id,
  });

  const tokenCeoB = await jwtService.signAsync({
    actorId: ceoB!.id,
    actorRole: 'MANAGEMENT',
    companyId: companyB.id,
  });

  console.log('--- TEST 1: CHAIRMAN AMBIGUOUS ROUTING (ASSISTANT) ---');
  // Chairman asks "How are we doing?" without x-company-id
  let res = await request(app.getHttpServer())
    .post('/assistant/message')
    .set('Authorization', `Bearer ${tokenChairman}`)
    .send({ message: 'How are we doing?' });
  
  if (res.body.actions?.includes('clarification_needed')) {
    console.log('PASS: Assistant correctly asked for clarification on ambiguous request.');
  } else {
    console.error('FAIL: Assistant did not ask for clarification!', res.body);
    process.exit(1);
  }

  console.log('--- TEST 2: CHAIRMAN IMPLICIT COMPANY ROUTING (ASSISTANT) ---');
  res = await request(app.getHttpServer())
    .post('/assistant/message')
    .set('Authorization', `Bearer ${tokenChairman}`)
    .send({ message: 'How is Company A doing?' });
  
  if (res.body.actions?.includes('clarification_needed')) {
    console.error('FAIL: Assistant failed to implicitly route to Company A!', res.body);
    process.exit(1);
  } else {
    console.log('PASS: Assistant routed to Company A based on message content.');
  }

  console.log('--- TEST 3: CEO A ACCESSING COMPANY A DATA ---');
  // Attempt to hit /ceo/operating-state
  res = await request(app.getHttpServer())
    .get('/ceo/operating-state')
    .set('Authorization', `Bearer ${tokenCeoA}`);
  
  if (res.status === 200) {
    console.log('PASS: CEO A can access Company A operating state.');
  } else {
    console.error('FAIL: CEO A cannot access Company A state!', res.body);
    process.exit(1);
  }

  console.log('--- TEST 4: CEO A ATTEMPTING TO ACCESS COMPANY B VIA HEADER SPOOFING ---');
  res = await request(app.getHttpServer())
    .get('/ceo/operating-state')
    .set('Authorization', `Bearer ${tokenCeoA}`)
    .set('x-company-id', companyB.id);
  
  if (res.status === 401) {
    console.log('PASS: CEO A spoofing x-company-id to Company B is blocked (401 Unauthorized).');
  } else {
    console.error(`FAIL: CEO A spoofing header returned ${res.status}!`, res.body);
    process.exit(1);
  }

  console.log('--- TEST 5: CHAIRMAN CREATING OBJECTIVE IN COMPANY B (ISOLATION) ---');
  res = await request(app.getHttpServer())
    .post('/ceo/v3-objective')
    .set('Authorization', `Bearer ${tokenChairman}`)
    .set('x-company-id', companyB.id)
    .send({ title: 'Company B Goal', description: 'Test' });
  
  if (res.status === 201 || res.status === 200) {
    console.log('PASS: Chairman can create objectives in a selected context.');
  } else {
    console.error(`FAIL: Chairman creating objective returned ${res.status}!`, res.body);
    process.exit(1);
  }

  // Ensure objective only exists in Company B
  const countA = await prisma.goal.count({ where: { companyId: companyA.id } });
  const countB = await prisma.goal.count({ where: { companyId: companyB.id } });
  if (countA === 0 && countB === 1) {
    console.log('PASS: Database structurally isolated Company B objective from Company A.');
  } else {
    console.error(`FAIL: Objective leaked! countA=${countA}, countB=${countB}`);
    process.exit(1);
  }

  console.log('--- TEST 6: CHAIRMAN ATTEMPTING TO ACCESS UNOWNED COMPANY ---');
  // Chairman tries to spoof x-company-id to a non-existent company or one they don't own.
  res = await request(app.getHttpServer())
    .post('/ceo/v3-objective')
    .set('Authorization', `Bearer ${tokenChairman}`)
    .set('x-company-id', 'some-random-uuid')
    .send({ title: 'Hacked Goal', description: 'Test' });
  
  if (res.status === 401 || res.status === 403 || res.status === 404) {
    console.log('PASS: Chairman accessing unowned company is blocked.');
  } else {
    console.error(`FAIL: Chairman accessing unowned company returned ${res.status}!`, res.body);
    process.exit(1);
  }

  console.log('\n✅ ALL V8 E2E MULTI-COMPANY ISOLATION AND SECURITY TESTS PASSED.');
  
  await app.close();
  process.exit(0);
}

bootstrap().catch(console.error);
