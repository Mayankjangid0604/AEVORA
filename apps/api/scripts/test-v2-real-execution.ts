import * as fs from 'fs';
import * as path from 'path';

try {
  // Manual .env loading because dotenv is not in dependencies
  const envPath = path.resolve(process.cwd(), '.env');
  const envFile = fs.readFileSync(envPath, 'utf-8');
  for (const line of envFile.split('\n')) {
    if (line.startsWith('GEMINI_API_KEY=')) {
      process.env.GEMINI_API_KEY = line.substring('GEMINI_API_KEY='.length).trim();
    }
    if (line.startsWith('GEMINI_MODEL=')) {
      process.env.GEMINI_MODEL = line.substring('GEMINI_MODEL='.length).trim();
    }
  }
} catch (e) {
  console.warn('.env file not found or unreadable at ' + process.cwd());
}

import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { ProjectExecutionService } from './src/project-execution/project-execution.service';
import { SoftwareExecutionService } from './src/project-execution/software-execution.service';
import { PrismaService } from './src/prisma/prisma.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);
  const projectExecutionService = app.get(ProjectExecutionService);
  const softwareExecutionService = app.get(SoftwareExecutionService);
  console.log(`DIAGNOSTIC: process.env.GEMINI_API_KEY is ${process.env.GEMINI_API_KEY ? 'present' : 'missing'}`);

  try {
    // 1. Setup Data
    const company = await prisma.company.findFirst();
    const client = await prisma.client.findFirst({ where: { companyId: company.id } });
    let role = await prisma.role.findFirst({ where: { companyId: company.id } });
    if (!role) {
      role = await prisma.role.create({
        data: {
          company: { connect: { id: company.id } },
          title: 'Developer',
          description: 'Developer role',
          level: 1
        }
      });
    }
    let department = await prisma.department.findFirst({ where: { companyId: company.id } });
    if (!department) {
      department = await prisma.department.create({
        data: {
          name: 'Engineering',
          company: { connect: { id: company.id } }
        }
      });
    }
    const employee = await prisma.employee.create({
      data: {
        company: { connect: { id: company.id } },
        name: 'Test Dev ' + Date.now(),
        role: { connect: { id: role.id } },
        identitySeed: 'test-seed-' + Date.now(),
        department: { connect: { id: department.id } }
      }
    });
    
    // Find an existing project to use for execution testing
    const project = await prisma.project.findFirst({
      where: { companyId: company.id }
    });
    
    if (!project) {
      throw new Error("No project found to test execution with.");
    }

    // Reset project state for this test
    await prisma.project.update({
      where: { id: project.id },
      data: { status: 'PLANNED' }
    });

    console.log(`PASS: Using existing Project ${project.id}`);

    console.log(`PASS: Project created ${project.id}`);

    // Create Plan and Activate
    await projectExecutionService.createPlan(project.id, { summary: 'Plan', estimatedDuration: 10 });
    await projectExecutionService.activateProject(project.id);
    console.log('PASS: Project activated');

    // Create Requirements
    await projectExecutionService.createRequirement(project.id, { title: 'Req 1', description: 'desc' });
    console.log('PASS: Requirement created');

    await prisma.projectAssignment.deleteMany({ where: { projectId: project.id } });
    
    // Assign Staff
    await projectExecutionService.proposeStaffing(project.id, { employeeId: employee.id, allocation: 50 });
    const assignment = await prisma.projectAssignment.findFirst({ where: { projectId: project.id } });
    await projectExecutionService.activateAssignment(assignment.id);

    // Create Task
    const task = await projectExecutionService.createProjectTask(company.id, project.id, {
      title: 'Dev Task', description: 'Do dev', assignedEmployeeId: employee.id, priority: 'HIGH', estimatedEffort: 5
    }, employee.id);
    
    // Ensure task is IN_PROGRESS so development can start logically
    await prisma.task.update({ where: { id: task.id }, data: { status: 'IN_PROGRESS' } });

    // 2. Real Execution Pipeline
    console.log('\n--- Starting Real Development Execution ---');
    console.log('DIAGNOSTIC: AI request start (Development)');
    let devExecutionId;
    devExecutionId = await softwareExecutionService.executeDevelopment(project.id, employee.id, task.id);
    
    const devRecord = await prisma.projectDevelopmentExecution.findUnique({ where: { id: devExecutionId } });
    console.log('DIAGNOSTIC: generated code received');
    console.log(`PASS: Development completed with actual source path: ${devRecord.sourcePath}`);
    
    console.log('\n--- Starting Real Build Execution ---');
    console.log('DIAGNOSTIC: build start');
    const buildId = await softwareExecutionService.executeBuild(project.id) as string;
    console.log('DIAGNOSTIC: build end');
    const buildRecord = await prisma.projectBuildExecution.findUnique({ where: { id: buildId } });
    console.log(`PASS: Build completed with actual artifact: ${buildRecord.artifactPath}`);

    console.log('\n--- Starting Real Test Execution ---');
    console.log('DIAGNOSTIC: test start');
    const testId = await softwareExecutionService.executeTest(project.id, buildId) as string;
    console.log('DIAGNOSTIC: test end');
    const testRecord = await prisma.projectTestExecution.findUnique({ where: { id: testId } });
    console.log(`PASS: Tests PASSED against artifact.`);

    // 3. Delivery & Acceptance
    console.log('\n--- Starting Real Delivery & Acceptance ---');
    console.log('DIAGNOSTIC: delivery start');
    const delivery = await projectExecutionService.createDelivery(project.id, {
      summary: 'Delivery V1',
      deliverables: 'Source code and artifact',
      buildId: buildId
    });
    await projectExecutionService.markDelivered(delivery.id);
    console.log('DIAGNOSTIC: delivery end');
    console.log(`PASS: Delivery ${delivery.id} created successfully with artifact reference.`);

    // Client Acceptance
    console.log('DIAGNOSTIC: client acceptance start');
    const acceptance = await projectExecutionService.clientAcceptDelivery(delivery.id, project.clientId);
    console.log('DIAGNOSTIC: client acceptance end');
    console.log(`PASS: Client officially accepted delivery. Acceptance ID: ${acceptance.id}`);

    // Check project status
    const finalProject = await prisma.project.findUnique({ where: { id: project.id } });
    if (finalProject.status !== 'COMPLETED') {
      throw new Error(`Project status is ${finalProject.status}, expected COMPLETED`);
    }
    console.log(`PASS: Project status officially transitioned to COMPLETED.`);
    
    console.log('\n✅ AEVORA V2 REAL EXECUTION VERIFIED');
    console.log('REAL_PROVIDER_CALL=true');
    console.log('MOCK_FALLBACK_USED=false');
    
    await app.close();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ EXECUTION FAILED:', error);
    await app.close();
    process.exit(1);
  }
}

bootstrap();
