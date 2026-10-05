import {
  Injectable, ForbiddenException, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkforceAuditService } from './workforce-audit.service';
import { WorkerProfileService } from './worker-profile.service';
import { SkillProficiencyLevel, EmployeeStatus } from '@prisma/client';

const EVIDENCE_SOURCES = ['TASK_COMPLETION', 'ASSESSMENT', 'CERTIFICATION', 'MANAGER_VERIFICATION', 'TRAINING_COMPLETION'];

@Injectable()
export class SkillVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: WorkforceAuditService,
    private readonly profileSvc: WorkerProfileService,
  ) {}

  private async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Actor does not belong to company');
    if (actor.status !== EmployeeStatus.ACTIVE) throw new ForbiddenException('Actor is not active');
    return actor;
  }

  async addSkill(companyId: string, actorId: string, employeeId: string, dto: {
    skillName: string; category: string;
    proficiencyLevel: SkillProficiencyLevel;
    evidence?: string; evidenceSource?: string;
    acquiredAt?: Date; expiresAt?: Date; notes?: string;
  }) {
    await this.verifyActor(actorId, companyId);

    if (dto.evidenceSource && !EVIDENCE_SOURCES.includes(dto.evidenceSource)) {
      throw new BadRequestException(`evidenceSource must be one of: ${EVIDENCE_SOURCES.join(', ')}`);
    }

    const profile = await this.profileSvc.ensureProfile(employeeId, companyId);

    // Skills are UNVERIFIED by default — only a manager/authorized person can verify
    const skill = await this.prisma.workerSkillVerification.create({
      data: {
        workerProfileId: profile.id, companyId,
        skillName: dto.skillName, category: dto.category,
        proficiencyLevel: dto.proficiencyLevel,
        evidence: dto.evidence, evidenceSource: dto.evidenceSource,
        acquiredAt: dto.acquiredAt ?? new Date(),
        expiresAt: dto.expiresAt, notes: dto.notes,
        verified: false, // always starts unverified
      },
    });
    await this.audit.record({
      companyId, actorId, action: 'SKILL_ADDED',
      objectType: 'WorkerSkillVerification', objectId: skill.id,
      newValue: { employeeId, skillName: dto.skillName, proficiencyLevel: dto.proficiencyLevel, verified: false },
    });
    return skill;
  }

  async verifySkill(companyId: string, verifierId: string, skillId: string, opts?: { notes?: string }) {
    await this.verifyActor(verifierId, companyId);
    const skill = await this.prisma.workerSkillVerification.findUnique({ where: { id: skillId } });
    if (!skill || skill.companyId !== companyId) throw new NotFoundException('Skill not found');

    // Verifier must not be verifying their own skill
    const verifierProfile = await this.prisma.workerProfile.findUnique({ where: { employeeId: verifierId } });
    if (verifierProfile && verifierProfile.id === skill.workerProfileId) {
      throw new ForbiddenException('An employee cannot verify their own skill');
    }

    const updated = await this.prisma.workerSkillVerification.update({
      where: { id: skillId },
      data: { verified: true, verifiedById: verifierId, verifiedAt: new Date(), notes: opts?.notes ?? skill.notes },
    });
    await this.audit.record({
      companyId, actorId: verifierId, action: 'SKILL_VERIFIED',
      objectType: 'WorkerSkillVerification', objectId: skillId,
      oldValue: { verified: false }, newValue: { verified: true, verifiedById: verifierId },
    });
    return updated;
  }

  async getSkills(companyId: string, employeeId: string) {
    const profile = await this.prisma.workerProfile.findUnique({ where: { employeeId } });
    if (!profile || profile.companyId !== companyId) throw new NotFoundException('Worker profile not found');
    return this.prisma.workerSkillVerification.findMany({
      where: { workerProfileId: profile.id },
      orderBy: { acquiredAt: 'desc' },
    });
  }

  async getSkill(companyId: string, skillId: string) {
    const skill = await this.prisma.workerSkillVerification.findUnique({ where: { id: skillId } });
    if (!skill || skill.companyId !== companyId) throw new NotFoundException('Skill not found');
    return skill;
  }
}
