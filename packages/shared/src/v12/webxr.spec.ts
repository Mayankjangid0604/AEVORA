import { detectWebXRCapability, WebXRSessionManager, XRControllerAction, XRSystemLike, XRSessionLike, resolveRayTarget } from './webxr';

function makeFakeSession(): XRSessionLike & { listeners: Map<string, ((e: any) => void)[]>; emit: (type: string, event?: any) => void } {
  const listeners = new Map<string, ((e: any) => void)[]>();
  return {
    listeners,
    inputSources: [],
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type)!.push(listener);
    },
    removeEventListener(type, listener) {
      listeners.set(type, (listeners.get(type) ?? []).filter((l) => l !== listener));
    },
    async end() {
      for (const l of listeners.get('end') ?? []) l({});
    },
    emit(type, event = {}) {
      for (const l of listeners.get(type) ?? []) l(event);
    },
  };
}

describe('detectWebXRCapability', () => {
  it('reports NO_XR_API when navigator.xr is undefined (desktop browser without WebXR)', async () => {
    const result = await detectWebXRCapability(undefined);
    expect(result).toEqual({ supported: false, reason: 'NO_XR_API' });
  });

  it('reports NO_XR_API when navigator.xr is null', async () => {
    const result = await detectWebXRCapability(null);
    expect(result).toEqual({ supported: false, reason: 'NO_XR_API' });
  });

  it('reports supported: true when isSessionSupported resolves true (a real headset is present)', async () => {
    const xr: XRSystemLike = { isSessionSupported: async () => true, requestSession: jest.fn() };
    expect(await detectWebXRCapability(xr)).toEqual({ supported: true });
  });

  it('reports NOT_SUPPORTED when isSessionSupported resolves false', async () => {
    const xr: XRSystemLike = { isSessionSupported: async () => false, requestSession: jest.fn() };
    expect(await detectWebXRCapability(xr)).toEqual({ supported: false, reason: 'NOT_SUPPORTED' });
  });

  it('never throws: reports DETECTION_FAILED if isSessionSupported itself rejects', async () => {
    const xr: XRSystemLike = { isSessionSupported: async () => { throw new Error('boom'); }, requestSession: jest.fn() };
    expect(await detectWebXRCapability(xr)).toEqual({ supported: false, reason: 'DETECTION_FAILED' });
  });
});

describe('WebXRSessionManager', () => {
  it('session lifecycle: INACTIVE -> REQUESTING -> ACTIVE -> ENDED', async () => {
    const fakeSession = makeFakeSession();
    const xr: XRSystemLike = { isSessionSupported: async () => true, requestSession: async () => fakeSession };
    const manager = new WebXRSessionManager(xr);
    const states: string[] = [];
    manager.onStateChange((s) => states.push(s));

    expect(manager.getState()).toBe('INACTIVE');
    const enterPromise = manager.enterVR();
    expect(states).toContain('REQUESTING');
    await enterPromise;
    expect(manager.getState()).toBe('ACTIVE');

    await manager.exitVR();
    expect(manager.getState()).toBe('ENDED');
    expect(states).toEqual(['REQUESTING', 'ACTIVE', 'ENDED']);
  });

  it('transitions to ERROR when requestSession rejects, and never claims ACTIVE', async () => {
    const xr: XRSystemLike = { isSessionSupported: async () => true, requestSession: async () => { throw new Error('user declined'); } };
    const manager = new WebXRSessionManager(xr);
    await expect(manager.enterVR()).rejects.toThrow('user declined');
    expect(manager.getState()).toBe('ERROR');
  });

  it('rejects a second enterVR() while a session is already active', async () => {
    const fakeSession = makeFakeSession();
    const xr: XRSystemLike = { isSessionSupported: async () => true, requestSession: async () => fakeSession };
    const manager = new WebXRSessionManager(xr);
    await manager.enterVR();
    await expect(manager.enterVR()).rejects.toThrow();
  });

  it('translates real selectstart/selectend/squeezestart/squeezeend events into the abstract action vocabulary, with handedness', async () => {
    const fakeSession = makeFakeSession();
    const xr: XRSystemLike = { isSessionSupported: async () => true, requestSession: async () => fakeSession };
    const manager = new WebXRSessionManager(xr);
    const actions: any[] = [];
    manager.onAction((e) => actions.push(e));

    await manager.enterVR();
    fakeSession.emit('selectstart', { inputSource: { handedness: 'right' } });
    fakeSession.emit('selectend', { inputSource: { handedness: 'right' } });
    fakeSession.emit('squeezestart', { inputSource: { handedness: 'left' } });

    expect(actions).toEqual([
      { action: XRControllerAction.SELECT, handedness: 'right', phase: 'start' },
      { action: XRControllerAction.SELECT, handedness: 'right', phase: 'end' },
      { action: XRControllerAction.SQUEEZE, handedness: 'left', phase: 'start' },
    ]);
  });

  it('exitVR() on a session that was never entered is a safe no-op', async () => {
    const xr: XRSystemLike = { isSessionSupported: async () => true, requestSession: jest.fn() };
    const manager = new WebXRSessionManager(xr);
    await expect(manager.exitVR()).resolves.toBeUndefined();
    expect(manager.getState()).toBe('INACTIVE');
  });

  it('an unsubscribed action handler no longer receives events', async () => {
    const fakeSession = makeFakeSession();
    const xr: XRSystemLike = { isSessionSupported: async () => true, requestSession: async () => fakeSession };
    const manager = new WebXRSessionManager(xr);
    const actions: any[] = [];
    const unsubscribe = manager.onAction((e) => actions.push(e));
    await manager.enterVR();
    unsubscribe();
    fakeSession.emit('selectstart', { inputSource: { handedness: 'right' } });
    expect(actions).toHaveLength(0);
  });
});

describe('resolveRayTarget', () => {
  const straightAhead = { origin: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: 1 } };

  it('resolves the entity the ray actually passes through', () => {
    const candidates = [{ entityId: 'emp-1', position: { x: 0, y: 0, z: 5 }, radius: 0.6 }];
    expect(resolveRayTarget(straightAhead, candidates)).toBe('emp-1');
  });

  it('returns null when the ray hits nothing — never guesses a target', () => {
    const candidates = [{ entityId: 'emp-1', position: { x: 10, y: 0, z: 5 }, radius: 0.6 }]; // far off to the side
    expect(resolveRayTarget(straightAhead, candidates)).toBeNull();
  });

  it('returns null for an empty candidate list', () => {
    expect(resolveRayTarget(straightAhead, [])).toBeNull();
  });

  it('ignores a candidate behind the ray origin', () => {
    const candidates = [{ entityId: 'behind', position: { x: 0, y: 0, z: -5 }, radius: 0.6 }];
    expect(resolveRayTarget(straightAhead, candidates)).toBeNull();
  });

  it('picks the closest of two candidates along the ray, deterministically', () => {
    const candidates = [
      { entityId: 'far', position: { x: 0, y: 0, z: 10 }, radius: 0.6 },
      { entityId: 'near', position: { x: 0, y: 0, z: 3 }, radius: 0.6 },
    ];
    expect(resolveRayTarget(straightAhead, candidates)).toBe('near');
  });

  it('breaks an exact-tie in distance deterministically by entityId', () => {
    const candidates = [
      { entityId: 'zzz', position: { x: 0, y: 0, z: 5 }, radius: 0.6 },
      { entityId: 'aaa', position: { x: 0, y: 0, z: 5 }, radius: 0.6 },
    ];
    expect(resolveRayTarget(straightAhead, candidates)).toBe('aaa');
  });

  it('is deterministic: identical inputs always produce the identical result', () => {
    const candidates = [{ entityId: 'emp-1', position: { x: 0, y: 0, z: 5 }, radius: 0.6 }];
    const results = new Set(Array.from({ length: 10 }, () => resolveRayTarget(straightAhead, candidates)));
    expect(results.size).toBe(1);
  });
});
