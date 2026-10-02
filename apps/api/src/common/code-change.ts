/** Shared by IdleCodegenService (proposes) and ManagementDecisionService (applies on Chairman approval). */
export const CODE_CHANGE_PATH_OK = (p: unknown): p is string =>
  typeof p === 'string' &&
  /^(apps|packages)\/[\w./-]+\.(ts|tsx)$/.test(p) &&
  !p.includes('..') &&
  !/node_modules|\.env|lock/i.test(p);
