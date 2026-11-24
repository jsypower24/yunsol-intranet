// 동시 수정 충돌 판단.
// 화면을 불러온 시점(revision) 이후에 다른 사람이 같은 행의 "같은 항목"을 바꿨을 때만 충돌로 봅니다.
// 서로 다른 행이나 같은 행의 다른 항목을 고친 경우에는 둘 다 저장됩니다. 본인이 직전에 저장한 내용은 충돌로 보지 않습니다.
import type { Prisma } from '@prisma/client';
import type { ChangeBody } from './change';
import { ApiError, Row, State } from './rules';

const LABELS: Record<string, string> = {
  companies: '사업장', works: '업무', setupRows: '신규 사업장', users: '팀원', sales: '영업자', fees: '수수료',
  overtimeRows: '연장근무', subsidyDiscovery: '지원금 발굴', newLeads: '신규 문의',
};

export async function assertNoConflicts(tx: Prisma.TransactionClient, state: State, body: ChangeBody, revision: number, userId: string) {
  const ops = body.rows || [];
  const settingKeys = (['memo', 'settings'] as const).filter(k => k in body);
  if (!ops.length && !settingKeys.length) return;
  const logs = await tx.changeLog.findMany({
    where: {
      id: { gt: BigInt(revision) },
      AND: [
        { OR: [{ userId: null }, { userId: { not: userId } }] },
        { OR: [
          ...ops.map(op => ({ collection: String(op.collection), rowId: String(op.id) })),
          ...settingKeys.map(k => ({ collection: 'settings', rowId: k })),
        ] },
      ],
    },
    select: { collection: true, rowId: true, action: true, fields: true, userName: true },
  });
  if (!logs.length) return;
  for (const op of ops) {
    const related = logs.filter(l => l.collection === op.collection && l.rowId === op.id);
    if (!related.length) continue;
    const rows: Row[] = (state as any)[op.collection] || [];
    const current = rows.find(r => r.id === op.id);
    const who = related[related.length - 1].userName || '다른 사용자';
    if (related.some(l => l.action === 'delete') && !current && !op.delete) {
      throw new ApiError(409, `${who}님이 이 ${LABELS[op.collection] || '항목'}을(를) 삭제했습니다. 최신 화면을 불러왔습니다.`);
    }
    if (op.delete || !current) continue;
    const touched = new Set(related.flatMap(l => l.fields));
    const clashes = Object.entries(op.fields || {}).filter(([k, v]) =>
      (touched.has(k) || (k === 'password' && touched.has('secret'))) && JSON.stringify(current[k]) !== JSON.stringify(v));
    if (clashes.length) {
      const name = current.name ? `「${current.name}」 ` : '';
      throw new ApiError(409, `${who}님이 방금 ${name}${LABELS[op.collection] || '항목'}의 같은 칸을 수정했습니다. 최신 내용을 불러왔으니 다시 입력해주세요.`);
    }
  }
  for (const key of settingKeys) {
    const related = logs.filter(l => l.collection === 'settings' && l.rowId === key);
    if (related.length && JSON.stringify((state as any)[key]) !== JSON.stringify((body as any)[key])) {
      throw new ApiError(409, `${related[related.length - 1].userName || '다른 사용자'}님이 방금 ${key === 'memo' ? '정리메모' : '설정'}를 수정했습니다. 최신 내용을 불러왔으니 다시 입력해주세요.`);
    }
  }
}
