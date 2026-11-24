// 기존 데이터 이관
//   npm run import-legacy -- --sqlite /경로/yunsol.sqlite3   코덱스 버전 서버(Python)의 DB를 통째로 옮깁니다.
//   npm run import-legacy -- --browser /경로/yunsol-legacy.json   예전 HTML(브라우저 저장) 데이터를 옮깁니다.
// 두 경우 모두 빈 DB(마스터 계정 1개만 있는 상태)에서 한 번만 실행합니다.
import { readFileSync, existsSync } from 'node:fs';
import { prisma } from '../src/server/db';
import { encrypt, decrypt, paymentKey } from '../src/server/fernet';
import { CLASSES, COMPANY_TEXT, MENUS, Row, rowId, stamp, State } from '../src/server/rules';
import { passwordHash } from '../src/server/password';
import { syncWorks } from '../src/server/change';
import { loadState, lockWrites, persistDiff } from '../src/server/store';

const text = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const uuid = () => crypto.randomUUID().replace(/-/g, '');

function assertEmpty(state: State, allowAdmin: boolean) {
  if (state.companies.length || state.works.length || state.fees.length || state.sales.length || state.memo) {
    throw new Error('빈 데이터베이스에만 최초 이관을 실행할 수 있습니다.');
  }
  if (!allowAdmin && state.users.length) throw new Error('--sqlite 이관은 사용자가 없는 새 DB에서 실행합니다. (마스터 계정도 원본 DB에서 옮겨옵니다)');
}

async function fromSqlite(path: string) {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(path, { readOnly: true });
  const store = db.prepare('SELECT body FROM store WHERE id=1').get() as { body: string } | undefined;
  if (!store) throw new Error('store 테이블을 찾을 수 없습니다.');
  const legacy = JSON.parse(store.body);
  const payments = db.prepare('SELECT company_id, version, encrypted FROM company_payment').all() as Row[];
  const orders = db.prepare('SELECT user_id, name, body FROM column_orders').all() as Row[];
  db.close();

  // 계좌·카드 정보는 기존 키로 풀어서 새 키로 다시 암호화합니다.
  const oldKey = process.env.YUNSOL_OLD_PAYMENT_KEY || (existsSync(path + '.payment.key') ? readFileSync(path + '.payment.key', 'utf8').trim() : '');
  if (payments.length && !oldKey) throw new Error('기존 계좌·카드 암호화 키가 필요합니다. YUNSOL_OLD_PAYMENT_KEY 또는 DB 옆 .payment.key 파일을 준비해주세요.');

  await prisma.$transaction(async tx => {
    await lockWrites(tx);
    const before = await loadState(tx);
    assertEmpty(before, false);
    const after = structuredClone(before);
    for (const key of ['companies', 'newLeads', 'sales', 'users', 'works', 'fees', 'setupRows', 'overtimeRows', 'subsidyDiscovery', 'invoices'] as const) {
      (after as any)[key] = (legacy[key] || []).map((r: Row) => ({ ...r }));
    }
    for (const invoice of after.invoices) invoice.id ||= uuid();
    after.feeImports = legacy.feeImports || {};
    after.memo = text(legacy.memo);
    after.settings = legacy.settings || after.settings;
    after.companyFields = legacy.companyFields || [];
    after.privateTrackers = legacy.privateTrackers || {};
    await persistDiff(tx, before, after, { id: null, name: '이관' });
    const companies = new Set(after.companies.map(c => c.id));
    for (const p of payments) {
      if (!companies.has(p.company_id)) continue;
      const plain = decrypt(oldKey, Buffer.from(p.encrypted as Uint8Array));
      await tx.companyPayment.create({ data: { companyId: p.company_id, version: Number(p.version), encrypted: encrypt(paymentKey(), plain) } });
    }
    const users = new Set(after.users.map(u => u.id));
    for (const o of orders) {
      if (users.has(o.user_id)) await tx.columnOrder.create({ data: { userId: o.user_id, name: o.name, order: JSON.parse(o.body) } });
    }
    console.log(`사용자 ${after.users.length}명 · 사업장 ${after.companies.length}건 · 업무 ${after.works.length}건 · 수수료 ${after.fees.length}건 · ` +
      `연장근무 ${after.overtimeRows.length}건 · 계좌·카드 ${payments.length}건 이관`);
  }, { timeout: 600_000 });
}

// migrate.py를 옮긴 것입니다.
async function fromBrowser(path: string) {
  const legacy = JSON.parse(readFileSync(path, 'utf8').replace(/^﻿/, ''));
  await prisma.$transaction(async tx => {
    await lockWrites(tx);
    const before = await loadState(tx);
    assertEmpty(before, true);
    const admin = before.users.find(u => u.admin);
    if (!admin || before.users.length !== 1) throw new Error('새 DB에 마스터 계정을 한 개 만든 뒤 이관해주세요. (npm run init-admin)');
    const state = structuredClone(before);
    const users = new Map<string, string>();
    const companies = new Map<string, string>();
    const now = stamp(admin);
    const usernames = new Set([admin.username]);
    for (const old of legacy.users || []) {
      if (old.admin) { users.set(old.id, admin.id); continue; }
      const ident = rowId(old.id) && old.id !== 'u0' ? old.id : uuid();
      users.set(old.id, ident);
      const username = text(old.username);
      if (username && usernames.has(username)) throw new Error('사용자 아이디가 중복됩니다. 마스터 아이디 또는 이전 아이디를 확인해주세요.');
      if (username) usernames.add(username);
      const fields: Row = {};
      for (const k of ['name', 'username', 'givenName', 'phone', 'birthDate', 'workPhone', 'extension', 'dept', 'position', 'color']) if (k in old) fields[k] = text(old[k]);
      fields.username ??= '';
      fields.name ??= '';
      fields.color = /^#[a-fA-F0-9]{6}$/.test(fields.color || '') ? fields.color : '#3b82f6';
      Object.assign(fields, { id: ident, admin: false, approved: Boolean(old.approved), active: old.active ?? true,
        permissions: (old.permissions || []).filter((p: string) => (MENUS as readonly string[]).includes(p)) });
      if (old.password) fields.secret = passwordHash(String(old.password));
      state.users.push(fields);
    }
    const mappedIds = (value: unknown) => {
      const seq = Array.isArray(value) ? value : value ? [value] : [];
      return [...new Set(seq.filter(u => users.has(u)).map(u => users.get(u)!))].slice(0, 3);
    };
    for (const old of legacy.companies || []) {
      const ident = rowId(old.id) ? old.id : uuid();
      companies.set(old.id, ident);
      const category = ['category', 'classification', 'status'].map(k => old[k]).find(v => CLASSES.includes(v)) || '기타';
      const fields: Row = {};
      for (const k of COMPANY_TEXT) if (k in old) fields[k] = text(old[k]);
      fields.payday ??= text(old.salaryDay ?? old['월급날']);
      Object.assign(fields, { id: ident, category, edited: text(old.edited) || now,
        mainManagers: mappedIds(old.mainManagers ?? old.mainManager), feeOwners: mappedIds(old.feeOwners ?? old.primaryManager) });
      state.companies.push(fields);
    }
    let orphaned = 0, unknownMonths = 0;
    const ids = new Set<string>();
    for (const old of legacy.works || []) {
      const company = companies.get(old.companyId);
      if (!company) { orphaned++; continue; }
      let ident = old.id;
      if (!rowId(ident) || ids.has(ident)) ident = uuid();
      ids.add(ident);
      let month = text(old.month);
      if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) { unknownMonths++; month = ''; }
      state.works.push({ id: ident, companyId: company, month, requested: Boolean(old.requested), received: Boolean(old.received),
        sent: Boolean(old.sent), payslip: Boolean(old.payslip), feeChecked: Boolean(old.feeChecked), note: text(old.note),
        closed: old.closed === '종료' ? '종료' : '진행', edited: text(old.edited) || now });
    }
    for (const key of ['fees', 'newLeads', 'sales'] as const) {
      (state as any)[key] = (legacy[key] || []).map((r: Row) => ({ ...r, id: rowId(r.id) ? r.id : uuid() }));
    }
    state.memo = text(legacy.memo);
    state.settings.officeName = text(legacy.settings?.officeName) || '윤솔 인트라넷';
    syncWorks(state, now);
    await persistDiff(tx, before, state, { id: admin.id, name: '이관' });
    console.log(`업체 ${state.companies.length}건 · 업무 ${state.works.length}건 · 업체 미연결 업무 ${orphaned}건 · 연도 미확정 귀속월 ${unknownMonths}건`);
  }, { timeout: 600_000 });
}

async function main() {
  const [flag, path] = process.argv.slice(2);
  if (!path || !['--sqlite', '--browser'].includes(flag)) {
    throw new Error('사용법: npm run import-legacy -- --sqlite <yunsol.sqlite3> 또는 --browser <yunsol-legacy.json>');
  }
  if (flag === '--sqlite') await fromSqlite(path); else await fromBrowser(path);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
