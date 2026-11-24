import { createHash, randomBytes } from 'node:crypto';
import type { Tx } from './store';

export const COOKIE = 'ys_session';

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function newToken() {
  return randomBytes(32).toString('base64url');
}

export function sessionCookie(token: string, maxAge?: number) {
  const secure = process.env.YUNSOL_SECURE_COOKIE === '1' ? '; Secure' : '';
  const age = maxAge !== undefined ? `; Max-Age=${maxAge}` : '';
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict${secure}${age}`;
}

export function readCookie(header: string | null) {
  if (!header) return '';
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === COOKIE) return rest.join('=');
  }
  return '';
}

export async function sessionUserId(tx: Tx, token: string) {
  if (!token) return null;
  const session = await tx.session.findFirst({ where: { tokenHash: hashToken(token), expires: { gt: new Date() } } });
  return session?.userId ?? null;
}
