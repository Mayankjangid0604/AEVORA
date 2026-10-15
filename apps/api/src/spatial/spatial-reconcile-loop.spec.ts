import { Subject } from 'rxjs';
import { V12EntityType, V12EventType } from '@aevora/shared';
import { V12SpatialService } from './spatial.service';
import { HQ_CAPACITY_RECONCILE_ORIGIN } from './hq-capacity.service';

/**
 * Regression: HqCapacityService re-broadcasts a PERSON event for every employee on each reconcile.
 * If SpatialService reacts to those by reconciling again, the API spins forever (CPU + DB writes).
 */
describe('SpatialService reconcile feedback loop guard', () => {
  const build = () => {
    const stream = new Subject<any>();
    const service = new V12SpatialService(
      {} as any,
      { getGlobalStream: () => stream } as any,
      {} as any,
      {} as any,
    );
    const trigger = jest.spyOn(service, 'triggerEmployeeReconciliation').mockImplementation(() => undefined);
    const handle = jest.spyOn(service, 'handlePersonActivityChange').mockResolvedValue(undefined as any);
    service.onModuleInit();
    return { stream, service, trigger, handle };
  };

  const personEvent = (payload: any) => ({
    companyId: 'c1',
    event: {
      eventId: 'e1',
      eventType: V12EventType.ENTITY_UPDATED,
      entityType: V12EntityType.PERSON,
      entityId: 'v12_person_emp1',
      payload,
    },
  });

  it('ignores PERSON events emitted by the capacity reconciler', () => {
    const { stream, service, trigger, handle } = build();
    stream.next(personEvent({ spatialState: 'AT_WORKSPACE', origin: HQ_CAPACITY_RECONCILE_ORIGIN }));
    stream.next(personEvent({ statusChanged: 'TERMINATED', origin: HQ_CAPACITY_RECONCILE_ORIGIN }));
    expect(trigger).not.toHaveBeenCalled();
    expect(handle).not.toHaveBeenCalled();
    service.onModuleDestroy();
  });

  it('still reconciles for genuine PERSON events from other sources', () => {
    const { stream, service, trigger, handle } = build();
    stream.next(personEvent({ currentActivity: 'WORKING', originalEvent: 'TASK_STARTED' }));
    expect(trigger).toHaveBeenCalledWith('emp1');
    expect(handle).toHaveBeenCalledTimes(1);
    service.onModuleDestroy();
  });
});
