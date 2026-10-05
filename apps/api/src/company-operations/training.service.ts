import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TrainingStatus } from '@prisma/client';

@Injectable()
export class TrainingService {
  private readonly logger = new Logger(TrainingService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createTrainingRecommendation(
    companyId: string,
    employeeId: string,
    skillName: string,
    skillCategory: string,
    proposerId: string,
  ) {
    // Check if program exists, else create one (mock for now)
    let program = await this.prisma.trainingProgram.findFirst({
      where: { companyId, skillName, skillCategory },
    });

    if (!program) {
      program = await this.prisma.trainingProgram.create({
        data: {
          companyId,
          name: `Basic ${skillName} Training`,
          skillName,
          skillCategory,
        },
      });
    }

    const training = await this.prisma.employeeTraining.create({
      data: {
        employeeId,
        programId: program.id,
        createdBy: proposerId,
        status: TrainingStatus.ASSIGNED,
      },
    });

    await this.prisma.companyEvent.create({
      data: {
        companyId,
        type: 'EMPLOYEE_TRAINING_CREATED',
        payload: { trainingId: training.id, employeeId, programId: program.id, proposerId },
      },
    });

    return training;
  }

  async completeTraining(trainingId: string, success: boolean = true) {
    const training = await this.prisma.employeeTraining.findUnique({
      where: { id: trainingId },
      include: { program: true, employee: { select: { companyId: true } } },
    });

    if (!training) throw new NotFoundException('Training not found');

    const updated = await this.prisma.employeeTraining.update({
      where: { id: trainingId },
      data: {
        status: success ? TrainingStatus.COMPLETED : TrainingStatus.FAILED,
        completedAt: new Date(),
        result: success ? 'Passed' : 'Failed',
      },
    });

    if (success) {
      // Deterministically improve skill
      const existingSkill = await this.prisma.employeeSkill.findFirst({
        where: { employeeId: training.employeeId, name: training.program.skillName },
      });

      if (existingSkill) {
        await this.prisma.employeeSkill.update({
          where: { id: existingSkill.id },
          data: { proficiency: Math.min(100, existingSkill.proficiency + 10) },
        });
      } else {
        await this.prisma.employeeSkill.create({
          data: {
            employeeId: training.employeeId,
            name: training.program.skillName,
            category: training.program.skillCategory,
            proficiency: 20, // Base level
          },
        });
      }
    }

    await this.prisma.companyEvent.create({
      data: {
        companyId: training.employee.companyId,
        type: 'EMPLOYEE_TRAINING_COMPLETED',
        payload: { trainingId, success },
      },
    });

    return updated;
  }
}
