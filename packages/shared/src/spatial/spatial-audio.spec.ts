import { computeAttenuation, resolveAudibleSources, SpatialAudioSource, SpatialAudioListener } from './spatial-audio';

const listener: SpatialAudioListener = { companyId: 'c1', position: { x: 0, y: 0, z: 0 } };

function source(overrides: Partial<SpatialAudioSource> = {}): SpatialAudioSource {
  return { id: 's1', companyId: 'c1', position: { x: 0, y: 0, z: 0 }, priority: 0, muted: false, ...overrides };
}

describe('computeAttenuation', () => {
  it('is 1.0 at zero distance', () => {
    expect(computeAttenuation(source(), listener)).toBe(1);
  });

  it('falls off linearly with distance, deterministically', () => {
    const s = source({ position: { x: 10, y: 0, z: 0 } });
    expect(computeAttenuation(s, listener, 20)).toBeCloseTo(0.5);
  });

  it('is exactly 0 at or beyond maxDistance', () => {
    const s = source({ position: { x: 20, y: 0, z: 0 } });
    expect(computeAttenuation(s, listener, 20)).toBe(0);
    const farther = source({ position: { x: 100, y: 0, z: 0 } });
    expect(computeAttenuation(farther, listener, 20)).toBe(0);
  });

  it('company isolation: a different-company source is never audible regardless of distance', () => {
    const s = source({ companyId: 'c2', position: { x: 0, y: 0, z: 0 } });
    expect(computeAttenuation(s, listener)).toBe(0);
  });

  it('mute/security rule: a muted source is never audible even at zero distance', () => {
    const s = source({ muted: true });
    expect(computeAttenuation(s, listener)).toBe(0);
  });

  it('listener/source movement changes gain deterministically', () => {
    const s = source({ position: { x: 5, y: 0, z: 0 } });
    const near = computeAttenuation(s, { ...listener, position: { x: 4, y: 0, z: 0 } }, 20);
    const far = computeAttenuation(s, { ...listener, position: { x: 0, y: 0, z: 0 } }, 20);
    expect(near).toBeGreaterThan(far);
  });
});

describe('resolveAudibleSources', () => {
  it('excludes muted and cross-company sources, includes in-range same-company ones', () => {
    const sources = [
      source({ id: 'a', position: { x: 1, y: 0, z: 0 } }),
      source({ id: 'b', muted: true, position: { x: 1, y: 0, z: 0 } }),
      source({ id: 'c', companyId: 'c2', position: { x: 1, y: 0, z: 0 } }),
    ];
    const result = resolveAudibleSources(sources, listener);
    expect(result.map((r) => r.source.id)).toEqual(['a']);
  });

  it('orders by priority first (deterministic, not array order)', () => {
    const sources = [
      source({ id: 'low', priority: 1, position: { x: 2, y: 0, z: 0 } }),
      source({ id: 'high', priority: 10, position: { x: 2, y: 0, z: 0 } }),
    ];
    const result = resolveAudibleSources(sources, listener);
    expect(result.map((r) => r.source.id)).toEqual(['high', 'low']);
  });

  it('ties in priority and gain break deterministically by id', () => {
    const sources = [
      source({ id: 'zzz', priority: 0, position: { x: 2, y: 0, z: 0 } }),
      source({ id: 'aaa', priority: 0, position: { x: 2, y: 0, z: 0 } }),
    ];
    const result = resolveAudibleSources(sources, listener);
    expect(result.map((r) => r.source.id)).toEqual(['aaa', 'zzz']);
  });

  it('caps at maxConcurrent, keeping the highest-priority sources', () => {
    const sources = Array.from({ length: 5 }, (_, i) => source({ id: `s${i}`, priority: i, position: { x: 1, y: 0, z: 0 } }));
    const result = resolveAudibleSources(sources, listener, 20, 2);
    expect(result.map((r) => r.source.id)).toEqual(['s4', 's3']);
  });

  it('never fabricates a source: an empty source list resolves to no audible sources', () => {
    expect(resolveAudibleSources([], listener)).toEqual([]);
  });
});
