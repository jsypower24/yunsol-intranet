import { createRoot } from 'react-dom/client';
import seed from './state.json';
import { App } from '../src/client/App';
import { change } from '../src/server/change';
import { project } from '../src/server/project';
import { ApiError, ensure, tracked, trackerTargets, PAYMENT_FIELDS, stamp } from '../src/server/rules';
import '../src/app/legacy.css';
import '../src/app/theme.css';

const state: any = structuredClone(seed);
let revision = 1;
let userId = '';
const orders: Record<string, Record<string, string[]>> = {};
const payments: Record<string, any> = {};
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const me = () => state.users.find((u: any) => u.id === userId);

async function route(path: string, method: string, body: any) {
  if (path === 'login') {
    const user = state.users.find((u: any) => u.username === String(body.username || '').trim());
    ensure(user, '체험판 아이디는 admin, kim, lee 입니다. (비밀번호는 아무거나)', 401);
    ensure(user.approved && user.active !== false, '승인 대기 중이거나 사용이 정지된 계정입니다.', 403);
    userId = user.id;
    return project(state, user, revision);
  }
  if (path === 'logout') { userId = ''; return {}; }
  if (path === 'signup') throw new ApiError(400, '체험판에서는 회원가입을 할 수 없습니다. admin, kim, lee 중 하나로 로그인해 보세요.');
  const user = me();
  ensure(user, '로그인이 필요합니다.', 401);
  if (path === 'revision') return { revision };
  if (path === 'state' && method === 'GET') return project(state, user, revision);
  if (path === 'state') {
    const draft = structuredClone(state);
    change(draft, body, draft.users.find((u: any) => u.id === userId));
    Object.assign(state, draft);
    revision++;
    return project(state, me(), revision);
  }
  if (path === 'tracker-workplace') {
    const company = state.companies.find((c: any) => c.id === body.id);
    ensure(tracked(company, trackerTargets(state, user)), '담당 업무에 연결된 사업장 정보만 볼 수 있습니다.', 403);
    return { company, fields: state.companyFields };
  }
  if (path === 'company-payment') {
    const company = state.companies.find((c: any) => c.id === body.id);
    ensure(company, '사업장을 찾을 수 없습니다.', 404);
    const record = payments[company.id] || { fields: {}, version: 0 };
    if (body.action === 'read') return { method: company.transferMethod || '', fields: record.fields, version: record.version };
    ensure(body.method in PAYMENT_FIELDS);
    payments[company.id] = { fields: body.fields, version: record.version + 1 };
    Object.assign(company, { transferMethod: body.method, edited: stamp(user) });
    revision++;
    return project(state, user, revision);
  }
  if (path === 'tracker-profile') {
    Object.assign(user, { trackerTitle: body.title, trackerIcon: body.icon });
    revision++;
    return project(state, user, revision);
  }
  if (path === 'column-orders') {
    const mine = (orders[userId] ||= {});
    if (method === 'POST') mine[body.group] = body.order;
    return mine;
  }
  throw new ApiError(400, '체험판에서는 엑셀 업로드·다운로드를 쓸 수 없습니다. 실제 서버에서 동작합니다.');
}

const realFetch = window.fetch.bind(window);
window.fetch = async (input: any, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input.url;
  const match = /^\/api\/([^?]*)/.exec(url);
  if (!match) return realFetch(input, init);
  const method = init?.method || 'GET';
  let body: any = {};
  if (typeof init?.body === 'string') body = JSON.parse(init.body);
  try {
    return reply(200, await route(match[1], method, body));
  } catch (error: any) {
    if (error instanceof ApiError) return reply(error.status, { error: error.message });
    console.error(error);
    return reply(400, { error: error?.message || '입력값을 확인해주세요.' });
  }
};

const banner = document.createElement('div');
banner.className = 'demo-banner';
banner.textContent = '체험판 · 예시 데이터로 동작하며 새로고침하면 처음 상태로 돌아갑니다 · 아이디 admin(마스터) / kim(김민지) / lee(이서준), 비밀번호는 아무거나';
document.body.prepend(banner);
const root = document.createElement('div');
document.body.append(root);
createRoot(root).render(<App />);
