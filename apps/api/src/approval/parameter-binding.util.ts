/**
 * Normalizes a value for deterministic parameter binding comparison.
 * - Sorts object keys recursively.
 * - Normalizes arrays.
 * - Leaves primitives untouched.
 */
/**
 * Canonicalizes a value deterministically.
 * - Recursively sorts object keys
 * - Retains array ordering
 * - Rejects NaN/Infinite
 * - Distinguishes undefined vs null
 */
export function canonicalize(obj: any): string {
  if (obj === undefined) {
    return 'undefined';
  }
  if (obj === null) {
    return 'null';
  }
  if (typeof obj === 'number') {
    if (isNaN(obj) || !isFinite(obj)) {
      throw new Error('Invalid number in canonicalization: ' + obj);
    }
    // Ensures '100' !== 100
    return `n:${obj}`;
  }
  if (typeof obj === 'boolean') {
    return `b:${obj}`;
  }
  if (typeof obj === 'string') {
    return `s:${JSON.stringify(obj)}`; // handles escaping
  }
  if (Array.isArray(obj)) {
    const elems = obj.map(canonicalize);
    return `[${elems.join(',')}]`;
  }
  if (typeof obj === 'object') {
    const keys = Object.keys(obj).sort();
    const props = keys.map(k => {
      // Omit undefined from objects (as JSON stringify would do, or we could explicitly include it. Let's omit it for cleaner objects)
      if (obj[k] === undefined) return null;
      return `${JSON.stringify(k)}:${canonicalize(obj[k])}`;
    }).filter(p => p !== null);
    return `{${props.join(',')}}`;
  }
  throw new Error(`Unsupported type for canonicalization: ${typeof obj}`);
}

export function normalizeParams(obj: any): any {
  // We keep this for backward compatibility if needed, but we should use canonicalize
  if (obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) return obj.map(normalizeParams);
  if (typeof obj === 'object') {
    const keys = Object.keys(obj).sort();
    const result: Record<string, any> = {};
    for (const key of keys) {
      if (obj[key] !== undefined) result[key] = normalizeParams(obj[key]);
    }
    return result;
  }
  return obj;
}

export function hashMaterialParams(params: any): string {
  // Ensure we capture all material fields even if they are undefined (by explicitly pulling them or canonicalizing them)
  // The caller must construct an object with exactly the fields they consider material.
  // We canonicalize it and then hash it to a secure digest.
  const canonicalString = canonicalize(params);
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(canonicalString).digest('hex');
}

/**
 * Deterministic deep equality check.
 * This does NOT allow "tolerances" for numerical values.
 * e.g., 100 !== 100.01 and "100" !== 100
 */
export function isDeepEqualStrict(a: any, b: any): boolean {
  try {
    return canonicalize(a) === canonicalize(b);
  } catch (e) {
    return false;
  }
}
