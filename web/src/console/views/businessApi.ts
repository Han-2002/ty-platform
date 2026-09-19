import { api } from '../../api'
import type { ConsoleSession } from '../modules'

export async function businessApi<T>(
  session: ConsoleSession,
  path: string,
  options: RequestInit = {},
): Promise<T> {
  return await api<T>(path, options, session.token, session.seatId, session.activityId)
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
