// 데이터베이스 행 ↔ 화면용 상태(state) 변환과 변경분 저장.
// 업무 규칙은 상태 전체를 보고 판단해야 하므로 쓰기 작업은 다음 순서로 진행합니다.
//   1) 쓰기 잠금을 잡고 상태를 읽는다  2) 규칙에 따라 상태를 바꾼다  3) 바뀐 행만 찾아 저장하고 이력을 남긴다
import { Prisma, PrismaClient } from '@prisma/client';
import { digits, emptyState, Row, State } from './rules';

export type Tx = Prisma.TransactionClient | PrismaClient;

const META = new Set(['version', 'createdAt', 'updatedAt', 'updatedById']);

type Spec = {
  model: string;
  fromDb: (record: Row) => Row;
  toDb: (row: Row) => Row;
};

function stripMeta(record: Row) {
  const out: Row = {};
  for (const [k, v] of Object.entries(record)) if (!META.has(k)) out[k] = v;
  return out;
}

const SPECS: Record<string, Spec> = {
  users: {
    model: 'user',
    fromDb: r => {
      const row = stripMeta(r);
      row.username = row.username ?? '';
      row.performanceBase = Number(row.performanceBase ?? 0);
      if (row.trackerIcon == null) delete row.trackerIcon;
      if (row.secret == null) delete row.secret;
      return row;
    },
    toDb: row => ({
      id: row.id, username: row.username ? row.username : null, name: row.name ?? '', givenName: row.givenName ?? '',
      secret: row.secret ?? null, admin: Boolean(row.admin), approved: Boolean(row.approved), active: row.active !== false,
      teamAdded: Boolean(row.teamAdded), permissions: row.permissions ?? [], trackerAccess: row.trackerAccess ?? [],
      color: row.color || '#3b82f6', birthDate: row.birthDate ?? '', workPhone: row.workPhone ?? '', extension: row.extension ?? '',
      phone: row.phone ?? '', dept: row.dept ?? '', position: row.position ?? '', performanceBase: BigInt(row.performanceBase || 0),
      trackerTitle: row.trackerTitle ?? '', trackerIcon: row.trackerIcon ?? Prisma.DbNull, edited: row.edited ?? '',
    }),
  },
  companies: {
    model: 'company',
    fromDb: r => {
      const { custom, biznoDigits, ...rest } = stripMeta(r);
      if (rest.detailImages == null) delete rest.detailImages;
      if (rest.detailBlocks == null) delete rest.detailBlocks;
      return { ...rest, ...(custom as Row || {}) };
    },
    toDb: row => {
      const custom: Row = {};
      for (const [k, v] of Object.entries(row)) if (k.startsWith('custom_')) custom[k] = v;
      const text = (k: string) => (row[k] ?? '') as string;
      return {
        id: row.id, category: row.category || '진행(자문)', setup: row.setup === true,
        name: text('name'), cms: String(row.cms ?? ''), bizno: text('bizno'), biznoDigits: digits(row.bizno), ceo: text('ceo'),
        related: text('related'), sales: text('sales'), comm: text('comm'), phone: text('phone'), address: text('address'),
        bookFee: text('bookFee'), supportFee: text('supportFee'), payday: text('payday'), status: text('status'),
        paymentMethod: text('paymentMethod'), transferMethod: text('transferMethod'), closedOn: text('closedOn'),
        closureReason: text('closureReason'), detailNotes: text('detailNotes'),
        detailImages: row.detailImages ?? Prisma.DbNull, detailBlocks: row.detailBlocks ?? Prisma.DbNull,
        lastActiveCategory: text('lastActiveCategory'), mainManagers: row.mainManagers ?? [], feeOwners: row.feeOwners ?? [],
        custom, edited: text('edited'),
      };
    },
  },
  works: {
    model: 'work',
    fromDb: r => stripMeta(r),
    toDb: row => {
      const out: Row = { id: row.id, companyId: row.companyId, classTags: row.classTags ?? [], closed: row.closed || '진행', edited: row.edited ?? '' };
      for (const k of 'month payday roster note accountingInfo deadline hire worker round when selection agency fee'.split(' ')) out[k] = row[k] ?? '';
      for (const k of 'requested started received sent payslip accounting feeChecked employment daily insurance'.split(' ')) out[k] = row[k] === true;
      return out;
    },
  },
  setupRows: {
    model: 'setupRow',
    fromDb: r => stripMeta(r),
    toDb: row => {
      const out: Row = { id: row.id, baseManagers: row.baseManagers ?? [], temporaryManagers: row.temporaryManagers ?? [], edited: row.edited ?? '' };
      for (const k of ('contractSetup previousAgencyDismissed taxRequest reportNeeded reportCompleted adviceContract folderCreated ' +
        'cmsMember setupDebit cmsBill edi employeeRoster notion googleSheet hrHelper certificateReceived').split(' ')) out[k] = row[k] === true;
      for (const k of 'setupFee firstDebit workStart payrollStart subsidy specialNotes'.split(' ')) out[k] = row[k] ?? '';
      return out;
    },
  },
  sales: {
    model: 'salesPerson',
    fromDb: r => stripMeta(r),
    toDb: row => ({ id: row.id, name: String(row.name ?? ''), phone: String(row.phone ?? ''), org: String(row.org ?? ''),
      rate: String(row.rate ?? ''), note: String(row.note ?? ''), edited: row.edited ?? '' }),
  },
  newLeads: {
    model: 'newLead',
    fromDb: r => ({ ...(r.data as Row), id: r.id, edited: r.edited }),
    toDb: row => {
      const { id, edited, ...data } = row;
      return { id, data, edited: edited ?? '' };
    },
  },
  fees: {
    model: 'fee',
    fromDb: r => {
      const row = stripMeta(r);
      row.amount = Number(row.amount);
      if (row.source === 'hyosung') delete row.companyRef;
      return row;
    },
    toDb: row => ({
      id: row.id, source: row.source ?? '', cms: String(row.cms ?? ''), memberName: row.memberName ?? '', billingMonth: row.billingMonth ?? '',
      product: row.product ?? '', amount: BigInt(Math.trunc(Number(row.amount) || 0)), status: row.status ?? '', method: row.method ?? '',
      contractDay: String(row.contractDay ?? ''), date: String(row.date ?? ''), companyRef: row.companyRef ?? '', edited: row.edited ?? '',
    }),
  },
  overtimeRows: {
    model: 'overtimeRow',
    fromDb: r => {
      const row = stripMeta(r);
      row.breakHours = row.breakHours ?? '';
      row.usedHours = row.usedHours ?? '';
      return row;
    },
    toDb: row => ({
      id: row.id, date: row.date, memberId: row.memberId, start: row.start ?? '', end: row.end ?? '',
      breakHours: row.breakHours === '' || row.breakHours == null ? null : Number(row.breakHours),
      usedHours: row.usedHours === '' || row.usedHours == null ? null : Number(row.usedHours),
      reason: row.reason ?? '', note: row.note ?? '', edited: row.edited ?? '',
    }),
  },
  subsidyDiscovery: {
    model: 'subsidyDiscovery',
    fromDb: r => {
      const row = stripMeta(r);
      row.headcount = row.headcount ?? '';
      return row;
    },
    toDb: row => ({
      id: row.id, date: row.date, memberIds: row.memberIds ?? [], companyIds: row.companyIds ?? [], type: row.type ?? '',
      headcount: row.headcount === '' || row.headcount == null ? null : Number(row.headcount),
      status: row.status ?? '', note: row.note ?? '', edited: row.edited ?? '',
    }),
  },
  invoices: {
    model: 'invoice',
    fromDb: r => ({ ...r, amount: Number(r.amount) }),
    toDb: row => ({
      id: row.id, cms: String(row.cms ?? ''), billingMonth: row.billingMonth ?? '', transmission: row.transmission ?? '',
      amount: BigInt(Math.trunc(Number(row.amount) || 0)), written: row.written ?? '', issued: row.issued ?? '',
      approval: row.approval ?? '', source: row.source ?? 'hyosung',
    }),
  },
};

// 행 순서: 기존 화면은 새 행을 맨 위에 두었으므로 생성일 역순으로 읽습니다.
const ORDER: Record<string, Row> = {
  users: [{ admin: 'desc' }, { createdAt: 'asc' }],
  companies: { createdAt: 'desc' }, works: { createdAt: 'asc' }, setupRows: { createdAt: 'asc' }, sales: { createdAt: 'desc' },
  newLeads: { createdAt: 'desc' }, fees: { createdAt: 'asc' }, overtimeRows: { createdAt: 'desc' },
  subsidyDiscovery: { createdAt: 'desc' }, invoices: { id: 'asc' },
};

function delegate(tx: Tx, model: string): any {
  return (tx as any)[model];
}

export async function loadState(tx: Tx): Promise<State> {
  const state = emptyState() as any;
  for (const [key, spec] of Object.entries(SPECS)) {
    const records: Row[] = await delegate(tx, spec.model).findMany({ orderBy: ORDER[key] });
    state[key] = records.map(spec.fromDb);
  }
  for (const item of await tx.feeImport.findMany()) state.feeImports[item.month] = isoMinutes(item.importedAt);
  for (const item of await tx.appSetting.findMany()) {
    if (item.key === 'memo') state.memo = item.value as string;
    if (item.key === 'settings') state.settings = item.value as State['settings'];
    if (item.key === 'companyFields') state.companyFields = item.value as State['companyFields'];
  }
  for (const item of await tx.privateTracker.findMany()) {
    state.privateTrackers[item.userId] = { fields: item.fields as any, values: item.values as any };
  }
  return state;
}

export function isoMinutes(date: Date) {
  const seoul = new Date(date.getTime() + 9 * 3600_000);
  return seoul.toISOString().slice(0, 16) + '+09:00';
}

export async function latestRevision(tx: Tx): Promise<number> {
  const last = await tx.changeLog.findFirst({ orderBy: { id: 'desc' }, select: { id: true } });
  return last ? Number(last.id) : 0;
}

// 쓰기 작업 직렬화: 짧은 트랜잭션 동안만 잠급니다. 충돌 판단은 행·항목 단위입니다.
export async function lockWrites(tx: Prisma.TransactionClient) {
  await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(424242)');
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

type Actor = { id: string | null; name: string };

// 상태 변경분을 찾아 저장하고 변경 이력을 남깁니다.
export async function persistDiff(tx: Prisma.TransactionClient, before: State, after: State, actor: Actor) {
  const logs: Prisma.ChangeLogCreateManyInput[] = [];
  // 부모 행(사업장, 팀원)을 먼저 만들고, 자식 행을 먼저 지웁니다.
  const createOrder = ['users', 'companies', 'works', 'setupRows', 'sales', 'newLeads', 'fees', 'invoices', 'overtimeRows', 'subsidyDiscovery'];
  const deletions: [string, string[]][] = [];
  for (const key of createOrder) {
    const spec = SPECS[key];
    const old = new Map<string, Row>(((before as any)[key] as Row[]).map(r => [r.id, r]));
    const rows: Row[] = (after as any)[key];
    const model = delegate(tx, spec.model);
    // 새로 만든 행이 목록 맨 앞에 오도록 역순으로 생성합니다.
    for (const row of [...rows].reverse()) {
      const previous = old.get(row.id);
      old.delete(row.id);
      if (!previous) {
        await model.create({ data: { ...spec.toDb(row), ...(key === 'invoices' ? {} : { updatedById: actor.id }) } });
        logs.push({ userId: actor.id, userName: actor.name, collection: key, rowId: row.id, action: 'create',
          fields: Object.keys(row).filter(k => k !== 'id' && k !== 'secret'), after: redact(row) });
        continue;
      }
      const changed = [...new Set([...Object.keys(row), ...Object.keys(previous)])].filter(k => !same(row[k], previous[k]));
      if (!changed.length) continue;
      const data = spec.toDb(row);
      if (key !== 'invoices') Object.assign(data, { version: { increment: 1 }, updatedById: actor.id });
      delete data.id;
      await model.update({ where: { id: row.id }, data });
      logs.push({ userId: actor.id, userName: actor.name, collection: key, rowId: row.id, action: 'update', fields: changed,
        before: pick(redact(previous), changed), after: pick(redact(row), changed) });
    }
    if (old.size) deletions.push([key, [...old.keys()]]);
  }
  for (const [key, ids] of deletions.reverse()) {
    const spec = SPECS[key];
    const oldRows = new Map(((before as any)[key] as Row[]).map(r => [r.id, r]));
    await delegate(tx, spec.model).deleteMany({ where: { id: { in: ids } } });
    for (const id of ids) logs.push({ userId: actor.id, userName: actor.name, collection: key, rowId: id, action: 'delete',
      fields: [], before: redact(oldRows.get(id) || {}) });
  }
  for (const key of ['memo', 'settings', 'companyFields'] as const) {
    if (same(before[key], after[key])) continue;
    await tx.appSetting.upsert({ where: { key }, create: { key, value: after[key] as any, updatedById: actor.id },
      update: { value: after[key] as any, updatedById: actor.id } });
    logs.push({ userId: actor.id, userName: actor.name, collection: 'settings', rowId: key, action: 'update', fields: [key],
      before: before[key] as any, after: after[key] as any });
  }
  for (const [userId, profile] of Object.entries(after.privateTrackers)) {
    if (same(before.privateTrackers[userId], profile)) continue;
    await tx.privateTracker.upsert({ where: { userId }, create: { userId, fields: profile.fields as any, values: profile.values as any },
      update: { fields: profile.fields as any, values: profile.values as any } });
    logs.push({ userId: actor.id, userName: actor.name, collection: 'privateTrackers', rowId: userId, action: 'update', fields: ['privateTracker'] });
  }
  for (const [month, at] of Object.entries(after.feeImports)) {
    if (before.feeImports[month] === at) continue;
    await tx.feeImport.upsert({ where: { month }, create: { month, importedAt: new Date(at) }, update: { importedAt: new Date(at) } });
    logs.push({ userId: actor.id, userName: actor.name, collection: 'feeImports', rowId: month, action: 'update', fields: ['importedAt'] });
  }
  if (logs.length) await tx.changeLog.createMany({ data: logs });
  return logs.length;
}

function redact(row: Row) {
  const { secret, password, detailImages, detailBlocks, trackerIcon, ...rest } = row;
  const out: Row = { ...rest };
  if (detailBlocks) out.detailBlocks = `[본문 블록 ${(detailBlocks as Row[]).length}개]`;
  if (detailImages) out.detailImages = `[이미지 ${(detailImages as Row[]).length}장]`;
  if (trackerIcon) out.trackerIcon = (trackerIcon as Row).kind;
  if (secret) out.secret = '[변경됨]';
  return out;
}

function pick(row: Row, keys: string[]) {
  return Object.fromEntries(keys.map(k => [k, row[k] ?? null]));
}
