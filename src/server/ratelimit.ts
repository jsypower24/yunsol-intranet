// 로그인 시도 제한: 같은 접속지·아이디로 15분 동안 10번 실패하면 잠시 막습니다.
import { ApiError } from './rules';

const WINDOW = 15 * 60_000;
const LIMIT = 10;
const failures = new Map<string, number[]>();

function recent(key: string, now = Date.now()) {
  const list = (failures.get(key) || []).filter(t => now - t < WINDOW);
  if (list.length) failures.set(key, list); else failures.delete(key);
  return list;
}

export function checkLoginAllowed(key: string) {
  if (recent(key).length >= LIMIT) throw new ApiError(429, '시도 횟수가 많습니다. 15분 뒤 다시 시도해주세요.');
}
export function recordLoginFailure(key: string) {
  failures.set(key, [...recent(key), Date.now()]);
  if (failures.size > 10_000) failures.delete(failures.keys().next().value!);
}
export function clearLoginFailures(key: string) {
  failures.delete(key);
}
