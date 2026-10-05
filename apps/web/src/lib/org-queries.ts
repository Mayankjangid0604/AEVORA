'use client';
import { useQuery } from '@tanstack/react-query';
import { bffGet } from './bff-client';
import { ApiError } from './http';
import { companyKeys } from './query-keys';
import type { DepartmentSummary, EmployeeSummary, WorkerProvenance } from './types';

/** Organization / Workforce server state. Every key and request carries the company context. */

export function useDepartments(companyId: string) {
  return useQuery({
    queryKey: companyKeys.org(companyId, 'departments'),
    queryFn: ({ signal }) => bffGet<DepartmentSummary[]>('organization/departments', { companyId, signal }),
  });
}

export function useDepartment(companyId: string, id: string) {
  return useQuery({
    queryKey: companyKeys.org(companyId, 'department', id),
    queryFn: ({ signal }) => bffGet<DepartmentSummary>(`organization/departments/${encodeURIComponent(id)}`, { companyId, signal }),
  });
}

export function useEmployees(companyId: string) {
  return useQuery({
    queryKey: companyKeys.org(companyId, 'employees'),
    queryFn: ({ signal }) => bffGet<EmployeeSummary[]>('organization/employees', { companyId, signal }),
  });
}

export function useEmployee(companyId: string, id: string) {
  return useQuery({
    queryKey: companyKeys.org(companyId, 'employee', id),
    queryFn: ({ signal }) => bffGet<EmployeeSummary>(`organization/employee/${encodeURIComponent(id)}`, { companyId, signal }),
  });
}

/** employeeId -> workerType for every employee that has a worker profile. */
export function useProvenance(companyId: string) {
  return useQuery({
    queryKey: companyKeys.org(companyId, 'provenance'),
    queryFn: async ({ signal }) => {
      const rows = await bffGet<WorkerProvenance[]>('workforce/profiles', { companyId, signal });
      return new Map(rows.map((r) => [r.employeeId, r.workerType]));
    },
  });
}

/** One employee's worker type; a missing profile (404) is a real "not recorded", not an error. */
export function useEmployeeProvenance(companyId: string, employeeId: string) {
  return useQuery({
    queryKey: companyKeys.org(companyId, 'provenance', employeeId),
    queryFn: async ({ signal }) => {
      try {
        return (await bffGet<WorkerProvenance>(`workforce/profiles/${encodeURIComponent(employeeId)}`, { companyId, signal })).workerType;
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
  });
}
