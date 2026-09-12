export const API_BASE = 'http://localhost:8787';

export type Assignment = {
  id: string;
  userId: string;
  seatId: string;
  activityId: string;
  active: boolean;
};

export type Me = {
  userId: string;
  userName: string;
  sessionId: string;
  expiresAt: number;
  assignments: Assignment[];
};

export async function api<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
  seatId?: string,
  activityId?: string,
): Promise<T> {
  const headers = new Headers(options.headers ?? {});
  headers.set('content-type', 'application/json');
  if (token) headers.set('authorization', `Bearer ${token}`);
  if (seatId) headers.set('x-seat-id', seatId);
  if (activityId) headers.set('x-activity-id', activityId);

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (!res.ok) {
    throw new Error(parsed?.message ?? parsed?.error ?? `${res.status} ${res.statusText}`);
  }
  return parsed as T;
}
