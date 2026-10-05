/** Shapes of the backend responses this slice consumes (verified against apps/api controllers). */

/** GET /auth/me */
export interface Me {
  actorId: string;
  actorType: 'CHAIRMAN' | 'EMPLOYEE';
  actorRole: string;
  name: string;
  email: string | null;
  companyId: string | null;
}

/** GET /auth/companies */
export interface AccessibleCompany { id: string; name: string; status: string; groupId: string | null }

/** GET /companies/:id (subset rendered) */
export interface Company { id: string; name: string; legalName: string | null; description: string | null; status: string }

/** GET /groups, GET /groups/:id (subset rendered) */
export interface Group { id: string; name: string; description: string | null; companies?: { id: string; name: string; status: string }[] }
