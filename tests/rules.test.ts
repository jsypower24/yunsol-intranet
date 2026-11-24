import { describe, expect, it } from 'vitest';
import { change, syncWorks } from '../src/server/change';
import { project } from '../src/server/project';
import { emptyState, formattedBizno, isDate, Row, stamp, State } from '../src/server/rules';
import { isScheduled, month, amount } from '../src/server/cms';

const admin: Row = { id: 'u0', name: '마스터', admin: true, approved: true, active: true, permissions: [] };
const kim: Row = { id: 'u2', name: '김직원', admin: false, approved: true, active: true, permissions: ['work', 'overtime'] };
const lee: Row = { id: 'u3', name: '이직원', admin: false, approved: true, active: true, permissions: ['work'] };

function base(): State {
  const s = emptyState();
  s.users = [structuredClone(admin), structuredClone(kim), structuredClone(lee)];
  s.companies = [{ id: 'c1', name: '가나', bizno: '123-45-67890', category: '진행(자문)', mainManagers: ['u2'], feeOwners: ['u2', 'u3'], cms: '7' }];
  syncWorks(s, 'now');
  return s;
}
const expectError = (fn: () => void, status: number) => { try { fn(); throw new Error('no error'); } catch (e: any) { expect(e.status).toBe(status); } };

describe('업무 규칙', () => {
  it('사업자등록번호를 하이픈 형식으로 맞추고 자릿수를 검사한다', () => {
    expect(formattedBizno('1234567890')).toBe('123-45-67890');
    const s = base();
    change(s, { rows: [{ collection: 'companies', id: 'c1', fields: { bizno: '0123456789' } }] }, admin);
    expect(s.companies[0].bizno).toBe('012-34-56789');
    expectError(() => change(s, { rows: [{ collection: 'companies', id: 'c1', fields: { bizno: '123' } }] }, admin), 400);
  });
  it('사업장마다 공용 업무 행을 만든다', () => {
    const s = base();
    expect(s.works).toHaveLength(1);
    change(s, { rows: [{ collection: 'companies', id: 'c2', fields: { name: '다라' } }] }, admin);
    expect(s.works.filter(w => w.companyId === 'c2')).toHaveLength(1);
  });
  it('담당 사업장이 아닌 업무는 고칠 수 없다', () => {
    const s = base();
    const workId = s.works[0].id;
    change(s, { rows: [{ collection: 'works', id: workId, fields: { note: '메모' } }] }, s.users[1]);
    expectError(() => change(s, { rows: [{ collection: 'works', id: workId, fields: { note: 'x' } }] }, s.users[2]), 403);
  });
  it('일반 팀원은 관리자 권한을 줄 수 없다', () => {
    const s = base();
    expectError(() => change(s, { rows: [{ collection: 'users', id: 'u2', fields: { permissions: ['admin'] } }] }, s.users[1]), 403);
  });
  it('연장근무는 본인 기록만 다룬다', () => {
    const s = base();
    change(s, { rows: [{ collection: 'overtimeRows', id: 'o1', fields: { date: '2026-11-30', memberId: 'u2', start: '19:00', end: '01:30', breakHours: 0.5 } }] }, s.users[1]);
    expect(s.overtimeRows).toHaveLength(1);
    expectError(() => change(s, { rows: [{ collection: 'overtimeRows', id: 'o2', fields: { date: '2026-11-30', memberId: 'u3' } }] }, s.users[1]), 403);
    expect(isDate('2026-02-30')).toBe(false);
  });
  it('공동 귀속 수수료는 담당자 각자의 집계에 포함된다', () => {
    const s = base();
    s.fees = [{ id: 'f1', source: 'hyosung', cms: '7', billingMonth: '2026-11', product: '노무 월 자문', amount: 110000, status: '완납' }];
    const view = project(s, s.users[2], 1).state;
    expect(view.teamFeeRows).toHaveLength(1);
    expect(view.teamFeeRows[0].joint).toBe(true);
    expect(view.fees).toHaveLength(0);
  });
  it('수정자 표시는 성만 보이고 이름은 가린다', () => {
    expect(stamp({ name: '홍길동' }, new Date('2026-11-24T02:00:00Z'))).toBe('2026.11.24 11:00 | 홍OO');
  });
  it('CMS 예약일과 금액 형식', () => {
    expect(month('2026/3')).toBe('2026-03');
    expect(amount('1,100,000')).toBe(1100000);
    expect(() => amount('10.5')).toThrow();
    expect(isScheduled(new Date('2026-11-29T15:00:00Z'))).toBe(true); // 한국시간 11월 30일(말일)
    expect(isScheduled(new Date('2026-11-04T15:00:00Z'))).toBe(true); // 한국시간 11월 5일
    expect(isScheduled(new Date('2026-11-05T15:00:00Z'))).toBe(false);
  });
});
