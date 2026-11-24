// 사용법: npm run cms-import -- 청구목록.xlsx 세금계산서_발급목록.xlsx --month 2026-11
import { prisma } from '../src/server/db';
import { ingest } from '../src/server/cms';

async function main() {
  const args = process.argv.slice(2);
  const at = args.indexOf('--month');
  const target = at >= 0 ? args.splice(at, 2)[1] : new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' }).format(new Date());
  const [bills, invoices] = args;
  if (!bills || !invoices) throw new Error('사용법: npm run cms-import -- 청구목록.xlsx 세금계산서_발급목록.xlsx --month 2026-11');
  const result = await ingest(bills, invoices, target);
  console.log(`청구 ${result.bills}건 · 세금계산서 ${result.invoices}건 반영`);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
