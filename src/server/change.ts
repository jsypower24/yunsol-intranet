// 화면에서 보낸 변경 요청을 검증하고 상태에 반영합니다. (기존 server.py의 change())
import { randomUUID } from 'node:crypto';
import { passwordHash } from './password';
import {
  allowed, CHECKS, CLASSES, COLLECTIONS, COMPANY_TEXT, FEE_PRODUCTS, formattedBizno, digits, isDate, isMonth, MENUS,
  OVERTIME_FIELDS, ownsOvertime, require, Row, rowId, selectableTeam, SETUP_FLAGS, SETUP_PEOPLE, SETUP_TEXT, stamp, State,
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
  require(allowed(user, 'work'), '업무 트래커 접근 권한이 없습니다.', 403);
  const profile = (state.privateTrackers[user.id] ??= { fields: [], values: {} });
  if ('privateTrackerFields' in body) {
    const fields = body.privateTrackerFields;
    require(Array.isArray(fields) && fields.length >= 1 && fields.length <= 40
      && JSON.stringify(fields.slice(0, -1)) === JSON.stringify(profile.fields));
    const field = fields[fields.length - 1];
    require(isPlainObject(field) && Object.keys(field).sort().join() === 'id,label');
    const { id: key, label } = field;
    require(typeof key === 'string' && /^private_[0-9a-f-]{36}$/.test(key));
    require(typeof label === 'string' && label.length > 0 && label.length <= 60 && label.trim() === label && isPrintable(label));
    require(!profile.fields.some(item => item.id === key || item.label.toLowerCase() === label.toLowerCase()), '이미 사용 중인 열 제목입니다.');
    profile.fields = fields;
  }
  if ('privateTrackerValues' in body) {
    const values = body.privateTrackerValues;
    const keys = new Set(profile.fields.map(f => f.id));
    const companies = new Map(state.companies.map(c => [c.id, c]));
    const own = new Set([user.id]);
    const owned = new Set(state.works.filter(w => tracked(companies.get(w.companyId), own)).map(w => w.id));
    require(isPlainObject(values) && Object.keys(values).every(k => owned.has(k)));
    for (const [workId, fields] of Object.entries(values!)) {
      require(isPlainObject(fields) && Object.keys(fields).every(k => keys.has(k))
        && Object.values(fields).every(v => typeof v === 'string' && v.length <= 50_000));
      profile.values[workId] = { ...(profile.values[workId] || {}), ...fields };
    }
  }
}

const RESERVED_COMPANY_LABELS = ('분류|세팅|업체명|CMS번호|급여담당|수수료 귀속|사업자등록번호|대표자성명|연관업체|영업자|소통담당자|' +
  '연락처|주소|기장수수료|지원금 수수료|월 수수료 수납 방식|급여일|종료일자|종료사유|최종편집일|관리|CMS|기장 담당|수수 주인|이체 수단').split('|');

function validateOvertime(state: State, key: string, old: Row | undefined, fields: Row, deleting: boolean, user: Row) {
  require(!old || ownsOvertime(old, user), '담당자 본인의 기록만 수정할 수 있습니다.', 403);
  require(Object.keys(fields).every(f => OVERTIME_FIELDS[key].has(f)));
  if (deleting) return;
  const row = { ...(old || {}), ...fields };
  require(isDate(row.date));
  const people = new Set(state.users.filter(selectableTeam).map(u => u.id));
  const memberKey = key === 'overtimeRows' ? 'memberId' : 'memberIds';
  const members = key === 'overtimeRows' ? [row.memberId] : row.memberIds;
  require(Array.isArray(members) && members.length > 0 && members.length <= 100 && members.every(rowId));
  require(new Set(members).size === members.length);
  if (!old || memberKey in fields) {
    require(members.every((m: string) => people.has(m)));
    require(allowed(user, 'admin') || (members.length === 1 && members[0] === user.id), '본인에게만 기록을 배정할 수 있습니다.', 403);
  }
  for (const [field, value] of Object.entries(fields)) {
    if (field === 'start' || field === 'end') {
      require(typeof value === 'string' && (!value || /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(value)));
    } else if (field === 'breakHours' || field === 'usedHours') {
      const low = field === 'usedHours' ? -100000 : 0;
      const high = field === 'usedHours' ? 100000 : 24;
      require(value === '' || (typeof value === 'number' && Number.isFinite(value) && low <= value && value <= high));
    } else if (field === 'headcount') {
      require(value === '' || (Number.isInteger(value) && value >= 0 && value <= 1_000_000));
    } else if (field === 'companyIds') {
      const companies = new Set(state.companies.map(c => c.id));
      require(Array.isArray(value) && value.length <= 100 && value.every(v => rowId(v) && companies.has(v)));
      require(new Set(value).size === value.length);
    } else if (field === 'reason') {
      require(['', '개인업무', '급여기간 중 연장', '앞선연장'].includes(value));
    } else if (field === 'status') {
      require(['', '예정', '지급완료', '반려', '미입금???'].includes(value));
    } else if (field === 'note' || field === 'type') {
      require(typeof value === 'string' && value.length <= 2000);
    }
  }
}

export function change(state: State, body: ChangeBody, user: Row) {
  if ('privateTrackerFields' in body || 'privateTrackerValues' in body) savePrivateTracker(state, body, user);
  if ('companyFields' in body) {
    require(allowed(user, 'company'), '사업장 정보 변경 권한이 없습니다.', 403);
    const current = state.companyFields;
    const fields = body.companyFields;
    require(Array.isArray(fields) && JSON.stringify(current) === JSON.stringify(fields.slice(0, -1)) && fields.length >= 1 && fields.length <= 100);
    const field = fields[fields.length - 1];
    require(isPlainObject(field) && Object.keys(field).sort().join() === 'id,label');
    const { id: identifier, label } = field;
    require(typeof identifier === 'string' && /^custom_[0-9a-f-]{36}$/.test(identifier) && !current.some(f => f.id === identifier));
    const used = new Set([...RESERVED_COMPANY_LABELS, ...current.map(f => f.label)].map(l => l.toLowerCase()));
    require(typeof label === 'string' && label.length > 0 && label.length <= 60 && label.trim() === label && isPrintable(label)
      && !used.has(label.toLowerCase()), '이미 사용 중이거나 사용할 수 없는 열 제목입니다.');
    state.companyFields = fields;
  }
  const customFields = new Set(state.companyFields.map(f => f.id));
  const now = stamp(user);
  const companies = new Map(state.companies.map(c => [c.id, c]));
  const team = () => new Set(state.users.filter(selectableTeam).map(u => u.id));
  for (const op of body.rows || []) {
    require(isPlainObject(op));
    const { collection: key, id: identifier } = op;
    require(typeof key === 'string' && key in COLLECTIONS && rowId(identifier));
    require(allowed(user, COLLECTIONS[key]), '변경 권한이 없습니다.', 403);
    const rows: Row[] = (state as any)[key];
    let old = rows.find(r => r.id === identifier);
    let fields: Row = op.fields ?? {};
    require(isPlainObject(fields) && !('id' in fields));
    const deleting = Boolean(op.delete);
    if (key in OVERTIME_FIELDS) {
      validateOvertime(state, key, old, fields, deleting, user);
    } else if (key === 'works') {
      require(old && tracked(companies.get(old.companyId), trackerTargets(state, user)), '업무 담당자만 수정할 수 있습니다.', 403);
      const permitted = new Set([...WORK_TEXT, ...CHECKS, 'classTags', 'closed']);
      require(!deleting && Object.keys(fields).every(k => permitted.has(k)));
      for (const [k, v] of Object.entries(fields)) {
        if (CHECKS.includes(k)) require(typeof v === 'boolean');
        else if (k === 'classTags') validateChoices(v);
        else if (k === 'closed') require(v === '진행' || v === '종료');
        else {
          require(typeof v === 'string');
          if (k === 'month') require(!v || isMonth(v));
        }
      }
    } else if (key === 'companies') {
      const permitted = new Set([...COMPANY_TEXT, 'category', 'mainManagers', 'feeOwners', 'setup', 'detailImages', 'detailBlocks', ...customFields]);
      require(Object.keys(fields).every(k => permitted.has(k)));
      fields = { ...fields };
      for (const [k, v] of Object.entries(fields)) {
        if (k === 'mainManagers' || k === 'feeOwners') validateChoices(v, team());
        else if (k === 'category') require(CLASSES.includes(v));
        else if (k === 'setup') require(typeof v === 'boolean');
        else if (k === 'detailImages') require(validDetailImages(v), '이미지 형식 또는 크기를 확인해주세요.');
        else if (k === 'detailBlocks') require(validDetailBlocks(v), '본문 블록 또는 이미지 형식을 확인해주세요.');
        else if (k === 'paymentMethod') require(['', 'CMS', '계좌이체'].includes(v));
        else {
          require(typeof v === 'string');
          if (customFields.has(k)) require(v.length <= 50_000);
          if (k === 'detailNotes') require(v.length <= 50_000);
          if (k === 'lastActiveCategory') require(!v || CLASSES.slice(0, -1).includes(v));
          if (k === 'closedOn' && v) require(isDate(v));
          if (k === 'bizno' && v) {
            require([10, 11].includes(digits(v).length), '사업자등록번호는 숫자 10자리 또는 11자리로 입력해주세요.');
            fields[k] = formattedBizno(v);
          }
        }
      }
    } else if (key === 'setupRows') {
      require(companies.get(identifier)?.setup === true && !deleting, '세팅이 선택된 수임 사업장만 수정할 수 있습니다.', 403);
      const permitted = new Set([...SETUP_FLAGS, ...SETUP_TEXT, ...SETUP_PEOPLE]);
      require(Object.keys(fields).every(k => permitted.has(k)));
      for (const [k, v] of Object.entries(fields)) {
        if (SETUP_PEOPLE.includes(k)) validateChoices(v, team());
        else if (SETUP_FLAGS.includes(k)) require(typeof v === 'boolean');
        else require(typeof v === 'string');
      }
    } else if (key === 'fees') {
      require(!old || old.source === 'transfer', 'CMS 반영 내역은 직접 수정할 수 없습니다.', 403);
      const permitted = new Set(['companyRef', 'billingMonth', 'product', 'amount', 'status', 'method', 'memberName']);
      require(Object.keys(fields).every(k => permitted.has(k)));
      if (!deleting) {
        const merged = { ...(old || {}), ...fields };
        require(merged.method === '계좌이체' && companies.has(merged.companyRef));
        require(old || companies.get(merged.companyRef)!.paymentMethod === '계좌이체');
        require(isMonth(merged.billingMonth));
        if (!old || 'product' in fields) require(FEE_PRODUCTS.includes(merged.product), '상품을 선택해주세요.');
        require(Number.isInteger(merged.amount) && merged.amount >= 0 && merged.amount <= 9_999_999_999);
        require(['완납', '미납', '수납대기'].includes(merged.status));
        fields = { ...fields, source: 'transfer', memberName: companies.get(merged.companyRef)!.name || '' };
      }
    } else if (key === 'users') {
      require(!old || !old.admin || (user.admin && !deleting && Object.keys(fields).every(k =>
        ['name', 'givenName', 'color', 'birthDate', 'workPhone', 'extension', 'dept', 'position', 'performanceBase'].includes(k))),
      '마스터 계정 변경 권한이 없습니다.', 403);
      const permitted = new Set(['name', 'givenName', 'username', 'password', 'birthDate', 'workPhone', 'extension', 'phone', 'dept',
        'position', 'color', 'approved', 'active', 'permissions', 'trackerAccess', 'performanceBase']);
      require(Object.keys(fields).every(k => permitted.has(k)));
      for (const [k, v] of Object.entries(fields)) {
        if (k === 'approved' || k === 'active') require(typeof v === 'boolean');
        else if (k === 'performanceBase') require(Number.isInteger(v) && v >= 0 && v <= 9_999_999_999);
        else if (k === 'trackerAccess') {
          const ids = new Set(state.users.map(u => u.id));
          require(Array.isArray(v) && v.every(rowId) && new Set(v).size === v.length && v.every(i => ids.has(i)));
        } else if (k === 'permissions') {
          require(Array.isArray(v) && v.every(p => (MENUS as readonly string[]).includes(p)) && (user.admin || !v.includes('admin')));
        } else {
          require(typeof v === 'string');
          if (k === 'color') require(/^#[a-fA-F0-9]{6}$/.test(v));
        }
      }
      if (!user.admin && old) require(!(old.permissions || []).includes('admin'), '관리자 권한이 필요합니다.', 403);
      if (fields.username) {
        require(!rows.some(u => u.username === fields.username && u.id !== identifier), '이미 사용 중인 아이디입니다.');
      }
      fields = { ...fields };
      const password = fields.password || '';
      delete fields.password;
      if (password) fields.secret = passwordHash(password);
    } else {
      // sales, newLeads
      const permitted = new Set(['name', 'phone', 'source', 'consult', 'contract', 'docs', 'companyCreated', 'note', 'org', 'rate']);
      require(Object.keys(fields).every(k => permitted.has(k)));
      require(Object.values(fields).every(v => typeof v === 'string' || typeof v === 'boolean'));
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
    require(allowed(user, 'memo') && typeof body.memo === 'string', '변경 권한이 없습니다.', 403);
    state.memo = body.memo!;
  }
  if ('settings' in body) {
    require(allowed(user, 'settings') && typeof body.settings?.officeName === 'string', '변경 권한이 없습니다.', 403);
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
