// 화면에서 보낸 변경 요청을 검증하고 상태에 반영합니다. (기존 server.py의 change())
import { randomUUID } from 'node:crypto';
import { passwordHash } from './password';
import {
  allowed, CHECKS, CLASSES, COLLECTIONS, COMPANY_TEXT, FEE_PRODUCTS, formattedBizno, digits, isDate, isMonth, MENUS,
  OVERTIME_FIELDS, ownsOvertime, ensure, Row, rowId, selectableTeam, SETUP_FLAGS, SETUP_PEOPLE, SETUP_TEXT, stamp, State,
  tracked, trackerTargets, validateChoices, validDetailBlocks, validDetailImages, WORK_TEXT,
} from './rules';

export type RowOp = { collection: string; id: string; fields?: Row; delete?: boolean };
export type ChangeBody = {
  revision?: number;
  rows?: RowOp[];
  memo?: string;
  settings?: { officeName: string };
  companyFields?: { id: string; label: string }[];
  privateTrackerFields?: { id: string; label: string }[];
  privateTrackerValues?: Record<string, Record<string, string>>;
};

const isPlainObject = (v: unknown): v is Row => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const isPrintable = (s: string) => !/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(s);

function savePrivateTracker(state: State, body: ChangeBody, user: Row) {
  ensure(allowed(user, 'work'), '업무 트래커 접근 권한이 없습니다.', 403);
  const profile = (state.privateTrackers[user.id] ??= { fields: [], values: {} });
  if ('privateTrackerFields' in body) {
    const fields = body.privateTrackerFields;
    ensure(Array.isArray(fields) && fields.length >= 1 && fields.length <= 40
      && JSON.stringify(fields.slice(0, -1)) === JSON.stringify(profile.fields));
    const field = fields[fields.length - 1];
    ensure(isPlainObject(field) && Object.keys(field).sort().join() === 'id,label');
    const { id: key, label } = field;
    ensure(typeof key === 'string' && /^private_[0-9a-f-]{36}$/.test(key));
    ensure(typeof label === 'string' && label.length > 0 && label.length <= 60 && label.trim() === label && isPrintable(label));
    ensure(!profile.fields.some(item => item.id === key || item.label.toLowerCase() === label.toLowerCase()), '이미 사용 중인 열 제목입니다.');
    profile.fields = fields;
  }
  if ('privateTrackerValues' in body) {
    const values = body.privateTrackerValues;
    const keys = new Set(profile.fields.map(f => f.id));
    const companies = new Map(state.companies.map(c => [c.id, c]));
    const own = new Set([user.id]);
    const owned = new Set(state.works.filter(w => tracked(companies.get(w.companyId), own)).map(w => w.id));
    ensure(isPlainObject(values) && Object.keys(values).every(k => owned.has(k)));
    for (const [workId, fields] of Object.entries(values!)) {
      ensure(isPlainObject(fields) && Object.keys(fields).every(k => keys.has(k))
        && Object.values(fields).every(v => typeof v === 'string' && v.length <= 50_000));
      profile.values[workId] = { ...(profile.values[workId] || {}), ...fields };
    }
  }
}

const RESERVED_COMPANY_LABELS = ('분류|세팅|업체명|CMS번호|급여담당|수수료 귀속|사업자등록번호|대표자성명|연관업체|영업자|소통담당자|' +
  '연락처|주소|기장수수료|지원금 수수료|월 수수료 수납 방식|급여일|종료일자|종료사유|최종편집일|관리|CMS|기장 담당|수수 주인|이체 수단').split('|');

function validateOvertime(state: State, key: string, old: Row | undefined, fields: Row, deleting: boolean, user: Row) {
  ensure(!old || ownsOvertime(old, user), '담당자 본인의 기록만 수정할 수 있습니다.', 403);
  ensure(Object.keys(fields).every(f => OVERTIME_FIELDS[key].has(f)));
  if (deleting) return;
  const row = { ...(old || {}), ...fields };
  ensure(isDate(row.date));
  const people = new Set(state.users.filter(selectableTeam).map(u => u.id));
  const memberKey = key === 'overtimeRows' ? 'memberId' : 'memberIds';
  const members = key === 'overtimeRows' ? [row.memberId] : row.memberIds;
  ensure(Array.isArray(members) && members.length > 0 && members.length <= 100 && members.every(rowId));
  ensure(new Set(members).size === members.length);
  if (!old || memberKey in fields) {
    ensure(members.every((m: string) => people.has(m)));
    ensure(allowed(user, 'admin') || (members.length === 1 && members[0] === user.id), '본인에게만 기록을 배정할 수 있습니다.', 403);
  }
  for (const [field, value] of Object.entries(fields)) {
    if (field === 'start' || field === 'end') {
      ensure(typeof value === 'string' && (!value || /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(value)));
    } else if (field === 'breakHours' || field === 'usedHours') {
      const low = field === 'usedHours' ? -100000 : 0;
      const high = field === 'usedHours' ? 100000 : 24;
      ensure(value === '' || (typeof value === 'number' && Number.isFinite(value) && low <= value && value <= high));
    } else if (field === 'headcount') {
      ensure(value === '' || (Number.isInteger(value) && value >= 0 && value <= 1_000_000));
    } else if (field === 'companyIds') {
      const companies = new Set(state.companies.map(c => c.id));
      ensure(Array.isArray(value) && value.length <= 100 && value.every(v => rowId(v) && companies.has(v)));
      ensure(new Set(value).size === value.length);
    } else if (field === 'reason') {
      ensure(['', '개인업무', '급여기간 중 연장', '앞선연장'].includes(value));
    } else if (field === 'status') {
      ensure(['', '예정', '지급완료', '반려', '미입금???'].includes(value));
    } else if (field === 'note' || field === 'type') {
      ensure(typeof value === 'string' && value.length <= 2000);
    }
  }
}

export function change(state: State, body: ChangeBody, user: Row) {
  if ('privateTrackerFields' in body || 'privateTrackerValues' in body) savePrivateTracker(state, body, user);
  if ('companyFields' in body) {
    ensure(allowed(user, 'company'), '사업장 정보 변경 권한이 없습니다.', 403);
    const current = state.companyFields;
    const fields = body.companyFields;
    ensure(Array.isArray(fields) && JSON.stringify(current) === JSON.stringify(fields.slice(0, -1)) && fields.length >= 1 && fields.length <= 100);
    const field = fields[fields.length - 1];
    ensure(isPlainObject(field) && Object.keys(field).sort().join() === 'id,label');
    const { id: identifier, label } = field;
    ensure(typeof identifier === 'string' && /^custom_[0-9a-f-]{36}$/.test(identifier) && !current.some(f => f.id === identifier));
    const used = new Set([...RESERVED_COMPANY_LABELS, ...current.map(f => f.label)].map(l => l.toLowerCase()));
    ensure(typeof label === 'string' && label.length > 0 && label.length <= 60 && label.trim() === label && isPrintable(label)
      && !used.has(label.toLowerCase()), '이미 사용 중이거나 사용할 수 없는 열 제목입니다.');
    state.companyFields = fields;
  }
  const customFields = new Set(state.companyFields.map(f => f.id));
  const now = stamp(user);
  const companies = new Map(state.companies.map(c => [c.id, c]));
  const team = () => new Set(state.users.filter(selectableTeam).map(u => u.id));
  for (const op of body.rows || []) {
    ensure(isPlainObject(op));
    const { collection: key, id: identifier } = op;
    ensure(typeof key === 'string' && key in COLLECTIONS && rowId(identifier));
    ensure(allowed(user, COLLECTIONS[key]), '변경 권한이 없습니다.', 403);
    const rows: Row[] = (state as any)[key];
    let old = rows.find(r => r.id === identifier);
    let fields: Row = op.fields ?? {};
    ensure(isPlainObject(fields) && !('id' in fields));
    const deleting = Boolean(op.delete);
    if (key in OVERTIME_FIELDS) {
      validateOvertime(state, key, old, fields, deleting, user);
    } else if (key === 'works') {
      ensure(old && tracked(companies.get(old.companyId), trackerTargets(state, user)), '업무 담당자만 수정할 수 있습니다.', 403);
      const permitted = new Set([...WORK_TEXT, ...CHECKS, 'classTags', 'closed']);
      ensure(!deleting && Object.keys(fields).every(k => permitted.has(k)));
      for (const [k, v] of Object.entries(fields)) {
        if (CHECKS.includes(k)) ensure(typeof v === 'boolean');
        else if (k === 'classTags') validateChoices(v);
        else if (k === 'closed') ensure(v === '진행' || v === '종료');
        else {
          ensure(typeof v === 'string');
          if (k === 'month') ensure(!v || isMonth(v));
        }
      }
    } else if (key === 'companies') {
      const permitted = new Set([...COMPANY_TEXT, 'category', 'mainManagers', 'feeOwners', 'setup', 'detailImages', 'detailBlocks', ...customFields]);
      ensure(Object.keys(fields).every(k => permitted.has(k)));
      fields = { ...fields };
      for (const [k, v] of Object.entries(fields)) {
        if (k === 'mainManagers' || k === 'feeOwners') validateChoices(v, team());
        else if (k === 'category') ensure(CLASSES.includes(v));
        else if (k === 'setup') ensure(typeof v === 'boolean');
        else if (k === 'detailImages') ensure(validDetailImages(v), '이미지 형식 또는 크기를 확인해주세요.');
        else if (k === 'detailBlocks') ensure(validDetailBlocks(v), '본문 블록 또는 이미지 형식을 확인해주세요.');
        else if (k === 'paymentMethod') ensure(['', 'CMS', '계좌이체'].includes(v));
        else {
          ensure(typeof v === 'string');
          if (customFields.has(k)) ensure(v.length <= 50_000);
          if (k === 'detailNotes') ensure(v.length <= 50_000);
          if (k === 'lastActiveCategory') ensure(!v || CLASSES.slice(0, -1).includes(v));
          if (k === 'closedOn' && v) ensure(isDate(v));
          if (k === 'bizno' && v) {
            ensure([10, 11].includes(digits(v).length), '사업자등록번호는 숫자 10자리 또는 11자리로 입력해주세요.');
            fields[k] = formattedBizno(v);
          }
        }
      }
    } else if (key === 'setupRows') {
      ensure(companies.get(identifier)?.setup === true && !deleting, '세팅이 선택된 수임 사업장만 수정할 수 있습니다.', 403);
      const permitted = new Set([...SETUP_FLAGS, ...SETUP_TEXT, ...SETUP_PEOPLE]);
      ensure(Object.keys(fields).every(k => permitted.has(k)));
      for (const [k, v] of Object.entries(fields)) {
        if (SETUP_PEOPLE.includes(k)) validateChoices(v, team());
        else if (SETUP_FLAGS.includes(k)) ensure(typeof v === 'boolean');
        else ensure(typeof v === 'string');
      }
    } else if (key === 'fees') {
      ensure(!old || old.source === 'transfer', 'CMS 반영 내역은 직접 수정할 수 없습니다.', 403);
      const permitted = new Set(['companyRef', 'billingMonth', 'product', 'amount', 'status', 'method', 'memberName']);
      ensure(Object.keys(fields).every(k => permitted.has(k)));
      if (!deleting) {
        const merged = { ...(old || {}), ...fields };
        ensure(merged.method === '계좌이체' && companies.has(merged.companyRef));
        ensure(old || companies.get(merged.companyRef)!.paymentMethod === '계좌이체');
        ensure(isMonth(merged.billingMonth));
        if (!old || 'product' in fields) ensure(FEE_PRODUCTS.includes(merged.product), '상품을 선택해주세요.');
        ensure(Number.isInteger(merged.amount) && merged.amount >= 0 && merged.amount <= 9_999_999_999);
        ensure(['완납', '미납', '수납대기'].includes(merged.status));
        fields = { ...fields, source: 'transfer', memberName: companies.get(merged.companyRef)!.name || '' };
      }
    } else if (key === 'users') {
      ensure(!old || !old.admin || (user.admin && !deleting && Object.keys(fields).every(k =>
        ['name', 'givenName', 'color', 'birthDate', 'workPhone', 'extension', 'dept', 'position', 'performanceBase'].includes(k))),
      '마스터 계정 변경 권한이 없습니다.', 403);
      const permitted = new Set(['name', 'givenName', 'username', 'password', 'birthDate', 'workPhone', 'extension', 'phone', 'dept',
        'position', 'color', 'approved', 'active', 'permissions', 'trackerAccess', 'performanceBase']);
      ensure(Object.keys(fields).every(k => permitted.has(k)));
      for (const [k, v] of Object.entries(fields)) {
        if (k === 'approved' || k === 'active') ensure(typeof v === 'boolean');
        else if (k === 'performanceBase') ensure(Number.isInteger(v) && v >= 0 && v <= 9_999_999_999);
        else if (k === 'trackerAccess') {
          const ids = new Set(state.users.map(u => u.id));
          ensure(Array.isArray(v) && v.every(rowId) && new Set(v).size === v.length && v.every(i => ids.has(i)));
        } else if (k === 'permissions') {
          ensure(Array.isArray(v) && v.every(p => (MENUS as readonly string[]).includes(p)) && (user.admin || !v.includes('admin')));
        } else {
          ensure(typeof v === 'string');
          if (k === 'color') ensure(/^#[a-fA-F0-9]{6}$/.test(v));
        }
      }
      if (!user.admin && old) ensure(!(old.permissions || []).includes('admin'), '관리자 권한이 필요합니다.', 403);
      if (fields.username) {
        ensure(!rows.some(u => u.username === fields.username && u.id !== identifier), '이미 사용 중인 아이디입니다.');
      }
      fields = { ...fields };
      const password = fields.password || '';
      delete fields.password;
      if (password) fields.secret = passwordHash(password);
    } else {
      // sales, newLeads
      const permitted = new Set(['name', 'phone', 'source', 'consult', 'contract', 'docs', 'companyCreated', 'note', 'org', 'rate']);
      ensure(Object.keys(fields).every(k => permitted.has(k)));
      ensure(Object.values(fields).every(v => typeof v === 'string' || typeof v === 'boolean'));
    }
    if (deleting) {
      if (old) rows.splice(rows.indexOf(old), 1);
      continue;
    }
    if (!old) {
      old = { id: identifier };
      if (key === 'companies') Object.assign(old, { category: '진행(자문)', mainManagers: [], feeOwners: [] });
      if (key === 'users') Object.assign(old, { admin: false, approved: false, active: true, permissions: [], username: '', name: '', teamAdded: true });
      rows.unshift(old);
      if (key === 'companies') companies.set(identifier, old);
    }
    const target = old;
    if (Object.entries(fields).some(([k, v]) => JSON.stringify(target[k]) !== JSON.stringify(v)) || !('edited' in target) || !target.edited) {
      Object.assign(target, fields);
      target.edited = now;
    }
  }
  if ('memo' in body) {
    ensure(allowed(user, 'memo') && typeof body.memo === 'string', '변경 권한이 없습니다.', 403);
    state.memo = body.memo!;
  }
  if ('settings' in body) {
    ensure(allowed(user, 'settings') && typeof body.settings?.officeName === 'string', '변경 권한이 없습니다.', 403);
    state.settings = { ...state.settings, officeName: body.settings!.officeName };
  }
  syncWorks(state, now);
}

// 사업장·팀원 변경 뒤 연결 데이터를 정리합니다. 업무 행이 없는 사업장에는 공용 업무 행을 하나 만듭니다.
export function syncWorks(state: State, now: string) {
  const users = new Set(state.users.map(u => u.id));
  const companies = new Map(state.companies.map(c => [c.id, c]));
  for (const c of companies.values()) {
    for (const k of ['mainManagers', 'feeOwners']) {
      const remaining = (c[k] || []).filter((u: string) => users.has(u));
      if (JSON.stringify(remaining) !== JSON.stringify(c[k] || [])) { c[k] = remaining; c.edited = now; }
    }
  }
  for (const user of state.users) {
    if ('trackerAccess' in user) user.trackerAccess = (user.trackerAccess || []).filter((i: string) => users.has(i));
  }
  state.setupRows = state.setupRows.filter(r => companies.has(r.id));
  for (const item of state.setupRows) {
    for (const key of SETUP_PEOPLE) if (key in item) item[key] = item[key].filter((i: string) => users.has(i));
  }
  state.works = state.works.filter(w => companies.has(w.companyId));
  const linked = new Set(state.works.map(w => w.companyId));
  for (const c of companies.values()) {
    if (!linked.has(c.id)) state.works.push({ id: randomUUID().replace(/-/g, ''), companyId: c.id, closed: '진행', edited: now });
  }
}
