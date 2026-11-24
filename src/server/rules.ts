// 업무 규칙과 권한 판단. 기존 server.py의 규칙을 그대로 옮겼습니다.

export type Row = Record<string, any>;
export type State = {
  companies: Row[];
  newLeads: Row[];
  sales: Row[];
  users: Row[];
  works: Row[];
  fees: Row[];
  setupRows: Row[];
  overtimeRows: Row[];
  subsidyDiscovery: Row[];
  invoices: Row[];
  feeImports: Record<string, string>;
  memo: string;
  settings: { officeName: string };
  companyFields: { id: string; label: string }[];
  privateTrackers: Record<string, { fields: { id: string; label: string }[]; values: Record<string, Record<string, string>> }>;
};

export const MENUS = ['new', 'company', 'work', 'fee', 'dashboard', 'teamFees', 'sales', 'admin', 'overtime', 'memo', 'settings'] as const;
export const COLLECTIONS: Record<string, string> = {
  companies: 'company', newLeads: 'new', sales: 'sales', users: 'admin', works: 'work', fees: 'fee',
  setupRows: 'new', overtimeRows: 'overtime', subsidyDiscovery: 'overtime',
};
export const ROW_COLLECTIONS = Object.keys(COLLECTIONS) as (keyof State)[];
export const CLASSES = ['진행(자문)', '진행(지원금)', '기타', '종료'];
export const FEE_PRODUCTS = ['노무 셋팅 자문', '노무 월 자문', '노무 지원금 자문', '노무 컨설팅'];
export const CHECKS = 'requested started received sent payslip accounting feeChecked employment daily insurance'.split(' ');
export const SETUP_FLAGS = ('contractSetup previousAgencyDismissed taxRequest reportNeeded reportCompleted adviceContract ' +
  'folderCreated cmsMember setupDebit cmsBill edi employeeRoster notion googleSheet hrHelper certificateReceived').split(' ');
export const SETUP_TEXT = 'setupFee firstDebit workStart payrollStart subsidy specialNotes'.split(' ');
export const SETUP_PEOPLE = ['baseManagers', 'temporaryManagers'];
export const WORK_TEXT = 'payday month roster note accountingInfo deadline hire worker round when selection agency fee'.split(' ');
export const COMPANY_TEXT = ('name cms bizno ceo related sales comm phone address bookFee supportFee payday status paymentMethod ' +
  'closedOn closureReason detailNotes lastActiveCategory').split(' ');
export const OVERTIME_FIELDS: Record<string, Set<string>> = {
  overtimeRows: new Set(['date', 'memberId', 'start', 'end', 'breakHours', 'usedHours', 'reason', 'note']),
  subsidyDiscovery: new Set(['date', 'memberIds', 'companyIds', 'type', 'headcount', 'status', 'note']),
};
export const PAYMENT_FIELDS: Record<string, Set<string>> = {
  '': new Set(), '계좌이체': new Set(['bank', 'account', 'holder']), '카드': new Set(['number', 'expiry', 'holderName']),
};

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function require(condition: unknown, message = '입력값을 확인해주세요.', status = 400): asserts condition {
  if (!condition) throw new ApiError(status, message);
}

export function allowed(user: Row, page: string) {
  return Boolean(user.admin || (user.permissions || []).includes(page));
}

export function selectableTeam(user: Row) {
  return user.active !== false && Boolean(user.approved || user.teamAdded);
}

export function trackerTargets(state: State, user: Row): Set<string> {
  if (!allowed(user, 'work')) return new Set();
  const targets = new Set(state.users.filter(selectableTeam).map(u => u.id as string));
  if (user.admin) return new Set([...targets, user.id]);
  const access = new Set<string>(user.trackerAccess || []);
  return new Set([user.id, ...[...targets].filter(id => access.has(id))]);
}

export function tracked(company: Row | undefined, targets: Set<string>) {
  return Boolean(company && (company.mainManagers || []).some((id: string) => targets.has(id)));
}

export function publicUser(user: Row, full = false) {
  if (full) {
    const { secret, password, ...rest } = user;
    return rest;
  }
  const keys = ['id', 'name', 'givenName', 'color', 'approved', 'active', 'teamAdded', 'trackerTitle', 'trackerIcon'];
  return Object.fromEntries(keys.filter(k => k in user).map(k => [k, user[k]]));
}

export function stamp(user: Row, at = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(at).map(p => [p.type, p.value]));
  const name: string = user.name || '';
  return `${parts.year}.${parts.month}.${parts.day} ${parts.hour}:${parts.minute} | ${name ? name.slice(0, 1) + 'OO' : '사용자'}`;
}

export function rowId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_.-]{1,100}$/.test(value);
}

export function digits(value: unknown) {
  return String(value ?? '').replace(/[^0-9]/g, '');
}

export function formattedBizno(value: string) {
  const d = digits(value);
  if (d.length !== 10 && d.length !== 11) return value;
  return [d.slice(0, 3), d.slice(3, 5), d.slice(5, 10), d.slice(10)].filter(Boolean).join('-');
}

export function validateChoices(values: unknown, options?: Set<string>) {
  require(Array.isArray(values) && values.length <= 3 && values.every(x => typeof x === 'string')
    && new Set(values).size === values.length && (!options || values.every(v => options.has(v))));
}

export function isMonth(value: unknown) {
  return typeof value === 'string' && /^[0-9]{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function isDate(value: unknown) {
  if (typeof value !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) return false;
  const d = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

const IMAGE_STARTS: Record<string, number[]> = {
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], jpeg: [0xff, 0xd8, 0xff], gif: [0x47, 0x49, 0x46, 0x38], webp: [0x52, 0x49, 0x46, 0x46],
};

export function validDetailImages(images: unknown) {
  if (!Array.isArray(images) || images.length > 5) return false;
  for (const image of images) {
    if (!image || typeof image !== 'object' || Object.keys(image).sort().join() !== 'data,name') return false;
    const { name, data } = image as Row;
    if (typeof name !== 'string' || name.length > 255 || typeof data !== 'string' || data.length > 1_333_380) return false;
    const match = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(data);
    if (!match) return false;
    if (match[2].length % 4 !== 0) return false;
    const content = Buffer.from(match[2], 'base64');
    if (content.length > 1_000_000) return false;
    const start = IMAGE_STARTS[match[1]];
    if (!start.every((byte, i) => content[i] === byte)) return false;
    if (match[1] === 'webp' && content.subarray(8, 12).toString('latin1') !== 'WEBP') return false;
  }
  return true;
}

export function validDetailBlocks(blocks: unknown) {
  if (!Array.isArray(blocks) || blocks.length > 50) return false;
  let texts = 0;
  const images: Row[] = [];
  const ids = new Set<string>();
  for (const block of blocks) {
    if (!block || typeof block !== 'object' || !rowId(block.id) || ids.has(block.id)) return false;
    ids.add(block.id);
    const keys = Object.keys(block).sort().join();
    if (block.type === 'text') {
      if (keys !== 'id,text,type' || typeof block.text !== 'string') return false;
      texts += block.text.length;
    } else if (block.type === 'image') {
      if (keys !== 'align,data,id,name,size,type' || !['left', 'center', 'right'].includes(block.align)
        || !['small', 'medium', 'full'].includes(block.size)) return false;
      images.push({ name: block.name, data: block.data });
    } else return false;
  }
  return texts <= 50_000 && validDetailImages(images);
}

export function ownsOvertime(row: Row, user: Row) {
  const members: string[] = row.memberIds || [row.memberId];
  return allowed(user, 'admin') || members.includes(user.id);
}

export function emptyState(): State {
  return {
    companies: [], newLeads: [], sales: [], users: [], works: [], fees: [], setupRows: [], overtimeRows: [], subsidyDiscovery: [],
    invoices: [], feeImports: {}, memo: '', settings: { officeName: '윤솔 인트라넷' }, companyFields: [], privateTrackers: {},
  };
}
