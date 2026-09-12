import type { IncomingMessage } from 'node:http';
import type { AuthPrincipal, AuthService } from '../auth/authService.js';

export function bearerToken(req: IncomingMessage): string | undefined {
  const raw = req.headers.authorization;
  if (!raw) return undefined;
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match?.[1];
}

export async function requirePrincipal(
  req: IncomingMessage,
  auth: AuthService,
): Promise<AuthPrincipal> {
  const token = bearerToken(req);
  if (!token) throw new Error('UNAUTHENTICATED: 缺少 Authorization: Bearer <token>');
  return auth.authenticate(token);
}
