'use client';
// 표 열 정의 (기존 app.js와 동일)
import { store } from './store';
import { ui } from './lib';

export type ColDef = [string, string, string?];

export const setupColumns: ColDef[] = [
  ['bizno', '사업자등록번호', 'link'], ['name', '자문자명', 'link'], ['comm', '소통담당자', 'link'],
  ['baseManagers', '기초 담당', 'people'], ['temporaryManagers', '배정(임시)', 'people'],
  ['contractSetup', '근로계약서 세팅', 'check'], ['setupFee', '세팅비'], ['firstDebit', '수수료 최초출금'],
  ['workStart', '업무시작일'], ['payrollStart', '급여 시작 시기'], ['subsidy', '지원금'],
  ['previousAgencyDismissed', '전임 기관 해임', 'check'], ['taxRequest', '세무 자료 요청', 'check'],
  ['reportNeeded', '성립신고 필요 여부', 'check'], ['reportCompleted', '성립신고', 'check'],
  ['adviceContract', '자문계약서', 'check'], ['folderCreated', '자문사 폴더 생성', 'check'],
  ['cmsMember', 'cms 회원등록', 'check'], ['setupDebit', '세팅비 출금', 'check'], ['cmsBill', 'cms 청구등록', 'check'],
  ['edi', 'edi수임', 'check'], ['employeeRoster', '근로자명부 작성', 'check'], ['notion', '노션등록', 'check'],
  ['googleSheet', '구글시트 등록', 'check'], ['hrHelper', '인사헬퍼 등록', 'check'],
  ['certificateReceived', '공인인증서 수령', 'check'], ['specialNotes', '특이사항'],
];

export const categories = ['진행(자문)', '진행(지원금)', '종료'];

export const companyBaseColumns: ColDef[] = [
  ['category', '분류', 'category'], ['setup', '세팅', 'check'], ['name', '업체명'], ['cms', 'CMS번호'], ['mainManagers', '급여담당', 'people'],
  ['feeOwners', '수수료 귀속', 'people'], ['bizno', '사업자등록번호'], ['ceo', '대표자성명'], ['related', '연관업체'],
  ['sales', '영업자'], ['comm', '소통담당자'], ['phone', '연락처'], ['address', '주소'], ['bookFee', '기장수수료'],
  ['supportFee', '지원금 수수료'], ['paymentMethod', '월 수수료 수납 방식', 'payment'], ['transferMethod', '이체 수단', 'transfer'],
  ['payday', '급여일'], ['closedOn', '종료일자', 'date'], ['closureReason', '종료사유'], ['edited', '최종편집일', 'edited'],
];
export function companyColumns(fields = store.state?.companyFields || []): ColDef[] {
  return [...companyBaseColumns, ...fields.map((f: { id: string; label: string }) => [f.id, f.label] as ColDef)];
}

export const laborChecks: ColDef[] = [
  ['requested', '자료요청', 'check'], ['received', '자료수령', 'check'], ['started', '작업시작', 'check'],
  ['sent', '사업장 전달', 'check'], ['payslip', '명세서 발송', 'check'], ['accounting', '회계 자료 전달', 'check'],
  ['feeChecked', '수수료 확인', 'check'], ['employment', '취·상실', 'check'], ['insurance', '취상실 검토', 'check'],
];
const links: ColDef[] = [['name', '업체명', 'link'], ['bizno', '사업자등록번호', 'link']];
const end: ColDef = ['closed', '종료', 'status'];
const edited: ColDef = ['edited', '최종편집일', 'edited'];
const reset: ColDef = ['reset', '리셋', 'reset'];
export const labor: ColDef[] = [...links, ['payday', '급여일'], ['month', '귀속월', 'month'], ...laborChecks, ['roster', '취상실 명단'],
  ['note', '메모'], ['closed', '계약상태', 'status'], reset, ['accountingInfo', '세무 대리인'], edited];
export const otherChecks: ColDef[] = [
  ['received', '자료수령', 'check'], ['sent', '전달·신청', 'check'], ['accounting', '회계·보완', 'check'], ['feeChecked', '수수·확인', 'check'],
];
export const other: ColDef[] = [['deadline', '데드라인'], ...links, ['classTags', '구분', 'tags'], ...otherChecks, reset, ['note', '메모'], end,
  ['hire', '입사일·휴직일'], ['worker', '근로자'], ['round', '예정 회차'], ['when', '언제'], ['selection', '선택'],
  ['agency', '기관'], ['fee', '수수료'], edited];

export function trackerColumns(kind: string, includePrivate = false): ColDef[] {
  const shared = kind === 'labor' ? labor : other;
  const fields = ui.trackerOwner === store.current?.id || includePrivate ? store.state?.privateTrackerFields || [] : [];
  return [...shared, ...fields.map((f: { id: string; label: string }) => [f.id, f.label, 'private-tracker'] as ColDef)];
}

export const gridWidthDefaults: Record<string, number> = {
  category: 132, name: 145, bizno: 145, edited: 162, mainManagers: 105, feeOwners: 108, classTags: 145, note: 150, roster: 150, manage: 88,
};
