// 수임 사업장 정보 엑셀 양식 생성과 업로드 파일 읽기(서버에서 처리)
import ExcelJS from 'exceljs';
import { ApiError } from './rules';

export const COMPANY_IMPORT_COLUMNS: [string, string][] = [
  ['category', '분류'], ['name', '업체명'], ['cms', 'CMS번호'], ['mainManagers', '급여담당'], ['feeOwners', '수수료 귀속'],
  ['bizno', '사업자등록번호'], ['ceo', '대표자성명'], ['related', '연관업체'], ['sales', '영업자'], ['comm', '소통담당자'],
  ['phone', '연락처'], ['address', '주소'], ['bookFee', '기장수수료'], ['supportFee', '지원금 수수료'],
  ['paymentMethod', '월 수수료 수납 방식'], ['payday', '급여일'], ['closedOn', '종료일자'], ['closureReason', '종료사유'],
];
const LEGACY_HEADERS: [string, string][] = [['기장 담당', '급여담당'], ['수수 주인', '수수료 귀속'], ['CMS', 'CMS번호']];

type Field = { id: string; label: string };

function importColumns(fields: Field[]) {
  return [...COMPANY_IMPORT_COLUMNS, ...fields.map(f => [f.id, f.label] as [string, string])];
}

export async function companyTemplate(fields: Field[]) {
  const columns = importColumns(fields);
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('수임 사업장 정보');
  sheet.columns = columns.map(([key, label]) => ({ header: label, key, width: 22, style: { numFmt: '@' } }));
  // 텍스트 서식: 사업자등록번호·CMS번호의 앞자리 0이 사라지지 않게 합니다.
  for (let r = 2; r <= 301; r++) {
    const row = sheet.getRow(r);
    for (let c = 1; c <= columns.length; c++) row.getCell(c).numFmt = '@';
  }
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  return new Uint8Array(await book.xlsx.writeBuffer());
}

function cellText(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if ('formula' in value || 'sharedFormula' in value) throw new Error('수식 또는 오류 셀');
    if ('error' in value) throw new Error('수식 또는 오류 셀');
    if ('richText' in value) return value.richText.map(t => t.text).join('');
    if ('text' in value) return String(value.text);
    if (value instanceof Date) return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number') return cell.text || String(value);
  return String(value);
}

export async function parseCompanySheet(buffer: Buffer, fields: Field[]) {
  const book = new ExcelJS.Workbook();
  try {
    await book.xlsx.load(buffer as any);
  } catch {
    throw new ApiError(400, '엑셀(.xlsx) 파일을 읽을 수 없습니다.');
  }
  const sheet = book.worksheets[0];
  if (!sheet) throw new ApiError(400, '시트가 없습니다.');
  if (sheet.rowCount > 5001 || sheet.columnCount > 250) throw new ApiError(400, '최대 5,000행까지 업로드할 수 있습니다.');
  const headers = new Map<string, number>();
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
    try { headers.set(cellText(cell).trim(), col); } catch { /* 머리글 수식 무시 */ }
  });
  for (const [oldLabel, label] of LEGACY_HEADERS) {
    if (!headers.has(label) && headers.has(oldLabel)) headers.set(label, headers.get(oldLabel)!);
  }
  if (!headers.has('사업자등록번호') || !headers.has('업체명')) throw new ApiError(400, '업체명과 사업자등록번호 열이 필요합니다.');
  const columns = importColumns(fields).filter(([, label]) => headers.has(label));
  const rows: { line: number; fields?: Record<string, string>; error?: string }[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    try {
      const values = Object.fromEntries(columns.map(([key, label]) => [key, cellText(row.getCell(headers.get(label)!))]));
      if (Object.values(values).every(v => v === '')) continue;
      rows.push({ line: r, fields: values });
    } catch (error) {
      rows.push({ line: r, error: (error as Error).message });
    }
  }
  return { rows };
}
