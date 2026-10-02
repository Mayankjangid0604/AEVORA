// Shared AEVORA client types and utilities

export const CALL_STATES = ['READY', 'DIALING', 'RINGING', 'CONNECTED', 'ENDED', 'FAILED', 'CANCELLED'] as const;
export type CallState = typeof CALL_STATES[number];

export type DeviceType = 'WINDOWS_DEVICE' | 'ANDROID_DEVICE';
export type DeviceStatus = 'ACTIVE' | 'INACTIVE' | 'REVOKED';

export interface ConnectedDevice {
  id: string;
  type: DeviceType;
  name: string | null;
  status: DeviceStatus;
  lastSeen: string;
  createdAt: string;
}

export interface AuthPayload {
  access_token: string;
}

export interface ApiConfig {
  baseUrl: string;
}

export function getApiBaseUrl(): string {
  // On Android physical devices, replace localhost with your LAN IP:
  // Set EXPO_PUBLIC_API_URL=http://192.168.x.x:13000 in apps/mobile/.env
  return process.env.EXPO_PUBLIC_API_URL
    || (typeof window !== 'undefined' && (window as any).__TAURI__ ? 'http://localhost:13000' : null)
    || 'http://localhost:13000';
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
  };

  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || `API error: ${res.status}`);
  }

  return res.json();
}
