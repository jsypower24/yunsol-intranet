// 비밀번호 해시: 기존 Python 서버(hashlib.scrypt n=16384,r=8,p=1, 64바이트)와 같은 형식이라 기존 해시를 그대로 이관할 수 있습니다.
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function passwordHash(password: string, salt?: string) {
  const saltHex = salt ?? randomBytes(16).toString('hex');
  const digest = scryptSync(password, Buffer.from(saltHex, 'hex'), 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return saltHex + ':' + digest.toString('hex');
}

export function verifyPassword(password: string, stored: string | null | undefined) {
  if (!stored || !stored.includes(':')) return false;
  const expected = Buffer.from(stored);
  const actual = Buffer.from(passwordHash(password, stored.split(':')[0]));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
