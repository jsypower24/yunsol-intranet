// 효성CMS 청구 목록·세금계산서 발급 목록 엑셀 반영 (기존 cms_import.py)
import { createHash } from 'node:crypto';
import ExcelJS from 'exceljs';
import { prisma } from './db';
import { Row } from './rules';
import { isoMinutes, loadState, lockWrites, persistDiff } from './store';

const SOURCE = 'hyosung';

export function month(value: unknown) {
  const match = /^([0-9]{4})[/-](0?[1-9]|1[0-2])$/.exec(String(value ?? '').trim());
  if (!match) throw new Error('청구월 형식을 확인해주세요.');
  return `${match[1]}-${String(Number(match[2])).padStart(2, '0')}`;
}

function valueText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 19).replace('T', ' ');
  if (typeof value === 'object') {
    const v = value as Row;
    if ('result' in v) return valueText(v.result);
    if ('richText' in v) return v.richText.map((t: Row) => t.text).join('');
    if ('text' in v) return String(v.text);
  }
  return String(value);
}

export function amount(value: unknown) {
  const text = valueText(value).replace(/,/g, '').trim();
  if (!/^-?[0-9]+(\.0+)?$/.test(text)) throw new Error('금액은 원 단위 정수여야 합니다.');
  return Number.parseInt(text, 10);
}

async function records(path: string | Buffer, fields: string[]) {
  const book = new ExcelJS.Workbook();
  if (typeof path === 'string') await book.xlsx.readFile(path); else await book.xlsx.load(path as any);
  const sheet = book.worksheets[0];
  const headers = (sheet.getRow(1).values as unknown[]).map(v => valueText(v));
  const missing = fields.filter(f => !headers.includes(f));
  if (missing.length) throw new Error('필수 열 누락: ' + missing.sort().join(', '));
  const out: Row[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const values = sheet.getRow(r).values as unknown[];
    if (!values.some((v, i) => i > 0 && v !== null && v !== undefined)) continue;
    out.push(Object.fromEntries(fields.map(f => [f, values[headers.indexOf(f)] ?? null])));
  }
  return out;
}

export async function readBills(path: string | Buffer, target: string) {
  const fields = ['회원번호', '회원명', '청구월', '상품', '청구금액', '수납상태', '결제수단', '약정일', '결제일(납부기간)'];
  return (await records(path, fields)).map(row => {
    const period = month(valueText(row['청구월']));
    if (period !== target) throw new Error('청구 목록에 대상 월과 다른 내역이 있습니다.');
    const [member, name, product, status, method, contract, paid] =
      ['회원번호', '회원명', '상품', '수납상태', '결제수단', '약정일', '결제일(납부기간)'].map(k => valueText(row[k]));
    if (!member || !product || !status || !method) throw new Error('청구 목록의 필수 값이 비어 있습니다.');
    return { cms: member, memberName: name, billingMonth: period, product, amount: amount(row['청구금액']), status, method,
      contractDay: contract, date: paid, source: SOURCE } as Row;
  });
}

export async function readInvoices(path: string | Buffer, target: string) {
  const fields = ['회원번호', '청구월', '국세청전송상태', '발급금액', '작성일', '발급일', '발급승인번호'];
  return (await records(path, fields)).map(row => {
    const written = valueText(row['작성일']).slice(0, 10);
    if (month(written.slice(0, 7)) !== target) throw new Error('세금계산서 목록에 대상 작성월과 다른 내역이 있습니다.');
    const member = valueText(row['회원번호']);
    if (!member) throw new Error('세금계산서의 회원번호가 비어 있습니다.');
    return { cms: member, billingMonth: row['청구월'] ? month(valueText(row['청구월'])) : '', transmission: valueText(row['국세청전송상태']),
      amount: amount(row['발급금액']), written, issued: valueText(row['발급일']).slice(0, 10), approval: valueText(row['발급승인번호']), source: SOURCE } as Row;
  });
}

export async function ingest(billsPath: string | Buffer, invoicesPath: string | Buffer, targetMonth: string, now = new Date()) {
  const target = month(targetMonth);
  const bills = await readBills(billsPath, target);
  const invoices = await readInvoices(invoicesPath, target);
  const counts = new Map<string, number>();
  for (const bill of bills) {
    const key = JSON.stringify(['billingMonth', 'cms', 'product', 'method', 'contractDay'].map(k => bill[k]));
    counts.set(key, (counts.get(key) || 0) + 1);
    bill.id = 'cms-' + createHash('sha256').update(key + '#' + counts.get(key)).digest('hex').slice(0, 24);
  }
  invoices.forEach((invoice, index) => {
    invoice.id = 'inv-' + createHash('sha256').update(JSON.stringify([target, invoice.approval, invoice.cms, invoice.written, index])).digest('hex').slice(0, 24);
  });
  await prisma.$transaction(async tx => {
    await lockWrites(tx);
    const before = await loadState(tx);
    const state = structuredClone(before);
    const active = new Set(state.fees.filter(r => r.source === SOURCE && r.billingMonth === target));
    if (active.size && !bills.length) throw new Error('기존 청구 자료가 있어 빈 파일로 교체할 수 없습니다.');
    const activeInvoices = new Set(state.invoices.filter(r => String(r.written || '').startsWith(target + '-')));
    if (activeInvoices.size && !invoices.length) throw new Error('기존 발급 자료가 있어 빈 파일로 교체할 수 없습니다.');
    state.fees = [...state.fees.filter(r => !active.has(r)), ...bills];
    state.invoices = [...state.invoices.filter(r => !activeInvoices.has(r)), ...invoices];
    state.feeImports[target] = isoMinutes(now);
    await persistDiff(tx, before, state, { id: null, name: '효성CMS 반영' });
  }, { timeout: 120_000 });
  return { bills: bills.length, invoices: invoices.length };
}

// 예약 반영일: 매월 5·10·15·20·25일과 말일 (한국시간)
export function isScheduled(day: Date) {
  const seoul = new Date(day.getTime() + 9 * 3600_000);
  const last = new Date(Date.UTC(seoul.getUTCFullYear(), seoul.getUTCMonth() + 1, 0)).getUTCDate();
  return [5, 10, 15, 20, 25, last].includes(seoul.getUTCDate());
}
