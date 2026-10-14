import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Inject,
  Optional,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CompanyStatus } from '@prisma/client';
import { HqCapacityService } from '../spatial/hq-capacity.service';
import { V12VehicleService } from '../spatial/vehicle.service';
import { WorldStateEventService } from '../world-state-gateway/world-state-event.service';
import { V12EntityType } from '@aevora/shared';

export interface ProvisionCompanyOptions {
  initialDepartments?: string[];
  initialFleetCount?: number;
}

export interface CreateSubsidiaryDto {
  name: string;
  legalName?: string;
  description?: string;
  initialDepartments?: string[];
  initialFleetCount?: number;
}

export interface AutoProvisionCompanyDto {
  name: string;
  legalName?: string;
  description?: string;
  parentCompanyId?: string;
  groupId?: string;
  initialDepartments?: string[];
  initialFleetCount?: number;
}

@Injectable()
export class CompanyService {
  private readonly logger = new Logger(CompanyService.name);

  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Optional() private readonly hqCapacityService?: HqCapacityService,
    @Optional() private readonly vehicleService?: V12VehicleService,
    @Optional() private readonly eventService?: WorldStateEventService,
  ) {}

  /**
   * Authoritative company creation.
   * Creates the company, default executive department, CEO employee,
   * emits COMPANY_CREATED event, and provisions its initial spatial campus.
   */
  async createCompany(
    name: string,
    legalName: string,
    description: string,
    chairmanId: string,
    groupId?: string,
    options?: ProvisionCompanyOptions,
  ) {
    if (!name || typeof name !== 'string' || !name.trim()) {
      throw new BadRequestException('Company name is required');
    }

    const trimmedName = name.trim();

    // Idempotency: check if an active company with the exact name already exists in this group / chairman scope
    const existing = await this.prisma.company.findFirst({
      where: {
        name: trimmedName,
        chairmanId,
        ...(groupId ? { groupId } : {}),
        status: CompanyStatus.ACTIVE,
      },
      include: { departments: true, employees: true },
    });

    if (existing) {
      this.logger.log(
        `Idempotent match: Company "${trimmedName}" (${existing.id}) already exists. Reconciling spatial campus.`,
      );
      const ceo = existing.employees.find(
        (e: any) => e.name === 'CEO' || e.role?.title === 'CEO',
      );
      try {
        await this.provisionCompanyCampus(existing.id, options, ceo?.id);
      } catch (err: any) {
        this.logger.warn(
          `[Failure Isolation] Reconciling spatial campus notice for existing company ${existing.id}: ${err.message}`,
        );
      }
      return existing;
    }

    const deptNames = Array.from(
      new Set(['Executive', ...(options?.initialDepartments || [])]),
    );

    const res = await this.prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name: trimmedName,
          legalName: legalName?.trim() || `${trimmedName} Ltd.`,
          description: description?.trim() || null,
          chairmanId,
          groupId: groupId || null,
          status: CompanyStatus.ACTIVE,
          departments: {
            create: deptNames.map((dName) => ({ name: dName })),
          },
        },
        include: { departments: true },
      });

      const executiveDept = company.departments.find((d) => d.name === 'Executive');
      let ceo = null;
      if (executiveDept) {
        ceo = await tx.employee.create({
          data: {
            name: 'CEO',
            identitySeed: `${company.id}-ceo-seed`,
            status: 'ACTIVE',
            company: { connect: { id: company.id } },
            department: { connect: { id: executiveDept.id } },
            role: {
              create: {
                title: 'CEO',
                level: 1,
                accessLevel: 'MANAGEMENT',
                company: { connect: { id: company.id } },
              },
            },
          },
        });
      }

      await tx.companyEvent.create({
        data: {
          companyId: company.id,
          type: 'COMPANY_CREATED',
          payload: { name: company.name, legalName: company.legalName, groupId },
        },
      });

      return { company, ceo };
    });

    const company = res.company;

    // Initial Spatial Campus Provisioning (Failure Isolated)
    try {
      await this.provisionCompanyCampus(company.id, options, res.ceo?.id);
    } catch (spatialErr: any) {
      this.logger.warn(
        `[Failure Isolation] Initial spatial campus provisioning non-fatal notice for company ${company.id}: ${spatialErr.message}`,
      );
    }

    return company;
  }

  /**
   * Authoritative automatic subsidiary provisioning.
   * Creates a subsidiary company linked to the parent company, establishes organizational
   * departments, provisions an isolated spatial campus, and allocates parking.
   */
  async createSubsidiary(
    parentCompanyId: string,
    actorId: string,
    dto: CreateSubsidiaryDto,
  ) {
    if (!dto.name || typeof dto.name !== 'string' || !dto.name.trim()) {
      throw new BadRequestException('Subsidiary company name is required');
    }

    const parentCompany = await this.prisma.company.findUnique({
      where: { id: parentCompanyId },
      include: { group: true },
    });

    if (!parentCompany) {
      throw new NotFoundException(`Parent company ${parentCompanyId} not found`);
    }

    // Verify actor authorization
    let isAuthorized = parentCompany.chairmanId === actorId;
    if (!isAuthorized) {
      const actorEmployee = await this.prisma.employee.findUnique({
        where: { id: actorId },
        include: { role: true },
      });
      if (
        actorEmployee &&
        actorEmployee.companyId === parentCompanyId &&
        actorEmployee.status === 'ACTIVE' &&
        (actorEmployee.role?.accessLevel === 'MANAGEMENT' ||
          actorEmployee.role?.accessLevel === 'CHAIRMAN' ||
          actorEmployee.role?.title?.toUpperCase().includes('CEO') ||
          actorEmployee.role?.title?.toUpperCase().includes('CHAIRMAN'))
      ) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      throw new ForbiddenException(
        `Actor ${actorId} is not authorized to create subsidiaries for company ${parentCompanyId}`,
      );
    }

    // Idempotency: check if subsidiary with this name already exists under parent
    const existingSubsidiaries = await this.getSubsidiaries(parentCompanyId);
    const existingSub = existingSubsidiaries.find(
      (s) => s.name.trim().toLowerCase() === dto.name.trim().toLowerCase(),
    );
    if (existingSub) {
      this.logger.log(
        `Idempotent match: Subsidiary "${dto.name}" (${existingSub.id}) already exists under parent ${parentCompanyId}. Reconciling spatial campus.`,
      );
      try {
        await this.provisionCompanyCampus(existingSub.id, {
          initialDepartments: dto.initialDepartments,
          initialFleetCount: dto.initialFleetCount,
        });
      } catch (err: any) {
        this.logger.warn(`Non-fatal retry campus provisioning notice: ${err.message}`);
      }
      return {
        subsidiary: existingSub,
        parentCompanyId,
        parentCompanyName: parentCompany.name,
        spatialCampusProvisioned: true,
        isExisting: true,
      };
    }

    // Embed parent company relationship metadata in description
    const relationshipMetadata = JSON.stringify({
      parentCompanyId: parentCompany.id,
      parentCompanyName: parentCompany.name,
      relationship: 'SUBSIDIARY',
      userDescription: dto.description || null,
    });

    // Provision subsidiary through authoritative company creation pipeline
    const subsidiary = await this.createCompany(
      dto.name,
      dto.legalName || `${dto.name.trim()} Ltd.`,
      relationshipMetadata,
      parentCompany.chairmanId,
      parentCompany.groupId || undefined,
      {
        initialDepartments: dto.initialDepartments || ['Engineering', 'Operations'],
        initialFleetCount: dto.initialFleetCount,
      },
    );

    // Record authoritative subsidiary creation event on parent company
    await this.prisma.companyEvent.create({
      data: {
        companyId: parentCompanyId,
        type: 'SUBSIDIARY_CREATED',
        payload: {
          parentCompanyId,
          subsidiaryId: subsidiary.id,
          subsidiaryName: subsidiary.name,
        },
      },
    });

    this.logger.log(
      `Created authoritative subsidiary ${subsidiary.name} (${subsidiary.id}) under parent ${parentCompany.name} (${parentCompany.id})`,
    );

    return {
      subsidiary,
      parentCompanyId,
      parentCompanyName: parentCompany.name,
      spatialCampusProvisioned: true,
    };
  }

  /**
   * Provisions or reconciles the company's dedicated spatial campus,
   * building, floors, rooms, workspaces, parking, and initial fleet.
   * Completely idempotent, failure-isolated, and retriable.
   */
  async provisionCompanyCampus(
    companyId: string,
    options?: ProvisionCompanyOptions,
    ceoId?: string,
  ) {
    const results = {
      capacityReconciliation: null as any,
      parkingAllocated: false,
      fleetCount: 0,
    };

    if (this.hqCapacityService) {
      results.capacityReconciliation = await this.hqCapacityService.reconcileCompanyCapacity(companyId);
    }

    if (this.vehicleService) {
      // Ensure parking area exists on campus
      const site = await this.prisma.v12SpatialSite.findFirst({ where: { companyId } });
      const existingParking = site
        ? await this.prisma.v12SpatialParkingArea.findFirst({ where: { siteId: site.id } })
        : null;

      if (!existingParking) {
        await this.vehicleService.allocateParkingSlot(companyId);
        results.parkingAllocated = true;
      }

      if (options?.initialFleetCount && options.initialFleetCount > 0) {
        let fleetCeoId = ceoId;
        if (!fleetCeoId) {
          const ceo = await this.prisma.employee.findFirst({
            where: { companyId, status: 'ACTIVE', role: { title: 'CEO' } },
          });
          fleetCeoId = ceo?.id;
        }

        if (fleetCeoId) {
          const existingVehicles = await this.prisma.v12SpatialVehicle.findMany({ where: { companyId } });
          const deficit = Math.max(0, options.initialFleetCount - existingVehicles.length);
          if (deficit > 0) {
            await this.vehicleService.autoProvisionFleet(companyId, fleetCeoId, { count: deficit });
            results.fleetCount = deficit;
          }
        }
      }
    }

    if (this.eventService) {
      const company = await this.prisma.company.findUnique({ where: { id: companyId } });
      if (company) {
        const envelope = this.eventService.createEventEnvelope(
          'SPATIAL_CAMPUS_PROVISIONED',
          company.id,
          V12EntityType.CAMPUS,
          { companyId: company.id, name: company.name, status: company.status },
          company.id,
        );
        await this.eventService.broadcastEvent(company.id, envelope);
      }
    }

    return results;
  }


  /**
   * Retrieves all subsidiary companies for a parent company.
   */
  async getSubsidiaries(parentCompanyId: string) {
    const parentCompany = await this.prisma.company.findUnique({
      where: { id: parentCompanyId },
    });
    if (!parentCompany) {
      throw new NotFoundException(`Parent company ${parentCompanyId} not found`);
    }

    const candidates = await this.prisma.company.findMany({
      where: {
        OR: [
          parentCompany.groupId
            ? { groupId: parentCompany.groupId, NOT: { id: parentCompanyId } }
            : { description: { contains: parentCompanyId }, NOT: { id: parentCompanyId } },
          { description: { contains: parentCompanyId }, NOT: { id: parentCompanyId } },
        ],
      },
      include: {
        departments: true,
        employees: {
          select: { id: true, name: true, status: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return candidates.filter((c) => {
      if (c.id === parentCompanyId) return false;
      if (c.description?.includes(parentCompanyId)) return true;
      if (parentCompany.groupId && c.groupId === parentCompany.groupId) return true;
      return false;
    });
  }

  /**
   * Unified auto-provisioning entrypoint supporting both standalone
   * companies and subsidiary companies with full spatial campus deployment.
   */
  async autoProvisionCompany(actorId: string, dto: AutoProvisionCompanyDto) {
    if (dto.parentCompanyId) {
      return this.createSubsidiary(dto.parentCompanyId, actorId, dto);
    }

    const company = await this.createCompany(
      dto.name,
      dto.legalName || `${dto.name} Ltd.`,
      dto.description || '',
      actorId,
      dto.groupId,
      {
        initialDepartments: dto.initialDepartments || ['Engineering', 'Operations'],
        initialFleetCount: dto.initialFleetCount,
      },
    );

    return {
      company,
      spatialCampusProvisioned: true,
    };
  }

  async getCompany(id: string) {
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: {
        departments: true,
        employees: true,
      },
    });
    if (!company) throw new NotFoundException('Company not found');
    return company;
  }

  async listCompanies() {
    return this.prisma.company.findMany();
  }

  async updateCompany(id: string, updates: { name?: string; legalName?: string; description?: string }) {
    const res = await this.prisma.company.update({
      where: { id },
      data: updates,
    });
    return res;
  }

  async pauseCompany(id: string) {
    const company = await this.getCompany(id);
    if (company.status !== CompanyStatus.ACTIVE) throw new BadRequestException('Company must be ACTIVE to pause');

    const res = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.company.update({
        where: { id },
        data: { status: CompanyStatus.PAUSED },
      });
      await tx.companyEvent.create({
        data: { companyId: id, type: 'COMPANY_PAUSED', payload: {} },
      });
      return updated;
    });
    return res;
  }

  async resumeCompany(id: string) {
    const company = await this.getCompany(id);
    if (company.status !== CompanyStatus.PAUSED) throw new BadRequestException('Company must be PAUSED to resume');

    const res = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.company.update({
        where: { id },
        data: { status: CompanyStatus.ACTIVE },
      });
      await tx.companyEvent.create({
        data: { companyId: id, type: 'COMPANY_RESUMED', payload: {} },
      });
      return updated;
    });
    return res;
  }

  async closeCompany(id: string) {
    const company = await this.getCompany(id);
    if (company.status === CompanyStatus.CLOSED) throw new BadRequestException('Company is already CLOSED');

    const res = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.company.update({
        where: { id },
        data: { status: CompanyStatus.CLOSED },
      });
      await tx.companyEvent.create({
        data: { companyId: id, type: 'COMPANY_CLOSED', payload: {} },
      });
      return updated;
    });
    return res;
  }
}
