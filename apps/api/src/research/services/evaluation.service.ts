import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EvaluationStatus } from '@prisma/client';

@Injectable()
export class EvaluationService {
  constructor(private readonly prisma: PrismaService) {}

  async createBenchmarkSuite(name: string, description: string) {
    return this.prisma.benchmarkSuite.create({
      data: { name, description }
    });
  }

  async createBenchmark(suiteId: string, data: {
    name: string;
    description: string;
    evaluationCriteria: string;
    version: string;
    datasetRef?: string;
    scoringMethod: string;
  }) {
    return this.prisma.benchmark.create({
      data: {
        suiteId,
        name: data.name,
        description: data.description,
        evaluationCriteria: data.evaluationCriteria,
        version: data.version,
        datasetRef: data.datasetRef,
        scoringMethod: data.scoringMethod
      }
    });
  }

  async runEvaluation(modelVersionId: string, benchmarkId: string, evaluator: string, experimentId?: string) {
    const version = await this.prisma.modelVersion.findUnique({ where: { id: modelVersionId } });
    if (!version || !version.artifactRef) throw new NotFoundException('Model version or artifact not found');

    const run = await this.prisma.evaluationRun.create({
      data: {
        modelVersionId,
        benchmarkId,
        experimentId,
        evaluator,
        status: EvaluationStatus.RUNNING
      }
    });

    const datasetPath = require('path').join(process.cwd(), '.temp', 'dataset', 'xor_dataset.csv');
    const evaluateScript = require('path').join(process.cwd(), 'scripts', 'ml', 'evaluate.py');
    const { execSync } = require('child_process');

    let metrics = {};
    let score = 0;
    try {
      const out = execSync(`python ${evaluateScript} "${datasetPath}" "${version.artifactRef}"`).toString();
      const parsed = JSON.parse(out);
      if (parsed.error) throw new Error(parsed.error);
      metrics = parsed.metrics;
      score = parsed.metrics.accuracy * 100;
    } catch (e: any) {
      await this.prisma.evaluationRun.update({
        where: { id: run.id },
        data: { status: EvaluationStatus.FAILED }
      });
      throw new Error(`Evaluation failed: ${e.message}`);
    }

    return this.prisma.evaluationRun.update({
      where: { id: run.id },
      data: {
        status: EvaluationStatus.COMPLETED,
        score,
        completedAt: new Date(),
        metrics: metrics,
        reproducibility: {
          evaluatorVersion: 'v1.0.0',
          seed: 42
        }
      }
    });
  }

  async getEvaluationsForModel(modelVersionId: string) {
    return this.prisma.evaluationRun.findMany({
      where: { modelVersionId },
      include: { benchmark: true }
    });
  }

  async compareModels(modelAId: string, modelBId: string, benchmarkId: string) {
    const evalA = await this.prisma.evaluationRun.findFirst({
      where: { modelVersionId: modelAId, benchmarkId, status: EvaluationStatus.COMPLETED },
      orderBy: { completedAt: 'desc' }
    });
    const evalB = await this.prisma.evaluationRun.findFirst({
      where: { modelVersionId: modelBId, benchmarkId, status: EvaluationStatus.COMPLETED },
      orderBy: { completedAt: 'desc' }
    });

    if (!evalA || !evalB) throw new Error('Both models must have completed evaluations for the given benchmark to compare.');

    return {
      modelA: { id: modelAId, score: evalA.score, metrics: evalA.metrics, evaluationId: evalA.id },
      modelB: { id: modelBId, score: evalB.score, metrics: evalB.metrics, evaluationId: evalB.id },
      difference: {
        scoreDiff: (evalB.score || 0) - (evalA.score || 0)
      }
    };
  }

  async detectRegression(benchmarkId: string, candidateModelId: string) {
    const benchmark = await this.prisma.benchmark.findUnique({ where: { id: benchmarkId } });
    if (!benchmark || !benchmark.baselineVersionId) {
      return { regressionDetected: false, reason: 'No baseline configured' };
    }

    try {
      const comparison = await this.compareModels(benchmark.baselineVersionId, candidateModelId, benchmarkId);
      if (comparison.difference.scoreDiff < 0) {
        return { regressionDetected: true, comparison };
      }
      return { regressionDetected: false, comparison };
    } catch (e: any) {
      return { regressionDetected: false, reason: e.message };
    }
  }
}
