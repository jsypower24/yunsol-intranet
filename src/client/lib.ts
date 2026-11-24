'use client';
// 화면 공통 규칙과 화면 상태(현재 메뉴, 조회 월 등). 기존 app.js의 전역 변수와 도우미 함수를 옮겼습니다.
import { notify, Row, store } from './store';

export const MENU = [
  { id: 'new', name: '신규 사업장', icon: '✨', group: '업무' }, { id: 'company', name: '수임 사업장 정보', icon: '🏢', group: '업무' },
  { id: 'work', name: '월간 업무 트래커', icon: '✅', group: '업무' }, { id: 'dashboard', name: '대시보드', icon: '📊', group: '수수료' },
  { id: 'fee', name: '수수료 관리', icon: '₩', group: '수수료' }, { id: 'teamFees', name: '담당자 수수료 집계', icon: '👥', group: '수수료' },
  { id: 'sales', name: '영업자', icon: '🤝', group: '팀' }, { id: 'admin', name: '팀원 관리', icon: '👥', group: '팀' },
  { id: 'overtime', name: '연장근무 관리', icon: '◷', group: '팀' }, { id: 'memo', name: '정리메모', icon: '📝', group: '기타' },
  { id: 'settings', name: '설정', icon: '⚙️', group: '기타' },
];

const seoulMonth = () => new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', timeZone: 'Asia/Seoul' }).format(new Date());

// 화면 상태 (새로고침하면 초기화)
export const ui = {
  page: 'company',
  trackerOwner: '',
  companyDetailId: '',
  detailsExpanded: true,
  trackerWorkplace: null as null | { company: Row; fields: Row[] },
  trackerWorkplaceRequest: 0,
  companyMode: '전체',
  companyQuery: '',
  companyFocusId: '',
  columnPickerOpen: '',
  workTab: 'all',
  feeMonth: seoulMonth(),
  feeChannel: '합산',
  feeProduct: '',
  feeAssignee: '',
  feeStatus: '',
  feeOpenedFromTracker: false,
  dashboardStatus: '',
  teamFeeMonth: seoulMonth(),
  selectedFeeOwner: '',
  teamFeeView: 'chart',
  feeWorkplaceView: '',
  personalFeesExpanded: false,
  overtimeStart: '',
  overtimeEnd: '',
  overtimeMonth: '',
  overtimeView: '연장기재',
  overtimePerson: '',
  scrollRestore: null as null | { x: number; y: number },
};

export function setUi(patch: Partial<typeof ui>) {
  Object.assign(ui, patch);
  notify();
}

export function currentMonth() { return seoulMonth(); }
export function seoulDate() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function givenName(name: string) {
  const n = String(name || '').trim();
  if (!n) return '';
  const parts = n.split(/\s+/);
  if (parts.length > 1) return parts[parts.length - 1];
  return n.length >= 3 ? n.slice(1) : n;
}
export function userLabel(u?: Row | null) { return String(u?.givenName || givenName(u?.name) || u?.username || '사용자').trim(); }
export function userColor(u?: Row | null) { return u?.color || '#64748b'; }

export function canManageUsers() {
  const c = store.current;
  return Boolean(c && (c.admin || (c.permissions || []).includes('admin')));
}
export function canOpenPage(key: string) {
  const c = store.current;
  return Boolean(c && (key === 'teamFees' || c.admin || (c.permissions || []).includes(key)));
}
export function assignmentTeam(): Row[] {
  return (store.state?.users || []).filter(u => u.active !== false && (u.approved || u.teamAdded));
}
export function trackerMembers() {
  if (!canOpenPage('work')) return [];
  const c = store.current!;
  return assignmentTeam().filter(m => m.id === c.id || c.admin || (c.trackerAccess || []).includes(m.id));
}
export function trackerLabel(member: Row) { return member.trackerTitle || (member.name || userLabel(member)) + ' 업무 트래커'; }

export function digits(value: unknown) { return String(value ?? '').replace(/[^0-9]/g, ''); }
export function formattedBizno(value: string) {
  const number = digits(value);
  if (number.length !== 10 && number.length !== 11) return value;
  return [number.slice(0, 3), number.slice(3, 5), number.slice(5, 10), number.slice(10)].filter(Boolean).join('-');
}

export const won = (value: number) => Number(value).toLocaleString('ko-KR') + '원';
export const netOfVat = (gross: number) => Math.round(gross * 10 / 11);
export function receiptTotals(rows: Row[]) {
  return rows.reduce((t, row) => {
    const key = ({ 완납: 'paid', 미납: 'unpaid', 수납대기: 'pending' } as Row)[row.status] || 'other';
    t.amount += row.amount;
    t[key] += row.amount;
    return t;
  }, { amount: 0, paid: 0, unpaid: 0, pending: 0, other: 0 } as Record<string, number>);
}
export const feeProducts = ['노무 셋팅 자문', '노무 월 자문', '노무 지원금 자문', '노무 컨설팅'];
export function feeChannelOf(row: Row) {
  if (row.source === 'hyosung') return 'CMS';
  if (row.source === 'transfer') return '계좌이체';
  return '';
}
export function workplaceForFee(row: Row) {
  const companies = store.state!.companies;
  if (row.source === 'transfer') return companies.find(c => c.id === row.companyRef);
  if (!row.cms) return undefined;
  const matches = companies.filter(c => c.cms && String(c.cms) === String(row.cms));
  return matches.length === 1 ? matches[0] : undefined;
}
export const gridCollator = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });

export function overtimeHours(row: Row) {
  if (!row.start || !row.end) return null;
  const minutes = (value: string) => { const [h, m] = value.split(':').map(Number); return h * 60 + m; };
  const elapsed = minutes(row.end) - minutes(row.start);
  return Math.round(Math.max(0, (elapsed < 0 ? elapsed + 1440 : elapsed) / 60 - Number(row.breakHours || 0)) * 100) / 100;
}

export function uuid() { return crypto.randomUUID(); }

// 페이지 이동 (기존 go / openTracker)
export function go(p: string) {
  if (!MENU.some(m => m.id === p) || !canOpenPage(p)) return;
  if (p === 'fee' && ui.feeOpenedFromTracker) { ui.feeAssignee = ''; ui.feeStatus = ''; }
  setUi({ feeOpenedFromTracker: false, trackerOwner: '', companyDetailId: '', trackerWorkplaceRequest: ui.trackerWorkplaceRequest + 1,
    trackerWorkplace: null, page: p });
  window.scrollTo(0, 0);
}
export function openTracker(id: string) {
  if (!trackerMembers().some(m => m.id === id)) return;
  setUi({ page: 'work', trackerWorkplaceRequest: ui.trackerWorkplaceRequest + 1, companyDetailId: '', trackerWorkplace: null, trackerOwner: id });
  window.scrollTo(0, 0);
}
export function openFeeWorkplace(id: string) {
  const company = store.state!.companies.find(c => c.id === id);
  if (!company || !canOpenPage('company')) return;
  ui.companyDetailId = '';
  ui.companyQuery = company.name;
  ui.companyFocusId = id;
  go('company');
}
