import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map } from 'rxjs/operators';

/**
 * Credential material on Employee/Chairman rows. Only AuthService reads these, directly from Prisma;
 * they must never appear in an HTTP response (V14 slice 3: many routes return full Employee rows).
 */
export const CREDENTIAL_FIELDS = ['credentialHash', 'credentialSalt', 'hashAlgorithm', 'workFactor'] as const;

function isPlain(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object') return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/** Removes credential fields from plain objects/arrays in place. Dates, buffers, streams and observables are untouched. */
export function redactCredentials<T>(value: T, seen = new WeakSet<object>()): T {
  if (Array.isArray(value)) {
    if (seen.has(value)) return value;
    seen.add(value);
    for (const item of value) redactCredentials(item, seen);
  } else if (isPlain(value)) {
    if (seen.has(value)) return value;
    seen.add(value);
    for (const f of CREDENTIAL_FIELDS) delete value[f];
    for (const v of Object.values(value)) redactCredentials(v, seen);
  }
  return value;
}

@Injectable()
export class CredentialRedactionInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    if (context.getType() !== 'http') return next.handle();
    return next.handle().pipe(map((body) => redactCredentials(body)));
  }
}
