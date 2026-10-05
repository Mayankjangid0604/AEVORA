import { PrismaClient, ModelVersionStatus } from '@prisma/client';
import { ModelRegistryService } from '../src/research/services/model-registry.service';

const prisma = new PrismaClient();
const mockExecutionGate = {
  authorizeProductionAction: async (params: any) => {
    if (params.action === 'PROMOTE' && params.actorId === 'agent_id') {
      throw new Error('Actor does not have CHAIRMAN role');
    }
  }
};
const registryService = new ModelRegistryService(prisma as any, mockExecutionGate as any);

async function runGovernanceTests() {
  console.log('--- PHASE 16 GOVERNANCE SECURITY TESTS ---');

  // Find a model version that is EXPERIMENTAL
  const version = await prisma.modelVersion.findFirst({
    where: { status: ModelVersionStatus.EXPERIMENTAL }
  });

  if (!version) {
    console.log('No EXPERIMENTAL model version found. Please run the training E2E test first.');
    process.exit(1);
  }

  console.log(`\nTesting promotion for ModelVersion: ${version.id}`);
  const company = await prisma.company.findFirst();
  let roleChairman = await prisma.role.findFirst({ where: { companyId: company!.id, title: 'CHAIRMAN' } });
  if (!roleChairman) {
      roleChairman = await prisma.role.create({ data: { companyId: company!.id, title: 'CHAIRMAN', description: 'Chairman', permissions: ['ALL'] } });
  }
  let chairmanEmployee = await prisma.employee.findFirst({ where: { companyId: company!.id, roleId: roleChairman.id } });
  if (!chairmanEmployee) {
      let firstEmp = await prisma.employee.findFirst({ where: { companyId: company!.id } });
      chairmanEmployee = await prisma.employee.create({ 
          data: { 
              companyId: company!.id, 
              roleId: roleChairman.id, 
              departmentId: firstEmp!.departmentId,
              name: 'Gov Chairman', 
              identitySeed: 'gov-chairman-seed'
          } 
      });
  }

  // Test 1: Agent tries to promote without passing gates
  console.log('\n[Test 1] Agent attempting to promote directly (no gates)');
  try {
    await registryService.requestPromotion(version.id, ModelVersionStatus.PRODUCTION, 'agent_id', 'company_id');
    console.error('FAIL: Agent was allowed to promote without gates.');
    process.exit(1);
  } catch (e: any) {
    console.log('PASS: Blocked. Reason:', e.message);
  }

  // Test 2: Agent tries to promote AFTER gates are passed
  // We'll create the gates manually
  console.log('\n[Test 2] Agent attempting to promote after gates are passed');
  const dummyEvaluatorId = 'dummy-agent-evaluator';
  
  await registryService.createPromotionGate(version.id, 'PROVENANCE', 'PASS', 'Dummy', dummyEvaluatorId);
  await registryService.createPromotionGate(version.id, 'REPRODUCIBILITY', 'PASS', 'Dummy', dummyEvaluatorId);
  await registryService.createPromotionGate(version.id, 'EVALUATION', 'PASS', 'Dummy', dummyEvaluatorId);
  await registryService.createPromotionGate(version.id, 'SAFETY', 'PASS', 'Dummy', dummyEvaluatorId);

  try {
    await registryService.requestPromotion(version.id, ModelVersionStatus.PRODUCTION, 'agent_id', 'company_id');
    console.error('FAIL: Agent was allowed to promote despite actor role restrictions.');
    process.exit(1);
  } catch (e: any) {
    console.log('PASS: Blocked. Reason:', e.message);
  }

  // Test 3: Chairman tries to promote after gates are passed
  console.log('\n[Test 3] Chairman attempting to promote after gates are passed');
  try {
    await registryService.requestPromotion(version.id, ModelVersionStatus.PRODUCTION, chairmanEmployee.id, company!.id);
    console.log('PASS: Chairman was allowed to promote.');
  } catch (e: any) {
    console.error('FAIL: Chairman was blocked.', e.message);
    process.exit(1);
  }

  // Restore state for subsequent tests if needed
  await prisma.modelVersion.update({
    where: { id: version.id },
    data: { status: ModelVersionStatus.EXPERIMENTAL }
  });

  console.log('\n✅ GOVERNANCE TESTS PASSED!');
  console.log('Agents are successfully blocked from self-promoting models.');
}

runGovernanceTests().catch(console.error).finally(() => prisma.$disconnect());
