import { ServiceUnavailableException, ForbiddenException } from '@nestjs/common';
import { WorldStateGatewayService } from './world-state-gateway.service';
import { WORLD_STATE_CONTRACT_VERSION } from './contracts/world-state.contracts';

describe('WorldStateGatewayService', () => {
  const prisma: any = {
    $queryRawUnsafe: jest.fn(),
    $executeRawUnsafe: jest.fn(),
    $transaction: jest.fn(),
    company: { findMany: jest.fn() },
    companyEvent: { findMany: jest.fn(), count: jest.fn() },
  };
  const authorization: any = { checkPermission: jest.fn() };
  let service: WorldStateGatewayService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new WorldStateGatewayService(prisma, authorization);
  });

  it('returns an explicit versioned world state and checkpoint', async () => {
    prisma.$queryRawUnsafe
      .mockResolvedValueOnce([{ world_id:'v12:employee:e1', enterprise_type:'Employee', enterprise_id:'e1', entity_type:'EMPLOYEE', state:{canonicalAevoraId:'e1'}, version:2, stream_key:'company:c/employee/e1', updated_at:new Date() }])
      .mockResolvedValueOnce([{ global_checkpoint: 2, stream_versions: { 'company:c/employee/e1': 2 }, updated_at:new Date() }])
      .mockResolvedValueOnce([{ status:'HEALTHY', authoritative_checkpoint:2, materialized_checkpoint:2, last_audit_at:new Date(), last_error:null }]);
    const state = await service.getState('c');
    expect(state.contractVersion).toBe(WORLD_STATE_CONTRACT_VERSION);
    expect(state.entities[0].identity.enterpriseId).toBe('e1');
    expect(state.globalCheckpoint).toBe(2);
    expect(state.degraded).toBe(false);
  });

  it('never authorizes a world command by physical/world identity alone', async () => {
    prisma.$queryRawUnsafe.mockResolvedValueOnce([{ status:'HEALTHY', last_audit_at:new Date() }]);
    authorization.checkPermission.mockRejectedValueOnce(new ForbiddenException('missing permission'));
    await expect(service.requestEnterpriseChange({
      companyId:'company-a', actorId:'employee-a', action:'MOVE_EMPLOYEE',
      target:{ enterpriseType:'Employee', enterpriseId:'employee-b', companyId:'company-b' },
      parameters:{ worldId:'v12:employee:employee-b' }, correlationId:'c1'
    })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('blocks enterprise mutation requests while reconciliation is stale', async () => {
    prisma.$queryRawUnsafe.mockResolvedValueOnce([{ status:'STALE', last_audit_at:new Date() }]);
    await expect(service.requestEnterpriseChange({
      companyId:'c', actorId:'a', action:'MANAGE_EMPLOYEES', parameters:{}, correlationId:'c1'
    })).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(authorization.checkPermission).not.toHaveBeenCalled();
  });

  it('blocks enterprise mutation requests while degraded', async () => {
    prisma.$queryRawUnsafe.mockResolvedValueOnce([{ status:'DEGRADED', last_audit_at:new Date() }]);
    await expect(service.requestEnterpriseChange({
      companyId:'c', actorId:'a', action:'MANAGE_EMPLOYEES', parameters:{}, correlationId:'c1'
    })).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('is idempotent on an already-ingested authoritative source event', async () => {
    prisma.$queryRawUnsafe
      .mockResolvedValueOnce([{ status:'HEALTHY', last_audit_at:new Date() }])
      .mockResolvedValueOnce([{ event_id:'gateway-event-1', global_checkpoint:7, stream_key:'s', stream_sequence:4 }]);
    const delta = await service.ingestAuthoritativeEvent({
      id:'source-1', companyId:'c', type:'EMPLOYEE_HIRED', payload:{ employeeId:'e1' }, createdAt:new Date()
    });
    expect(delta.eventId).toBe('gateway-event-1');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('enumerates company ids from the authoritative Company table only', async () => {
    prisma.company.findMany.mockResolvedValue([{id:'a'},{id:'b'}]);
    await expect(service.listCompanyIds()).resolves.toEqual(['a','b']);
  });

  it('maps canonical enterprise identity to an independent world id', () => {
    const identity = (service as any).resolveIdentity('EMPLOYEE_HIRED', { employeeId:'e1' });
    expect(identity.enterpriseId).toBe('e1');
    expect(identity.worldId).toBe('v12:employee:e1');
    expect(identity.entityType).toBe('EMPLOYEE');
    expect(identity.worldId).not.toBe(identity.enterpriseId);
  });

  it('does not invent a world entity for an unrelated enterprise event', () => {
    const identity = (service as any).resolveIdentity('PAYROLL_RUN_COMPLETED', { payrollRunId:'p1' });
    expect(identity).toBeNull();
  });

  it('uses hierarchical stream keys', () => {
    expect((service as any).streamKey('c','Employee','e1')).toBe('company/c/employee/e1');
  });

  it('reconciliation marks state stale when authoritative history exceeds materialized checkpoint', async () => {
    prisma.$executeRawUnsafe.mockResolvedValue(1);
    prisma.companyEvent.count.mockResolvedValue(10);
    prisma.$queryRawUnsafe
      .mockResolvedValueOnce([{ global_checkpoint:8, stream_versions:{}, updated_at:new Date() }])
      .mockResolvedValueOnce([{ status:'STALE', authoritative_checkpoint:10, materialized_checkpoint:8, last_audit_at:new Date(), last_error:null }]);
    const result = await service.reconcile('c');
    expect(result.status).toBe('STALE');
    expect(result.authoritativeCheckpoint).toBe(10);
    expect(result.materializedCheckpoint).toBe(8);
  });
});
