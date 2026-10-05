/**
 * V12 engine-agnostic spatial audio foundation (decision 95).
 *
 * This defines the abstraction only: source/listener identity, position, attenuation calculation,
 * company isolation, and mute/priority rules — all pure, deterministic, and renderer-independent.
 * It does NOT play audio. Actual playback (Web Audio API `AudioListener`/`PositionalAudio` or
 * equivalent) is a browser/device capability this module deliberately leaves as an explicit
 * verification boundary — wiring that up and confirming sound is heard requires a running browser
 * session, which is outside what this module (or any unit test) can prove. What IS provable here,
 * and is proven below: which sources would be audible to a listener, and at what gain, given
 * positions, company scope, priority, and mute state.
 *
 * Audio sources are never fabricated: a source only exists because an authoritative enterprise
 * interaction (a meeting, a voice command) created it — there is no ambient/random chatter
 * generator anywhere in this module.
 */

export interface Vector3Like { x: number; y: number; z: number; }

export interface SpatialAudioSource {
  id: string;
  companyId: string;
  position: Vector3Like;
  /** Higher priority sources are kept when the concurrent-source budget is exceeded (e.g. the Chairman's voice over background meeting chatter). */
  priority: number;
  muted: boolean;
}

export interface SpatialAudioListener {
  companyId: string;
  position: Vector3Like;
}

export interface AudibleSource {
  source: SpatialAudioSource;
  gain: number; // 0..1
  distance: number;
}

function distance(a: Vector3Like, b: Vector3Like): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
}

/**
 * Deterministic linear-falloff attenuation: 1.0 at zero distance, 0.0 at or beyond maxDistance.
 * Returns 0 (never audible) for a different-company source (company isolation) or a muted source.
 */
export function computeAttenuation(source: SpatialAudioSource, listener: SpatialAudioListener, maxDistance = 20): number {
  if (source.companyId !== listener.companyId) return 0;
  if (source.muted) return 0;
  const d = distance(source.position, listener.position);
  if (d >= maxDistance) return 0;
  return Math.max(0, 1 - d / maxDistance);
}

/**
 * Resolves which sources are actually audible to a listener right now: same company, unmuted,
 * within range, deterministically ordered by priority then gain then id (so ties never depend on
 * array input order), capped at `maxConcurrent`.
 */
export function resolveAudibleSources(
  sources: SpatialAudioSource[],
  listener: SpatialAudioListener,
  maxDistance = 20,
  maxConcurrent = 8,
): AudibleSource[] {
  const audible = sources
    .map((source) => ({ source, gain: computeAttenuation(source, listener, maxDistance), distance: distance(source.position, listener.position) }))
    .filter((a) => a.gain > 0)
    .sort((a, b) => {
      if (b.source.priority !== a.source.priority) return b.source.priority - a.source.priority;
      if (b.gain !== a.gain) return b.gain - a.gain;
      return a.source.id.localeCompare(b.source.id);
    });

  return audible.slice(0, maxConcurrent);
}
