import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizationService } from '../authorization/authorization.service';
import {
  IdentityMapping,
  ReconciliationState,
  WORLD_STATE_CONTRACT_VERSION,
  WorldCheckpoint,
  WorldDelta,
  WorldEntity,
  WorldEventEnvelope,
  WorldGatewayCommandRequest,
  WorldSnapshot,
  WorldState,
} from './contracts/world-state.contracts';

type AuthoritativeEvent = {
  id: string;
  companyId: string;
  type: string;
  payload: Record<string, any>;
  createdAt: Date;
};

type SqlRow = Record<string, any>;

@Injectable()
export class WorldStateGatewayService {
  private readonly logger = new Logger(WorldStateGatewayService.name);
  private readonly staleAfterMs = Number(process.env.V12_WSG_STALE_AFTER_MS ?? 30_000);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}

  private async ensureReady(companyId: string) {
    const rows = await this.prisma.$queryRawUnsafe<SqlRow[]>(
      'SELECT "status", "last_audit_at" FROM "v12_world_reconciliation_state" WHERE "company_id" = $1',
      companyId,
    );
    const row = rows[0];
    if (!row) {
      await this.prisma.$executeRawUnsafe(
        'INSERT INTO "v12_world_reconciliation_state" ("company_id","status","authoritative_checkpoint","materialized_checkpoint","last_audit_at") VALUES ($1,$2,0,0,NOW())',
        companyId,
        'HEALTHY',
      );
      return;
    }
    if (row.status === 'DEGRADED' || row.status === 'STALE' || row.status === 'FAILED') throw new ServiceUnavailableException('V12 World-State Gateway is read-only while reconciliation is unsafe');
  }

  async listCompanyIds(): Promise<string[]> { const rows = await this.prisma.company.findMany({ select: { id: true } }); return rows.map((r) => r.id); }\n\n  async getState(companyId: string): Promise<WorldState> {
    const stateRows = await this.prisma.$queryRawUnsafe<SqlRow[]>(
      'SELECT "world_id","enterprise_type","enterprise_id","entity_type","state","version","stream_key","updated_at" FROM "v12_world_entity_state" WHERE "company_id" = $1 ORDER BY "stream_key","world_id"',
      companyId,
    );
    const checkpoint = await this.getCheckpoint(companyId);
    const reconciliation = await this.getReconciliation(companyId);
    const stale = reconciliation.status === 'STALE' || Date.now() - new Date(reconciliation.lastAuditAt ?? 0).getTime() > this.staleAfterMs;
    return {
      contractVersion: WORLD_STATE_CONTRACT_VERSION,
      companyId,
      globalCheckpoint: checkpoint.globalCheckpoint,
      entities: stateRows.map((r) => this.toEntity(r)),
      stale,
      degraded: reconciliation.status === 'DEGRADED',
      reconciliationState: stale && reconciliation.status === 'HEALTHY' ? 'STALE' : reconciliation.status,
    };
  }

  async getCheckpoint(companyId: string): Promise<WorldCheckpoint> {
    const rows = await this.prisma.$queryRawUnsafe<SqlRow[]>(
      'SELECT "global_checkpoint","stream_versions","updated_at" FROM "v12_world_checkpoint" WHERE "company_id" = $1',
      companyId,
    );
    const row = rows[0] ?? { global_checkpoint: 0, stream_versions: {}, updated_at: new Date() };
    return {
      companyId,
      globalCheckpoint: Number(row.global_checkpoint),
      streamVersions: row.stream_versions ?? {},
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  async getReconciliation(companyId: string): Promise<ReconciliationState> {
    const rows = await this.prisma.$queryRawUnsafe<SqlRow[]>(
      'SELECT "status","authoritative_checkpoint","materialized_checkpoint","last_audit_at","last_error" FROM "v12_world_reconciliation_state" WHERE "company_id" = $1',
      companyId,
    );
    const row = rows[0] ?? {};
    return {
      companyId,
      status: row.status ?? 'HEALTHY',
      authoritativeCheckpoint: Number(row.authoritative_checkpoint ?? 0),
      materializedCheckpoint: Number(row.materialized_checkpoint ?? 0),
      lastAuditAt: row.last_audit_at ? new Date(row.last_audit_at).toISOString() : null,
      lastError: row.last_error ?? null,
    };
  }

  async consumeAuthoritativeEvents(companyId: string, limit = 100): Promise<WorldDelta[]> {
    await this.ensureReady(companyId);
    const cursor = await this.prisma.$queryRawUnsafe<SqlRow[]>(
      'SELECT "last_source_created_at","last_source_event_id" FROM "v12_world_ingest_cursor" WHERE "company_id" = $1',
      companyId,
    );
    const c = cursor[0];
    const events = await this.prisma.companyEvent.findMany({
      where: {
        companyId,
        ...(c?.last_source_created_at
          ? {
              OR: [
                { createdAt: { gt: new Date(c.last_source_created_at) } },
                { createdAt: new Date(c.last_source_created_at), id: { gt: c.last_source_event_id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit,
    });
    const deltas: WorldDelta[] = [];
    for (const event of events as AuthoritativeEvent[]) {
      deltas.push(await this.ingestAuthoritativeEvent(event));
    }
    return deltas;
  }

  async ingestAuthoritativeEvent(event: AuthoritativeEvent): Promise<WorldDelta> {
    await this.ensureReady(event.companyId);
    const sourceEventId = event.id;
    const existing = await this.prisma.$queryRawUnsafe<SqlRow[]>(
      'SELECT "event_id","global_checkpoint","stream_key","stream_sequence" FROM "v12_world_event" WHERE "source_event_id" = $1',
      sourceEventId,
    );
    if (existing[0]) return this.buildDeltaFromEvent(event.companyId, existing[0].event_id);

    const payload = event.payload ?? {};
    const identity = this.resolveIdentity(event.type, payload);
    const streamKey = this.streamKey(event.companyId, identity?.enterpriseType ?? 'EVENT', identity?.enterpriseId ?? event.id);
    const eventId = randomUUID();
    const correlationId = String(payload.correlationId ?? event.id);
    const causationId = String(payload.causationId ?? event.id);

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        'INSERT INTO "v12_world_checkpoint" ("company_id","global_checkpoint","stream_versions","updated_at") VALUES ($1,0,$2,NOW()) ON CONFLICT ("company_id") DO NOTHING',
        event.companyId,
        JSON.stringify({}),
      );
      const cp = await tx.$queryRawUnsafe<SqlRow[]>(
        'SELECT "global_checkpoint","stream_versions" FROM "v12_world_checkpoint" WHERE "company_id" = $1 FOR UPDATE',
        event.companyId,
      );
      const globalCheckpoint = Number(cp[0].global_checkpoint) + 1;

      await tx.$executeRawUnsafe(
        'INSERT INTO "v12_world_stream_checkpoint" ("company_id","stream_key","stream_sequence","updated_at") VALUES ($1,$2,0,NOW()) ON CONFLICT ("company_id","stream_key") DO NOTHING',
        event.companyId,
        streamKey,
      );
      const sc = await tx.$queryRawUnsafe<SqlRow[]>(
        'SELECT "stream_sequence" FROM "v12_world_stream_checkpoint" WHERE "company_id" = $1 AND "stream_key" = $2 FOR UPDATE',
        event.companyId,
        streamKey,
      );
      const streamSequence = Number(sc[0].stream_sequence) + 1;

      await tx.$executeRawUnsafe(
        'INSERT INTO "v12_world_event" ("event_id","source_event_id","company_id","stream_key","stream_sequence","global_checkpoint","event_type","occurred_at","ingested_at","correlation_id","causation_id","enterprise_type","enterprise_id","world_id","payload") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),$9,$10,$11,$12,$13,$14)',
        eventId, sourceEventId, event.companyId, streamKey, streamSequence, globalCheckpoint,
        event.type, event.createdAt, correlationId, causationId,
        identity?.enterpriseType ?? null, identity?.enterpriseId ?? null, identity?.worldId ?? null,
        JSON.stringify(payload),
      );
      await tx.$executeRawUnsafe(
        'UPDATE "v12_world_stream_checkpoint" SET "stream_sequence"=$3,"updated_at"=NOW() WHERE "company_id"=$1 AND "stream_key"=$2',
        event.companyId, streamKey, streamSequence,
      );
      await tx.$executeRawUnsafe(
        'UPDATE "v12_world_checkpoint" SET "global_checkpoint"=$2,"stream_versions" = "stream_versions" || $3::jsonb,"updated_at"=NOW() WHERE "company_id"=$1',
        event.companyId, globalCheckpoint, JSON.stringify({ [streamKey]: streamSequence }),
      );

      if (identity) {
        const state = await this.materializeIdentity(tx, event, identity);
        await tx.$executeRawUnsafe(
          'INSERT INTO "v12_world_entity_state" ("world_id","company_id","enterprise_type","enterprise_id","entity_type","state","version","stream_key","updated_at") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW()) ON CONFLICT ("world_id") DO UPDATE SET "state"=EXCLUDED."state","version"=EXCLUDED."version","stream_key"=EXCLUDED."stream_key","updated_at"=NOW()',
          identity.worldId, event.companyId, identity.enterpriseType, identity.enterpriseId,
          identity.entityType, JSON.stringify(state), streamSequence, streamKey,
        );
        await tx.$executeRawUnsafe(
          'INSERT INTO "v12_world_identity_mapping" ("world_id","company_id","enterprise_type","enterprise_id","entity_type","mapping_version","updated_at") VALUES ($1,$2,$3,$4,$5,1,NOW()) ON CONFLICT ("enterprise_type","enterprise_id") DO UPDATE SET "world_id"=EXCLUDED."world_id","entity_type"=EXCLUDED."entity_type","mapping_version"="v12_world_identity_mapping"."mapping_version"+1,"updated_at"=NOW()',
          identity.worldId, event.companyId, identity.enterpriseType, identity.enterpriseId, identity.entityType,
        );
      }
      await tx.$executeRawUnsafe(
        'INSERT INTO "v12_world_ingest_cursor" ("company_id","last_source_created_at","last_source_event_id","updated_at") VALUES ($1,$2,$3,NOW()) ON CONFLICT ("company_id") DO UPDATE SET "last_source_created_at"=EXCLUDED."last_source_created_at","last_source_event_id"=EXCLUDED."last_source_event_id","updated_at"=NOW()',
        event.companyId, event.createdAt, event.id,
      );
      await tx.$executeRawUnsafe(
        'UPDATE "v12_world_reconciliation_state" SET "materialized_checkpoint"=$2,"authoritative_checkpoint"=$2,"status"=$3,"last_audit_at"=NOW(),"last_error"=NULL WHERE "company_id"=$1',
        event.companyId, globalCheckpoint, 'HEALTHY',
      );
      return {
        contractVersion: WORLD_STATE_CONTRACT_VERSION,
        eventId, companyId: event.companyId, globalCheckpoint, streamKey, streamSequence,
        changed: identity ? [await this.loadEntity(tx, identity.worldId)] : [],
        removedWorldIds: [],
        stale: false, degraded: false,
      };
    });
  }

  async replay(companyId: string, fromCheckpoint = 0): Promise<WorldDelta[]> {
    const events = await this.prisma.$queryRawUnsafe<SqlRow[]>(
      'SELECT "event_id","global_checkpoint","stream_key","stream_sequence" FROM "v12_world_event" WHERE "company_id"=$1 AND "global_checkpoint">$2 ORDER BY "global_checkpoint" ASC',
      companyId, fromCheckpoint,
    );
    return Promise.all(events.map((e) => this.buildDeltaFromEvent(companyId, e.event_id)));
  }

  async createSnapshot(companyId: string, scope: 'GLOBAL'|'COMPANY'|'STREAM' = 'COMPANY', scopeKey = companyId): Promise<WorldSnapshot> {
    const state = await this.getState(companyId);
    const snapshotId = randomUUID();
    await this.prisma.$executeRawUnsafe(
      'INSERT INTO "v12_world_snapshot" ("snapshot_id","company_id","scope","scope_key","global_checkpoint","stream_versions","state","created_at") VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())',
      snapshotId, companyId, scope, scopeKey, state.globalCheckpoint, JSON.stringify((await this.getCheckpoint(companyId)).streamVersions), JSON.stringify(state),
    );
    return { contractVersion: WORLD_STATE_CONTRACT_VERSION, snapshotId, companyId, scope, scopeKey, globalCheckpoint: state.globalCheckpoint, streamVersions: (await this.getCheckpoint(companyId)).streamVersions, state, createdAt: new Date().toISOString() };
  }

  async restoreSnapshot(companyId: string, snapshotId: string) {
    const rows = await this.prisma.$queryRawUnsafe<SqlRow[]>(
      'SELECT "state","global_checkpoint","stream_versions" FROM "v12_world_snapshot" WHERE "snapshot_id"=$1 AND "company_id"=$2',
      snapshotId, companyId,
    );
    if (!rows[0]) throw new BadRequestException('Snapshot not found');
    const state = rows[0].state as WorldState;
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('DELETE FROM "v12_world_entity_state" WHERE "company_id"=$1', companyId);
      for (const entity of state.entities) {
        await tx.$executeRawUnsafe(
          'INSERT INTO "v12_world_entity_state" ("world_id","company_id","enterprise_type","enterprise_id","entity_type","state","version","stream_key","updated_at") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())',
          entity.identity.worldId, companyId, entity.identity.enterpriseType, entity.identity.enterpriseId, entity.identity.entityType,
          JSON.stringify(entity.state), entity.version, entity.streamKey,
        );
      }
      await tx.$executeRawUnsafe(
        'INSERT INTO "v12_world_checkpoint" ("company_id","global_checkpoint","stream_versions","updated_at") VALUES ($1,$2,$3,NOW()) ON CONFLICT ("company_id") DO UPDATE SET "global_checkpoint"=EXCLUDED."global_checkpoint","stream_versions"=EXCLUDED."stream_versions","updated_at"=NOW()',
        companyId, rows[0].global_checkpoint, JSON.stringify(rows[0].stream_versions),
      );
    });
    return this.getState(companyId);
  }

  async reconcile(companyId: string): Promise<ReconciliationState> {
    await this.prisma.$executeRawUnsafe(
      'UPDATE "v12_world_reconciliation_state" SET "status"=$2,"last_audit_at"=NOW() WHERE "company_id"=$1',
      companyId, 'RECONCILING',
    );
    try {
      const authoritative = await this.prisma.companyEvent.count({ where: { companyId } });
      const materialized = Number((await this.getCheckpoint(companyId)).globalCheckpoint);
      const gaps = await this.prisma.$queryRawUnsafe<SqlRow[]>(
        'SELECT "stream_key" FROM "v12_world_event" WHERE "company_id"=$1 GROUP BY "stream_key" HAVING COUNT(*) <> MAX("stream_sequence")',
        companyId,
      );
      const status = gaps.length > 0 ? 'DEGRADED' : materialized >= authoritative ? 'HEALTHY' : 'STALE';
      await this.prisma.$executeRawUnsafe(
        'UPDATE "v12_world_reconciliation_state" SET "status"=$2,"authoritative_checkpoint"=$3,"materialized_checkpoint"=$4,"last_audit_at"=NOW(),"last_error"=$5 WHERE "company_id"=$1',
        companyId, status, authoritative, materialized, gaps.length ? 'sequence gap detected' : null,
      );
      return this.getReconciliation(companyId);
    } catch (error: any) {
      await this.prisma.$executeRawUnsafe(
        'UPDATE "v12_world_reconciliation_state" SET "status"=$2,"last_audit_at"=NOW(),"last_error"=$3 WHERE "company_id"=$1',
        companyId, 'FAILED', error?.message ?? String(error),
      );
      throw error;
    }
  }

  async requestEnterpriseChange(request: Omit<WorldGatewayCommandRequest, 'contractVersion'|'requestId'>) {
    const { companyId, actorId, action } = request;
    await this.ensureReady(companyId);
    if (!actorId || !action) throw new BadRequestException('actorId and action are required');
    await this.authorization.checkPermission(actorId, action, companyId);
    const requestId = randomUUID();
    const correlationId = request.correlationId || requestId;
    await this.prisma.$executeRawUnsafe(
      'INSERT INTO "v12_gateway_command_request" ("request_id","company_id","actor_id","action","target","parameters","correlation_id","status","created_at") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())',
      requestId, companyId, actorId, action, JSON.stringify(request.target ?? null), JSON.stringify(request.parameters ?? {}), correlationId, 'REQUESTED',
    );
    return { ...request, contractVersion: WORLD_STATE_CONTRACT_VERSION, requestId, correlationId, status: 'REQUESTED', authoritativeExecution: false };
  }

  private resolveIdentity(type: string, payload: Record<string, any>): IdentityMapping | null {
    const mappings: Record<string, { key: string; entityType: IdentityMapping['entityType']; enterpriseType: string }> = {
      COMPANY: { key: 'companyId', entityType: 'COMPANY', enterpriseType: 'Company' },
      EMPLOYEE: { key: 'employeeId', entityType: 'EMPLOYEE', enterpriseType: 'Employee' },
      DEPARTMENT: { key: 'departmentId', entityType: 'DEPARTMENT', enterpriseType: 'Department' },
      TASK: { key: 'taskId', entityType: 'TASK', enterpriseType: 'Task' },
      PROJECT: { key: 'projectId', entityType: 'PROJECT', enterpriseType: 'Project' },
    };
    const prefix = Object.keys(mappings).find((p) => type.startsWith(p) || type.includes(p));
    if (!prefix) return null;
    const m = mappings[prefix];
    const id = payload[m.key];
    if (!id) return null;
    return { enterpriseType: m.enterpriseType, enterpriseId: String(id), worldId: `v12:${m.enterpriseType.toLowerCase()}:${id}`, entityType: m.entityType, mappingVersion: 1 };
  }

  private streamKey(companyId: string, entityType: string, entityId: string) {
    return `company/${companyId}/${entityType.toLowerCase()}/${entityId}`;
  }

  private async materializeIdentity(tx: any, event: AuthoritativeEvent, identity: IdentityMapping) {
    const p = event.payload ?? {};
    switch (identity.enterpriseType) {
      case 'Company': {
        const c = await tx.company.findUnique({ where: { id: identity.enterpriseId }, select: { id:true,name:true,status:true,description:true }});
        return c ? { canonicalAevoraId:c.id, name:c.name, status:c.status, description:c.description } : { canonicalAevoraId:identity.enterpriseId, state:p };
      }
      case 'Employee': {
        const e = await tx.employee.findUnique({ where: { id: identity.enterpriseId }, select: { id:true,name:true,status:true,departmentId:true,roleId:true,activity:true,availability:true }});
        return e ? { canonicalAevoraId:e.id, name:e.name, status:e.status, departmentId:e.departmentId, roleId:e.roleId, activity:e.activity, availability:e.availability } : { canonicalAevoraId:identity.enterpriseId, state:p };
      }
      case 'Department': {
        const d = await tx.department.findUnique({ where: { id: identity.enterpriseId }, select: { id:true,name:true,status:true,companyId:true }});
        return d ? { canonicalAevoraId:d.id, name:d.name, status:d.status, companyId:d.companyId } : { canonicalAevoraId:identity.enterpriseId, state:p };
      }
      case 'Project': {
        const pr = await tx.project.findUnique({ where: { id: identity.enterpriseId }, select: { id:true,name:true,status:true,companyId:true }});
        return pr ? { canonicalAevoraId:pr.id, name:pr.name, status:pr.status, companyId:pr.companyId } : { canonicalAevoraId:identity.enterpriseId, state:p };
      }
      case 'Task': {
        const t = await tx.task.findUnique({ where: { id: identity.enterpriseId }, select: { id:true,title:true,status:true,progress:true,companyId:true,assignedEmployeeId:true }});
        return t ? { canonicalAevoraId:t.id, title:t.title, status:t.status, progress:t.progress, companyId:t.companyId, assignedEmployeeId:t.assignedEmployeeId } : { canonicalAevoraId:identity.enterpriseId, state:p };
      }
      default: return { canonicalAevoraId: identity.enterpriseId, state:p };
    }
  }

  private async loadEntity(tx: any, worldId: string): Promise<WorldEntity> {
    const rows = await tx.$queryRawUnsafe<SqlRow[]>(
      'SELECT "world_id","enterprise_type","enterprise_id","entity_type","state","version","stream_key","updated_at" FROM "v12_world_entity_state" WHERE "world_id"=$1',
      worldId,
    );
    if (!rows[0]) throw new BadRequestException('World entity missing after materialization');
    return this.toEntity(rows[0]);
  }

  private toEntity(r: SqlRow): WorldEntity {
    return {
      identity: { worldId:r.world_id, enterpriseType:r.enterprise_type, enterpriseId:r.enterprise_id, entityType:r.entity_type, mappingVersion:1 },
      state: r.state,
      version: Number(r.version),
      streamKey: r.stream_key,
      updatedAt: new Date(r.updated_at).toISOString(),
    };
  }

  private async buildDeltaFromEvent(companyId: string, eventId: string): Promise<WorldDelta> {
    const rows = await this.prisma.$queryRawUnsafe<SqlRow[]>(
      'SELECT "event_id","global_checkpoint","stream_key","stream_sequence","world_id" FROM "v12_world_event" WHERE "event_id"=$1 AND "company_id"=$2',
      eventId, companyId,
    );
    const e = rows[0];
    return {
      contractVersion: WORLD_STATE_CONTRACT_VERSION, eventId, companyId,
      globalCheckpoint:Number(e?.global_checkpoint ?? 0), streamKey:e?.stream_key ?? '',
      streamSequence:Number(e?.stream_sequence ?? 0),
      changed:e?.world_id ? (await this.getState(companyId)).entities.filter(x=>x.identity.worldId===e.world_id) : [],
      removedWorldIds:[], stale:false, degraded:false,
    };
  }
}
