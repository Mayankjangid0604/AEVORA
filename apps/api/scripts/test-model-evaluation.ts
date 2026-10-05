import { PrismaClient, ModelVersionStatus } from '@prisma/client';
import { EvaluationService } from '../src/research/services/evaluation.service';
import * as path from 'path';
import { execSync } from 'child_process';

const prisma = new PrismaClient();
const evalService = new EvaluationService(prisma as any);

async function runEvaluationTests() {
  console.log('--- PHASE 17 EVALUATION PLATFORM TESTS ---');

  // Find a ModelVersion
  const version = await prisma.modelVersion.findFirst({
    where: { 
      artifactRef: { not: 'restricted', contains: 'model_artifact' }
    },
    orderBy: { createdAt: 'desc' }
  });

  if (!version) {
    console.error('No EXPERIMENTAL model found. Run training test first.');
    process.exit(1);
  }

  // Create Benchmark Suite and Benchmark
  console.log('\n[1] Creating Benchmark Suite & Benchmark...');
  const suite = await evalService.createBenchmarkSuite('Core AI Capabilities', 'Standard evaluation suite');
  const benchmark = await evalService.createBenchmark(suite.id, {
    name: 'XOR Accuracy',
    description: 'Measures accuracy on synthetic XOR',
    evaluationCriteria: 'accuracy > 0.9',
    version: '1.0',
    scoringMethod: 'ACCURACY'
  });

  // Run Real Evaluation
  console.log('\n[2] Executing Real Python Evaluation against Artifact...');
  const employee = await prisma.employee.findFirst();
  
  // Make sure the dataset exists
  const datasetPath = path.join(process.cwd(), '.temp', 'dataset', 'xor_dataset.csv');
  if (!require('fs').existsSync(datasetPath)) {
    execSync(`node -e "require('child_process').execSync('python scripts/ml/generate_dataset.py ${datasetPath.replace(/\\/g, '/')} 200')"` , { stdio: 'inherit' });
  }

  const run1 = await evalService.runEvaluation(version.id, benchmark.id, employee?.id || 'TEST');
  console.log('Evaluation 1 Results:', run1.metrics);

  // Set Baseline
  console.log('\n[3] Setting Baseline Model...');
  await prisma.benchmark.update({
    where: { id: benchmark.id },
    data: { baselineVersionId: version.id }
  });

  // Train a dummy "bad" model to test regression
  console.log('\n[4] Creating Regression Model (dummy weights)...');
  const badArtifactPath = path.join(process.cwd(), '.temp', 'bad_artifact.pt');
  // Just copy the good one for now but we'll simulate a regression by mocking the python output or creating a truly bad model.
  // Actually, we can just run training with 1 epoch to get a bad model.
  const badModelRef = 'bad-artifact-ref';
  
  // Create another version
  const badVersion = await prisma.modelVersion.create({
    data: {
      modelId: version.modelId,
      version: 'v1.0.1-regression',
      artifactRef: version.artifactRef, // We'll just run eval again but it'll have the same score.
      createdBy: employee?.id || 'TEST',
      status: ModelVersionStatus.EXPERIMENTAL
    }
  });

  // Let's manually insert a bad evaluation run to simulate regression
  await prisma.evaluationRun.create({
    data: {
      modelVersionId: badVersion.id,
      benchmarkId: benchmark.id,
      evaluator: 'TEST',
      status: 'COMPLETED',
      score: 0.2, // 20% accuracy
      metrics: { accuracy: 0.2 }
    }
  });

  console.log('\n[5] Detecting Regression...');
  const regressionCheck = await evalService.detectRegression(benchmark.id, badVersion.id);
  console.log('Regression detected:', regressionCheck.regressionDetected);
  if (regressionCheck.regressionDetected) {
    console.log('Difference:', regressionCheck.comparison.difference);
  } else {
    console.error('FAIL: Regression was not detected!');
    process.exit(1);
  }

  console.log('\n✅ EVALUATION PLATFORM TESTS PASSED!');
}

runEvaluationTests().catch(console.error).finally(() => prisma.$disconnect());
