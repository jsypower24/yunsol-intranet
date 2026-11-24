// 사용자 권한에 맞춰 화면에 내려줄 데이터만 골라냅니다. (기존 server.py의 project())
import { allowed, OVERTIME_FIELDS, ownsOvertime, publicUser, Row, selectableTeam, State, tracked, trackerTargets } from './rules';

type Attribution = [Row, Row | undefined, { id: string; name: string }[]];

export function* feeAttributions(state: State): Generator<Attribution> {
  const members = new Map(state.users.map(u => [u.id as string, (u.name || u.givenName || '팀원') as string]));
  const companies = new Map(state.companies.map(c => [c.id as string, c]));
  const cms = new Map<string, Row[]>();
  for (const company of state.companies) {
    if (company.cms) {
      const key = String(company.cms);
      cms.set(key, [...(cms.get(key) || []), company]);
    }
  }
  for (const fee of state.fees) {
    if (fee.source !== 'hyosung' && fee.source !== 'transfer') continue;
    const matches = cms.get(String(fee.cms || '')) || [];
    const company = fee.source === 'transfer' ? companies.get(fee.companyRef) : (matches.length === 1 ? matches[0] : undefined);
    const owners = ((company?.feeOwners || []) as string[]).filter(i => members.has(i)).map(i => ({ id: i, name: members.get(i)! }));
    yield [fee, company, owners];
  }
}

export function teamFeeRows(state: State, viewer: Row, attributions: Attribution[]) {
  const full = allowed(viewer, 'teamFees');
  const rows: Row[] = [];
  for (const [fee, company, owners] of attributions) {
    const permitted = full ? owners : owners.filter(o => o.id === viewer.id);
    if (full || permitted.length) {
      const row: Row = {
        billingMonth: fee.billingMonth, product: fee.product, amount: fee.amount, status: fee.status, source: fee.source,
        owners: permitted, joint: owners.length > 1,
      };
      if (row.joint) row.jointDetails = { id: company!.id, name: company!.name || '', owners };
      rows.push(row);
    }
  }
  return rows;
}

function teamFeeWorkplaces(state: State, viewer: Row) {
  const full = allowed(viewer, 'teamFees');
  return state.companies.filter(c => full || (c.feeOwners || []).includes(viewer.id)).map(c => ({
    id: c.id, name: c.name || '', category: c.category || '', closedOn: c.closedOn || '',
    ownerIds: full ? (c.feeOwners || []) : [viewer.id],
  }));
}

function teamFeeProfiles(state: State, viewer: Row) {
  const full = allowed(viewer, 'teamFees');
  return Object.fromEntries(state.users.filter(u => full || u.id === viewer.id)
    .map(u => [u.id, { performanceBase: u.performanceBase || 0 }]));
}

function privateTrackerState(state: State, user: Row): [Row[], Row] {
  const profile = state.privateTrackers[user.id] || { fields: [], values: {} };
  if (!allowed(user, 'work')) return [[], {}];
  const companies = new Map(state.companies.map(c => [c.id, c]));
  const own = new Set([user.id]);
  const owned = new Set(state.works.filter(w => tracked(companies.get(w.companyId), own)).map(w => w.id));
  return [profile.fields, Object.fromEntries(Object.entries(profile.values).filter(([k]) => owned.has(k)))];
}

const HIDDEN_COMPANY_KEYS = new Set(['detailNotes', 'detailImages', 'detailBlocks', 'transferMethod']);

export function project(state: State, user: Row, revision: number) {
  const companies = new Map(state.companies.map(c => [c.id, c]));
  const targets = trackerTargets(state, user);
  const works = state.works.filter(w => tracked(companies.get(w.companyId), targets));
  let visible: Row[];
  if (allowed(user, 'company') || allowed(user, 'dashboard')) {
    visible = allowed(user, 'company') ? state.companies : state.companies.map(c =>
      Object.fromEntries(Object.entries(c).filter(([k]) => !HIDDEN_COMPANY_KEYS.has(k) && !k.startsWith('custom_'))));
  } else {
    visible = [];
    for (const c of state.companies) {
      const keys = new Set(['id', 'name']);
      if (tracked(c, targets)) ['bizno', 'category', 'mainManagers', 'lastActiveCategory'].forEach(k => keys.add(k));
      if (allowed(user, 'fee') && c.paymentMethod === '계좌이체') keys.add('paymentMethod');
      if (allowed(user, 'new') && c.setup === true) ['bizno', 'comm', 'setup'].forEach(k => keys.add(k));
      if (keys.size > 2) visible.push(Object.fromEntries([...keys].filter(k => k in c).map(k => [k, c[k]])));
    }
  }
  const [privateFields, privateValues] = privateTrackerState(state, user);
  const attributions = [...feeAttributions(state)];
  const manageFees = allowed(user, 'fee');
  const directory: Row = {};
  const ownFees: Row[] = [];
  for (const [fee, company, owners] of attributions) {
    if (!manageFees && !owners.some(o => o.id === user.id)) continue;
    directory[fee.id] = { owners, companyId: company ? company.id : '', companyName: company ? company.name || '' : '' };
    if (!manageFees) {
      ownFees.push(Object.fromEntries(Object.entries(fee).filter(([k]) =>
        ['id', 'memberName', 'billingMonth', 'product', 'amount', 'status', 'method', 'source', 'contractDay', 'date'].includes(k))));
    }
  }
  const feeAccess = allowed(user, 'fee') || allowed(user, 'dashboard');
  const overtime = Object.fromEntries(Object.keys(OVERTIME_FIELDS).map(key =>
    [key, allowed(user, 'overtime') ? ((state as any)[key] as Row[]).filter(row => ownsOvertime(row, user)) : []]));
  return {
    revision,
    current: publicUser(user, true),
    state: {
      companies: visible,
      companyFields: allowed(user, 'company') ? state.companyFields : [],
      privateTrackerFields: privateFields,
      privateTrackerValues: privateValues,
      works,
      users: state.users.filter(u => allowed(user, 'admin') || selectableTeam(u)).map(u => publicUser(u, allowed(user, 'admin'))),
      teamFeeRows: teamFeeRows(state, user, attributions),
      feeDirectory: directory,
      ownFeeDetails: ownFees,
      teamFeeWorkplaces: teamFeeWorkplaces(state, user),
      teamFeeProfiles: teamFeeProfiles(state, user),
      fees: feeAccess ? state.fees : [],
      invoices: feeAccess ? state.invoices.map(({ approval, ...rest }) => rest) : [],
      feeImports: feeAccess ? state.feeImports : {},
      ...overtime,
      overtimeWorkplaces: allowed(user, 'overtime') ? state.companies.filter(c => c.name).map(c => ({ id: c.id, name: c.name })) : [],
      sales: allowed(user, 'sales') ? state.sales : [],
      newLeads: allowed(user, 'new') ? state.newLeads : [],
      setupRows: allowed(user, 'new') ? state.setupRows.filter(r => companies.get(r.id)?.setup === true) : [],
      memo: allowed(user, 'memo') ? state.memo : '',
      settings: state.settings,
    },
  };
}
