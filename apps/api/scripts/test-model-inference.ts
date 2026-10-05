import { PrismaClient, ModelVersionStatus } from '@prisma/client';
import { ModelRegistryService } from '../src/research/services/model-registry.service';
import { InferenceService } from '../src/research/services/inference.service';
import { LocalPythonInferenceRuntime } from '../src/research/inference/local-python-inference.runtime';

const prisma = new PrismaClient();
const registryService = new ModelRegistryService(prisma as any, null as any);
const inferenceRuntime = new LocalPythonInferenceRuntime();
const inferenceService = new InferenceService(prisma as any, inferenceRuntime, {} as any);

async function runInferenceTests() {
  console.log('--- PHASE 17 INFERENCE PLATFORM TESTS ---');

  // We need a PRODUCTION model to deploy.
  const version = await prisma.modelVersion.findFirst({
    where: { 
      status: ModelVersionStatus.PRODUCTION,
      artifactRef: {
        not: {
          contains: 'risk-model'
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  if (!version) {
    console.error('No PRODUCTION model found. Run the E2E training test first.');
    process.exit(1);
  }

  console.log(`\n[1] Starting Limited Deployment for ModelVersion: ${version.id}`);
  const deployment = await registryService.startLimitedDeployment(version.id, {
    scope: 'ALPHA_TESTERS',
    allowedAgents: ['Agent-1'],
    allowedWorkloads: ['TEST'],
    resourceLimits: {}
  });
  console.log(`Deployment ACTIVE: ${deployment.id}`);

  console.log('\n[2] Executing Governed Inference...');
  try {
    const result = await inferenceService.runInference(deployment.id, [[0, 0], [0, 1], [1, 0], [1, 1]], version.companyId);
    console.log('Inference Success:', result.predictions);
    console.log('Latency:', result.latencyMs, 'ms');
  } catch (e: any) {
    console.error('Inference failed:', e.message);
    process.exit(1);
  }

  console.log('\n[3] Verifying Inference Log...');
  const logs = await prisma.inferenceLog.findMany({
    where: { deploymentId: deployment.id }
  });
  if (logs.length === 0) {
    console.error('FAIL: Inference log was not created.');
    process.exit(1);
  }
  console.log('Inference Log found. Success:', logs[0].success);

  console.log('\n[4] Testing Rollback Deployment...');
  // We need a target to rollback to. We'll just rollback to itself for testing the state transition.
  const rollbackResult = await registryService.rollbackDeployment(deployment.id, version.id);
  console.log('Deployment status after rollback:', rollbackResult.status);
  
  if (rollbackResult.status !== 'ROLLED_BACK') {
    console.error('FAIL: Deployment did not transition to ROLLED_BACK');
    process.exit(1);
  }

  // Verify we can no longer run inference on a rolled back deployment
  console.log('\n[5] Verifying Inference blocked on Rolled Back Deployment...');
  try {
    await inferenceService.runInference(deployment.id, [[0, 0]], version.companyId);
    console.error('FAIL: Inference was allowed on a rolled back deployment.');
    process.exit(1);
  } catch (e: any) {
    console.log('PASS: Inference blocked. Reason:', e.message);
  }

  console.log('\n✅ INFERENCE PLATFORM TESTS PASSED!');
}

runInferenceTests().catch(console.error).finally(() => prisma.$disconnect());
