import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import * as request from 'supertest';
import { Logger } from '@nestjs/common';
import { Company, Employee } from '@prisma/client';
import * as crypto from 'crypto';
import { INestApplication } from '@nestjs/common';

const logger = new Logger('TestPhase21Security');

async function runTests() {
  logger.log('Starting Phase 21 Security E2E Tests...');

  const app = await NestFactory.create(AppModule);
  await app.init();
  const httpServer = app.getHttpServer();
  const prisma = app.get(PrismaService);

  let passed = 0;
  let failed = 0;
  let assertions = 0;

  function assert(condition: any, message: string) {
    assertions++;
    if (condition) {
      logger.log(`✅ [PASS ${assertions}] ${message}`);
      passed++;
    } else {
      logger.error(`❌ [FAIL ${assertions}] ${message}`);
      failed++;
    }
  }

  try {
    // 1. Setup Test Data
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync('password123', salt, 600000, 64, 'sha256').toString('hex');

    const chairmanA = await prisma.chairman.create({
      data: {
        name: 'Chairman A',
        email: `chairmanA_${Date.now()}@example.com`,
        credentialSalt: salt,
        credentialHash: hash,
        hashAlgorithm: 'PBKDF2-SHA256',
        workFactor: 600000
      }
    });

    const companyA = await prisma.company.create({
      data: { name: 'Security Corp A ' + Date.now(), chairmanId: chairmanA.id }
    });

    const chairmanB = await prisma.chairman.create({
      data: {
        name: 'Chairman B',
        email: `chairmanB_${Date.now()}@example.com`,
        credentialSalt: salt,
        credentialHash: hash,
        hashAlgorithm: 'PBKDF2-SHA256',
        workFactor: 600000
      }
    });

    const companyB = await prisma.company.create({
      data: { name: 'Security Corp B ' + Date.now(), chairmanId: chairmanB.id }
    });

    const deptA = await prisma.department.create({
      data: { name: 'Dept A', companyId: companyA.id }
    });

    const roleA = await prisma.role.create({
      data: {
        title: 'ENGINEER',
        companyId: companyA.id,
        description: 'Engineer',
        accessLevel: 'STANDARD'
      }
    });

    const empA = await prisma.employee.create({
      data: {
        companyId: companyA.id,
        name: 'Alice (Engineer)',
        identitySeed: crypto.randomBytes(16).toString('hex'),
        credentialSalt: salt,
        credentialHash: hash,
        hashAlgorithm: 'PBKDF2-SHA256',
        workFactor: 600000,
        roleId: roleA.id,
        departmentId: deptA.id
      }
    });

    const deptB = await prisma.department.create({
      data: { name: 'Dept B', companyId: companyB.id }
    });

    const roleB = await prisma.role.create({
      data: {
        title: 'ENGINEER',
        companyId: companyB.id,
        description: 'Engineer',
        accessLevel: 'STANDARD'
      }
    });

    const empB = await prisma.employee.create({
      data: {
        companyId: companyB.id,
        name: 'Bob',
        identitySeed: crypto.randomBytes(16).toString('hex'),
        credentialSalt: salt,
        credentialHash: hash,
        hashAlgorithm: 'PBKDF2-SHA256',
        workFactor: 600000,
        roleId: roleB.id,
        departmentId: deptB.id
      }
    });

    // 2. Authentication Tests
    logger.log('--- Authentication Tests ---');
    
    // Test: Login with wrong password
    let res = await request(httpServer)
      .post('/auth/login')
      .send({ actorId: chairmanA.id, credential: 'wrongpassword' });
    assert(res.status === 401, 'Login fails with wrong password');

    // Test: Login with correct password
    res = await request(httpServer)
      .post('/auth/login')
      .send({ actorId: chairmanA.id, credential: 'password123' });
    assert(res.status === 201 || res.status === 200, 'Login succeeds with correct password');
    const tokenA = res.body.access_token;
    assert(!!tokenA, 'Valid JWT token returned');

    res = await request(httpServer)
      .post('/auth/login')
      .send({ actorId: chairmanB.id, credential: 'password123' });
    const tokenB = res.body.access_token;

    // Test: Missing JWT
    res = await request(httpServer).get('/chairman/overview');
    assert(res.status === 401, 'Missing JWT returns 401');

    // Test: Invalid JWT
    res = await request(httpServer)
      .get('/chairman/overview')
      .set('Authorization', 'Bearer invalidtoken');
    assert(res.status === 401, 'Invalid JWT returns 401');

    // Test: SYSTEM magic string bypass fails
    res = await request(httpServer)
      .get('/chairman/overview')
      .set('x-chairman-id', 'SYSTEM');
    assert(res.status === 401, 'SYSTEM magic string bypass via old header fails');

    // 3. Authorization Tests (Cross-company)
    logger.log('--- Authorization Tests ---');
    
    // Test: Company A tries to get Company B data
    res = await request(httpServer)
      .get(`/chairman/employees/${empA.id}`)
      .set('Authorization', `Bearer ${tokenB}`);
    assert(res.status === 401 || res.status === 403 || res.status === 404, 'Cross-company access is blocked');

    // Test: Non-Chairman tries to approve proposal
    // Assuming Bob is Engineer
    const proposal = await prisma.researchProposal.create({
      data: { 
        title: 'Test Proposal', 
        companyId: companyA.id,
        proposerId: empA.id,
        status: 'SUBMITTED',
        description: 'Desc',
        researchQuestion: 'Q',
        hypothesis: 'H',
        objectives: 'O'
      }
    });

    // Login as Engineer (empA)
    const empLogin = await request(httpServer)
      .post('/auth/login')
      .send({ actorId: empA.id, credential: 'password123' });
    const empToken = empLogin.body.access_token;

    res = await request(httpServer)
      .post(`/chairman/research/proposals/${proposal.id}/approve`)
      .set('Authorization', `Bearer ${empToken}`);
    assert(res.status === 401 || res.status === 403 || res.status === 400, 'Non-Chairman cannot approve proposal (HTTP 401/403/400)');

    logger.log(`\nPhase 21 Security Verification Complete: ${passed}/${assertions} tests passed.`);
    
    if (failed > 0) {
      logger.error('Some checkpoints failed. Security hardening incomplete.');
      process.exit(1);
    }
    
    logger.log('🎉 PHASE 21 SECURITY — COMPLETE AND VERIFIED');
    process.exit(0);
  } catch (err) {
    logger.error('Test script crashed:', err);
    process.exit(1);
  } finally {
    await app.close();
  }
}

runTests();
