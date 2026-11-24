// REST API. 경로와 응답 형식은 기존 서버와 같게 유지했습니다.
import { Prisma } from '@prisma/client';
import { change, ChangeBody } from './change';
import { assertNoConflicts } from './conflicts';
import { prisma } from './db';
import { decrypt, encrypt, paymentKey } from './fernet';
import { passwordHash, verifyPassword } from './password';
import { project } from './project';
import { allowed, ApiError, MENUS, PAYMENT_FIELDS, require, Row, rowId, stamp, State, tracked, trackerTargets, validDetailImages } from './rules';
import { hashToken, newToken, readCookie, sessionCookie, sessionUserId } from './session';
import { latestRevision, loadState, lockWrites, persistDiff } from './store';
import { companyTemplate, parseCompanySheet } from './excel';
import { checkLoginAllowed, recordLoginFailure, clearLoginFailures } from './ratelimit';

type Result = { status?: number; body: unknown; cookie?: string; headers?: Record<string, string> };

function json({ status = 200, body, cookie, headers }: Result) {
  const response = new Response(body instanceof Uint8Array ? (body as unknown as BodyInit) : JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
  if (cookie) response.headers.append('Set-Cookie', cookie);
  return response;
}

async function readBody(request: Request): Promise<Row> {
  const type = request.headers.get('content-type') || '';
  require(type.split(';')[0].trim() === 'application/json');
  const text = await request.text();
  require(text.length > 0 && text.length < 20_000_000);
  const body = JSON.parse(text);
  require(body && typeof body === 'object' && !Array.isArray(body));
  return body;
}

// 쓰기 작업: 잠금 → 상태 읽기 → 변경 → 변경분 저장 → 최신 revision
async function write<T>(fn: (tx: Prisma.TransactionClient, state: State, before: State) => Promise<T> | T, actor: { id: string | null; name: string }) {
  return prisma.$transaction(async tx => {
    await lockWrites(tx);
    const before = await loadState(tx);
    const state = structuredClone(before);
    const value = await fn(tx, state, before);
    await persistDiff(tx, before, state, actor);
    return { value, state, revision: await latestRevision(tx) };
  }, { timeout: 30_000, maxWait: 15_000 });
}

// 같은 시점의 상태와 revision을 함께 읽습니다.
async function readSnapshot() {
  return prisma.$transaction(async tx => ({ state: await loadState(tx), revision: await latestRevision(tx) }),
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

async function currentUser(request: Request, state: State) {
  const token = readCookie(request.headers.get('cookie'));
  const id = await sessionUserId(prisma, token);
  const user = state.users.find(u => id && u.id === id && u.approved && u.active !== false);
  return { user, token };
}

function clientKey(request: Request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0].trim() || request.headers.get('x-real-ip') || 'local';
}

export async function handle(request: Request, path: string): Promise<Response> {
  try {
    return json(await route(request, path));
  } catch (error) {
    if (error instanceof ApiError) return json({ status: error.status, body: { error: error.message } });
    if (error instanceof SyntaxError || error instanceof TypeError) return json({ status: 400, body: { error: '입력값을 확인해주세요.' } });
    console.error(error);
    return json({ status: 500, body: { error: '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' } });
  }
}

async function route(request: Request, path: string): Promise<Result> {
  const method = request.method;
  // 같은 사이트에서 보낸 요청만 받습니다(CSRF 방지). SameSite=Strict 쿠키와 함께 이중으로 막습니다.
  if (method === 'POST') {
    const origin = request.headers.get('origin');
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
    require(!origin || new URL(origin).host === host, '허용되지 않은 요청입니다.', 403);
  }

  if (method === 'POST' && path === 'login') {
    const body = await readBody(request);
    const username = String(body.username ?? '');
    const key = clientKey(request) + '|' + username;
    checkLoginAllowed(key);
    const { state, revision } = await readSnapshot();
    const user = state.users.find(u => u.username && u.username === username);
    if (!user || !verifyPassword(String(body.password ?? ''), user.secret)) {
      recordLoginFailure(key);
      throw new ApiError(401, '아이디 또는 비밀번호가 올바르지 않습니다.');
    }
    require(user.approved && user.active !== false, '승인 대기 중이거나 사용이 정지된 계정입니다.', 403);
    clearLoginFailures(key);
    const plain = newToken();
    const duration = body.remember ? 30 * 86400 : 12 * 3600;
    const old = readCookie(request.headers.get('cookie'));
    await prisma.session.deleteMany({ where: { OR: [{ tokenHash: hashToken(old) }, { expires: { lte: new Date() } }] } });
    await prisma.session.create({ data: { tokenHash: hashToken(plain), userId: user.id, expires: new Date(Date.now() + duration * 1000) } });
    return { body: project(state, user, revision), cookie: sessionCookie(plain, body.remember ? duration : undefined) };
  }
  if (method === 'POST' && path === 'logout') {
    const token = readCookie(request.headers.get('cookie'));
    if (token) await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
    return { body: {}, cookie: sessionCookie('', 0) };
  }
  if (method === 'POST' && path === 'signup') {
    const body = await readBody(request);
    require(['name', 'username', 'password'].every(k => typeof body[k] === 'string' && body[k]));
    require(body.username.length <= 60 && body.name.length <= 60, '이름과 아이디는 60자 이내로 입력해주세요.');
    require(body.password.length >= 8, '비밀번호는 8자 이상으로 입력해주세요.');
    checkLoginAllowed('signup|' + clientKey(request));
    recordLoginFailure('signup|' + clientKey(request));
    await write((_tx, state) => {
      require(!state.users.some(u => u.username === body.username), '이미 사용 중인 아이디입니다.');
      state.users.push({
        id: crypto.randomUUID().replace(/-/g, ''), name: body.name, username: body.username, secret: passwordHash(body.password),
        admin: false, approved: false, active: true, permissions: [], color: '#3b82f6', edited: '',
      });
    }, { id: null, name: body.name });
    return { body: {} };
  }

  if (method === 'GET' && path === 'revision') {
    const token = readCookie(request.headers.get('cookie'));
    require(await sessionUserId(prisma, token), '로그인이 필요합니다.', 401);
    return { body: { revision: await latestRevision(prisma) } };
  }

  // 이하 로그인 필요
  const { state: snapshot, revision: snapshotRevision } = await readSnapshot();
  const { user } = await currentUser(request, snapshot);
  require(user, '로그인이 필요합니다.', 401);
  const actor = { id: user.id as string, name: user.name as string };

  if (method === 'GET' && path === 'state') {
    return { body: project(snapshot, user, snapshotRevision) };
  }

  if (method === 'POST' && path === 'state') {
    const body = (await readBody(request)) as ChangeBody;
    require(Number.isInteger(body.revision), '입력값을 확인해주세요.');
    const { state, revision } = await write(async (tx, state) => {
      const me = state.users.find(u => u.id === user.id)!;
      await assertNoConflicts(tx, state, body, body.revision!, me.id);
      change(state, body, me);
    }, actor);
    const me = state.users.find(u => u.id === user.id) || user;
    return { body: project(state, me, revision) };
  }

  if (method === 'POST' && path === 'tracker-workplace') {
    const body = await readBody(request);
    const company = snapshot.companies.find(c => c.id === body.id);
    require(tracked(company, trackerTargets(snapshot, user)), '담당 업무에 연결된 사업장 정보만 볼 수 있습니다.', 403);
    return { body: { company, fields: snapshot.companyFields } };
  }

  if (method === 'POST' && path === 'company-payment') {
    require(allowed(user, 'company'), '사업장 정보 접근 권한이 없습니다.', 403);
    const body = await readBody(request);
    const company = snapshot.companies.find(c => c.id === body.id);
    require(company, '사업장을 찾을 수 없습니다.', 404);
    if (body.action === 'read') {
      const record = await prisma.companyPayment.findUnique({ where: { companyId: company.id } });
      const fields = record ? JSON.parse(decrypt(paymentKey(), Buffer.from(record.encrypted)).toString('utf8')) : {};
      await prisma.changeLog.create({ data: { userId: user.id, userName: user.name, collection: 'companyPayment', rowId: company.id, action: 'read' } });
      return { body: { method: company.transferMethod || '', fields, version: record?.version ?? 0 } };
    }
    require(body.action === 'write');
    const methodName = body.method;
    const fields = body.fields;
    require(typeof methodName === 'string' && methodName in PAYMENT_FIELDS && fields && typeof fields === 'object' && !Array.isArray(fields)
      && Object.keys(fields).every(k => PAYMENT_FIELDS[methodName].has(k))
      && Object.values(fields).every(v => typeof v === 'string' && v.length <= 160));
    const { state, revision } = await write(async (tx, state) => {
      const record = await tx.companyPayment.findUnique({ where: { companyId: company.id } });
      const version = record?.version ?? 0;
      require(body.version === version, '이체 수단이 변경되었습니다. 다시 열어 확인해주세요.', 409);
      const encrypted = encrypt(paymentKey(), Buffer.from(JSON.stringify(fields), 'utf8'));
      await tx.companyPayment.upsert({
        where: { companyId: company.id },
        create: { companyId: company.id, version: version + 1, encrypted },
        update: { version: version + 1, encrypted },
      });
      const target = state.companies.find(c => c.id === company.id)!;
      const me = state.users.find(u => u.id === user.id)!;
      Object.assign(target, { transferMethod: methodName, edited: stamp(me) });
    }, actor);
    return { body: project(state, state.users.find(u => u.id === user.id)!, revision) };
  }

  if (method === 'POST' && path === 'tracker-profile') {
    require(allowed(user, 'work'), '업무 트래커 접근 권한이 없습니다.', 403);
    const body = await readBody(request);
    require(Object.keys(body).sort().join() === 'icon,revision,title');
    const { title, icon } = body;
    require(typeof title === 'string' && title.length <= 60 && !/[\r\n]/.test(title));
    require(icon && typeof icon === 'object' && Object.keys(icon).sort().join() === 'kind,value' && typeof icon.value === 'string');
    if (icon.kind === 'emoji') require(icon.value.length <= 24 && [...icon.value].every((c: string) => c.codePointAt(0)! >= 32));
    else if (icon.kind === 'image') {
      require(icon.value.length <= 341_380 && validDetailImages([{ name: 'icon', data: icon.value }]), '아이콘 이미지 형식 또는 크기를 확인해주세요.');
    } else require(false);
    const { state, revision } = await write((_tx, state) => {
      const me = state.users.find(u => u.id === user.id)!;
      me.trackerTitle = title;
      me.trackerIcon = icon;
    }, actor);
    return { body: project(state, state.users.find(u => u.id === user.id)!, revision) };
  }

  if (path === 'column-orders') {
    if (method === 'POST') {
      const body = await readBody(request);
      const { group: name, order } = body;
      const permissions: Record<string, string> = {
        labor: 'work', other: 'work', 'company-hidden': 'company', 'labor-hidden': 'work', 'other-hidden': 'work',
        overtimeRows: 'overtime', subsidyDiscovery: 'overtime', ...Object.fromEntries(MENUS.map(p => [p, p])),
      };
      require(typeof name === 'string' && name in permissions && (['fee', 'teamFees'].includes(name) || allowed(user, permissions[name])),
        '이 표에 접근할 권한이 없습니다.', 403);
      require(Array.isArray(order) && (name.endsWith('-hidden') ? 0 : 1) <= order.length && order.length <= 128
        && order.every(rowId) && new Set(order).size === order.length);
      await prisma.columnOrder.upsert({
        where: { userId_name: { userId: user.id, name } },
        create: { userId: user.id, name, order },
        update: { order },
      });
    }
    const orders = await prisma.columnOrder.findMany({ where: { userId: user.id } });
    return { body: Object.fromEntries(orders.map(o => [o.name, o.order])) };
  }

  if (method === 'GET' && path === 'company-template') {
    require(allowed(user, 'company'), '사업장 정보 접근 권한이 없습니다.', 403);
    const file = await companyTemplate(snapshot.companyFields);
    return {
      body: file,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent('윤솔 수임 사업장 정보 양식.xlsx')}`,
      },
    };
  }

  if (method === 'POST' && path === 'company-import') {
    require(allowed(user, 'company'), '사업장 정보 접근 권한이 없습니다.', 403);
    const type = request.headers.get('content-type') || '';
    require(type.startsWith('application/octet-stream') || type.startsWith('application/vnd.openxmlformats'));
    const buffer = Buffer.from(await request.arrayBuffer());
    require(buffer.length > 0 && buffer.length <= 10_000_000, '엑셀 파일은 10MB까지 올릴 수 있습니다.');
    return { body: await parseCompanySheet(buffer, snapshot.companyFields) };
  }

  if (method === 'GET' && path.startsWith('history/')) {
    const [, collection, id] = path.split('/');
    require(typeof collection === 'string' && rowId(id));
    const page = { companies: 'company', works: 'work', users: 'admin', fees: 'fee', sales: 'sales', setupRows: 'new', overtimeRows: 'overtime', subsidyDiscovery: 'overtime' }[collection];
    require(page && allowed(user, page), '변경 이력을 볼 권한이 없습니다.', 403);
    const logs = await prisma.changeLog.findMany({ where: { collection, rowId: id, action: { not: 'read' } }, orderBy: { id: 'desc' }, take: 100 });
    return { body: logs.map(l => ({ at: l.at.toISOString(), user: l.userName, action: l.action, fields: l.fields, before: l.before, after: l.after })) };
  }

  throw new ApiError(404, '페이지가 없습니다.');
}
