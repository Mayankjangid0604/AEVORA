/**
 * Renderer-independent WebXR capability detection and session-lifecycle/controller-input
 * abstraction. Framework-agnostic (no React/Three import) so it's unit-testable without a browser
 * or headset — real XR objects (`navigator.xr`, `XRSession`) are injected, never reached into
 * globally, which is what makes capability-detection and session-lifecycle behavior testable here.
 *
 * This layer does NOT own any world/business state: it only detects capability, manages session
 * lifecycle, and translates raw XR input events into the same small, renderer-agnostic action
 * vocabulary used elsewhere in V12 (move/select/inspect/interact), so a VR session consumes the
 * exact same authoritative world representation the desktop renderer does — never a second world.
 */

/** The minimal shape of `navigator.xr` this module needs — lets tests inject a fake without touching the real global. */
export interface XRSystemLike {
  isSessionSupported(mode: 'immersive-vr' | 'immersive-ar'): Promise<boolean>;
  requestSession(mode: 'immersive-vr' | 'immersive-ar', options?: any): Promise<XRSessionLike>;
}

export interface XRSessionLike {
  end(): Promise<void>;
  addEventListener(type: string, listener: (event: any) => void): void;
  removeEventListener(type: string, listener: (event: any) => void): void;
  inputSources: Iterable<{ handedness: 'left' | 'right' | 'none' }>;
}

export type WebXRCapability =
  | { supported: true }
  | { supported: false; reason: 'NO_XR_API' | 'NOT_SUPPORTED' | 'DETECTION_FAILED' };

/** Real `navigator.xr?.isSessionSupported('immersive-vr')` check — never throws, always resolves. */
export async function detectWebXRCapability(xr: XRSystemLike | undefined | null): Promise<WebXRCapability> {
  if (!xr) return { supported: false, reason: 'NO_XR_API' };
  try {
    const supported = await xr.isSessionSupported('immersive-vr');
    return supported ? { supported: true } : { supported: false, reason: 'NOT_SUPPORTED' };
  } catch {
    return { supported: false, reason: 'DETECTION_FAILED' };
  }
}

export enum XRControllerAction {
  SELECT = 'SELECT',       // primary trigger — confirm/select/interact with a focused entity
  SQUEEZE = 'SQUEEZE',     // grip — secondary action (e.g. open executive UI / context menu)
  MOVE = 'MOVE',           // thumbstick/teleport locomotion intent
}

export interface XRControllerEvent {
  action: XRControllerAction;
  handedness: 'left' | 'right' | 'none';
  phase: 'start' | 'end';
}

export type SessionLifecycleState = 'INACTIVE' | 'REQUESTING' | 'ACTIVE' | 'ENDED' | 'ERROR';

/**
 * Manages one WebXR session's lifecycle and re-emits raw input events as the abstract action
 * vocabulary above. Holds no enterprise/business state — callers route actions through the
 * existing authorized Aevora command path exactly as desktop/voice input does.
 */
export interface RayTargetCandidate {
  entityId: string;
  position: { x: number; y: number; z: number };
  /** Bounding radius for a simple sphere-cast hit test — matches the collision envelopes in physics.ts. */
  radius: number;
}

export interface Ray {
  origin: { x: number; y: number; z: number };
  direction: { x: number; y: number; z: number }; // assumed normalized by the caller
}

/**
 * Deterministic controller ray → world-entity targeting (decisions 99/119's missing physical
 * interaction layer). A simple, renderer-independent ray/sphere intersection test: among every
 * candidate the ray's line passes within `radius` of, returns the closest one along the ray,
 * ties broken by entityId. Returns null if the ray hits nothing — a VR SELECT with nothing in
 * front of it resolves to no target, never a guessed one.
 */
export function resolveRayTarget(ray: Ray, candidates: RayTargetCandidate[]): string | null {
  let best: { entityId: string; t: number } | null = null;

  for (const candidate of candidates) {
    const ox = candidate.position.x - ray.origin.x;
    const oy = candidate.position.y - ray.origin.y;
    const oz = candidate.position.z - ray.origin.z;
    // Project the candidate onto the ray direction to find the closest approach point.
    const t = ox * ray.direction.x + oy * ray.direction.y + oz * ray.direction.z;
    if (t < 0) continue; // behind the controller — never targetable
    const closestX = ray.origin.x + ray.direction.x * t;
    const closestY = ray.origin.y + ray.direction.y * t;
    const closestZ = ray.origin.z + ray.direction.z * t;
    const dist = Math.sqrt((closestX - candidate.position.x) ** 2 + (closestY - candidate.position.y) ** 2 + (closestZ - candidate.position.z) ** 2);
    if (dist > candidate.radius) continue; // ray passes outside this candidate's bounds — no hit

    if (!best || t < best.t || (t === best.t && candidate.entityId.localeCompare(best.entityId) < 0)) {
      best = { entityId: candidate.entityId, t };
    }
  }

  return best?.entityId ?? null;
}

export class WebXRSessionManager {
  private session: XRSessionLike | null = null;
  private state: SessionLifecycleState = 'INACTIVE';
  private actionHandlers: ((event: XRControllerEvent) => void)[] = [];
  private stateHandlers: ((state: SessionLifecycleState) => void)[] = [];

  constructor(private readonly xr: XRSystemLike) {}

  getState(): SessionLifecycleState {
    return this.state;
  }

  onAction(handler: (event: XRControllerEvent) => void): () => void {
    this.actionHandlers.push(handler);
    return () => { this.actionHandlers = this.actionHandlers.filter((h) => h !== handler); };
  }

  onStateChange(handler: (state: SessionLifecycleState) => void): () => void {
    this.stateHandlers.push(handler);
    return () => { this.stateHandlers = this.stateHandlers.filter((h) => h !== handler); };
  }

  private setState(state: SessionLifecycleState) {
    this.state = state;
    for (const h of this.stateHandlers) h(state);
  }

  async enterVR(options?: any): Promise<XRSessionLike> {
    if (this.state === 'ACTIVE' || this.state === 'REQUESTING') {
      throw new Error('A WebXR session is already active or being requested');
    }
    this.setState('REQUESTING');
    try {
      const session = await this.xr.requestSession('immersive-vr', options);
      this.session = session;
      this.bindInput(session);
      session.addEventListener('end', () => this.handleSessionEnded());
      this.setState('ACTIVE');
      return session;
    } catch (err) {
      this.setState('ERROR');
      throw err;
    }
  }

  async exitVR(): Promise<void> {
    if (!this.session) return;
    await this.session.end(); // triggers the 'end' listener -> handleSessionEnded()
  }

  private handleSessionEnded() {
    this.session = null;
    this.setState('ENDED');
  }

  private bindInput(session: XRSessionLike) {
    const emit = (action: XRControllerAction, phase: 'start' | 'end') => (event: any) => {
      const handedness = event?.inputSource?.handedness ?? 'none';
      for (const h of this.actionHandlers) h({ action, handedness, phase });
    };
    session.addEventListener('selectstart', emit(XRControllerAction.SELECT, 'start'));
    session.addEventListener('selectend', emit(XRControllerAction.SELECT, 'end'));
    session.addEventListener('squeezestart', emit(XRControllerAction.SQUEEZE, 'start'));
    session.addEventListener('squeezeend', emit(XRControllerAction.SQUEEZE, 'end'));
  }
}
