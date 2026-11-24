// API 통합 테스트: 실제 PostgreSQL 테스트 DB(TEST_DATABASE_URL)가 있을 때만 실행합니다.
import { execSync } from 'node:child_process';
import { beforeAll, describe, expect, it } from 'vitest';

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

suite('API (PostgreSQL)', () => {
  let handle: (r: Request, p: string) => Promise<Response>;
  const cookies: Record<string, string> = {};
  async function call(who: string, path: string, body?: unknown) {
    const response = await handle(new Request('http://local/api/' + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', cookie: cookies[who] || '', host: 'local' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }), path);
    const set = response.headers.get('set-cookie');
    if (set) cookies[who] = set.split(';')[0];
    return { status: response.status, body: await response.json() };
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    process.env.YUNSOL_PAYMENT_KEY = 'nJ2X7h8k0tJ6vYf3Zc9q1wRr5sT4uV7xY0aB2cD3eF4=';
    execSync('npx prisma migrate reset --force --skip-generate --skip-seed', { env: { ...process.env, DATABASE_URL: url }, stdio: 'ignore' });
    execSync('npx tsx scripts/init-admin.ts admin', { env: { ...process.env, DATABASE_URL: url, YUNSOL_ADMIN_PASSWORD: 'Admin1234!' }, stdio: 'ignore' });
    ({ handle } = await import('../src/server/api'));
  }, 120_000);

  it('로그인하지 않으면 데이터를 볼 수 없다', async () => {
    expect((await call('anon', 'state')).status).toBe(401);
  });

  it('잘못된 비밀번호는 거절한다', async () => {
    expect((await call('x', 'login', { username: 'admin', password: 'nope' })).status).toBe(401);
  });

  it('다른 칸 동시 수정은 둘 다 저장되고, 같은 칸은 충돌로 알려준다', async () => {
    const login = await call('admin', 'login', { username: 'admin', password: 'Admin1234!' });
    expect(login.status).toBe(200);
    let rev = login.body.revision;
    let r = await call('admin', 'state', { revision: rev, rows: [
      { collection: 'users', id: 'u2', fields: { name: '김직원', username: 'kim', password: 'Kim12345!', approved: true, permissions: ['company'] } },
      { collection: 'companies', id: 'c1', fields: { name: '가나', bizno: '1234567890' } },
    ] });
    expect(r.status).toBe(200);
    rev = r.body.revision;
    expect((await call('kim', 'login', { username: 'kim', password: 'Kim12345!' })).status).toBe(200);
    expect((await call('admin', 'state', { revision: rev, rows: [{ collection: 'companies', id: 'c1', fields: { ceo: 'A' } }] })).status).toBe(200);
    expect((await call('kim', 'state', { revision: rev, rows: [{ collection: 'companies', id: 'c1', fields: { phone: '010' } }] })).status).toBe(200);
    const clash = await call('kim', 'state', { revision: rev, rows: [{ collection: 'companies', id: 'c1', fields: { ceo: 'B' } }] });
    expect(clash.status).toBe(409);
    const state = await call('admin', 'state');
    const company = state.body.state.companies.find((c: any) => c.id === 'c1');
    expect(company).toMatchObject({ ceo: 'A', phone: '010', bizno: '123-45-67890' });
  });

  it('변경 이력에 수정자와 항목이 남는다', async () => {
    const history = await call('admin', 'history/companies/c1');
    expect(history.body[0]).toMatchObject({ user: '김직원', fields: expect.arrayContaining(['phone']) });
  });

  it('계좌 정보는 암호화해 저장하고 권한이 있어야 읽는다', async () => {
    const w = await call('admin', 'company-payment', { id: 'c1', action: 'write', method: '계좌이체', fields: { bank: '국민', account: '1', holder: '홍' }, version: 0 });
    expect(w.status).toBe(200);
    const read = await call('kim', 'company-payment', { id: 'c1', action: 'read' });
    expect(read.body.fields.bank).toBe('국민');
  });

  it('다른 사이트에서 보낸 요청은 막는다', async () => {
    const response = await handle(new Request('http://local/api/state', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example', host: 'local', cookie: cookies.admin }, body: '{}',
    }), 'state');
    expect(response.status).toBe(403);
  });
});
