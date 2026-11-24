'use client';
// 화면 상태와 서버 동기화. 기존 app.js의 adopt/difference/save 흐름을 그대로 옮겼습니다.
// 화면에서 state를 직접 바꾼 뒤 save()를 부르면, 바뀐 항목만 골라 서버에 보냅니다.
import { useSyncExternalStore } from 'react';

export type Row = Record<string, any>;
export type AppState = Record<string, any> & {
  companies: Row[]; users: Row[]; works: Row[]; fees: Row[]; sales: Row[]; newLeads: Row[]; setupRows: Row[];
  overtimeRows: Row[]; subsidyDiscovery: Row[]; memo: string; settings: { officeName: string };
};

export const collections = ['companies', 'users', 'newLeads', 'sales', 'works', 'fees', 'setupRows', 'overtimeRows', 'subsidyDiscovery'];

type Store = {
  state: AppState | null;
  current: Row | null;
  revision: number;
  baseline: AppState | null;
  pending: number;
  generation: number;
  personalOrders: Record<string, string[]>;
  version: number;
};

export const store: Store = {
  state: null, current: null, revision: -1, baseline: null, pending: 0, generation: 0, personalOrders: {}, version: 0,
};

const listeners = new Set<() => void>();
export function notify() {
  store.version++;
  for (const listener of listeners) listener();
}
export function useStore() {
  return useSyncExternalStore(
    listener => { listeners.add(listener); return () => listeners.delete(listener); },
    () => store.version,
    () => 0,
  );
}

let toastHandler: (message: string) => void = () => {};
export function setToastHandler(handler: (message: string) => void) { toastHandler = handler; }
export function toast(message: string) { toastHandler(message); }

let authHandler: () => void = () => {};
export function setAuthHandler(handler: () => void) { authHandler = handler; }

export async function api(path: string, data?: unknown): Promise<any> {
  const options: RequestInit = data === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  };
  const response = await fetch('/api/' + path, options);
  const result = await response.json().catch(() => ({ error: '서버 응답을 읽지 못했습니다.' }));
  if (!response.ok) throw Object.assign(new Error(result.error), { status: response.status });
  return result;
}

export function adopt(result: { state: AppState; current: Row; revision: number }) {
  store.state = result.state;
  store.current = result.current;
  store.revision = result.revision;
  store.baseline = structuredClone(result.state);
}

const IGNORED = ['id', 'edited', 'companyId', 'teamAdded', 'trackerTitle', 'trackerIcon', 'transferMethod'];

export function difference(before: AppState, after: AppState) {
  const rows: Row[] = [];
  for (const collection of collections) {
    const old = new Map<string, Row>((before[collection] || []).map((r: Row) => [r.id, r]));
    for (const row of [...(after[collection] || [])].reverse()) {
      const previous = old.get(row.id);
      old.delete(row.id);
      const fields = Object.fromEntries(Object.entries(row).filter(([k, v]) =>
        !IGNORED.includes(k) && JSON.stringify(v) !== JSON.stringify(previous?.[k])));
      if (!previous || Object.keys(fields).length) rows.push({ collection, id: row.id, fields });
    }
    for (const id of old.keys()) rows.push({ collection, id, delete: true });
  }
  const patch: Row = { rows };
  for (const key of ['memo', 'settings', 'companyFields', 'privateTrackerFields', 'privateTrackerValues']) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) patch[key] = after[key];
  }
  return patch;
}

export let queued: Promise<boolean> = Promise.resolve(true);
let afterSaveHook: () => void = () => {};
export function setAfterSaveHook(hook: () => void) { afterSaveHook = hook; }

export function save(): Promise<boolean> {
  if (!store.state || !store.baseline) return queued;
  const patch = difference(store.baseline, store.state);
  if (!patch.rows.length && Object.keys(patch).length === 1) { notify(); return queued; }
  store.baseline = structuredClone(store.state);
  const epoch = store.generation;
  store.pending++;
  notify();
  queued = queued.then(async () => {
    if (epoch !== store.generation) return false;
    try {
      const result = await api('state', { ...patch, revision: store.revision });
      // 다른 저장이 대기 중이 아닐 때만 서버 상태로 맞춥니다. revision도 이때만 올립니다(충돌 판단 기준).
      if (store.pending === 1) { adopt(result); afterSaveHook(); }
      return true;
    } catch (error: any) {
      store.generation++;
      if (error.status === 401) authHandler();
      else {
        try { adopt(await api('state')); }
        catch { authHandler(); }
      }
      toast(error.message || '저장에 실패했습니다.');
      return false;
    } finally {
      store.pending--;
      notify();
    }
  });
  return queued;
}

// 다른 사용자의 변경을 주기적으로 반영합니다. 입력 중이거나 창이 열려 있으면 기다립니다.
export function busy() {
  if (typeof document === 'undefined') return true;
  return Boolean(store.pending || document.querySelector('#ysPicker, .modal-backdrop, dialog[open], .generic-filter-menu')
    || document.activeElement?.matches('input:not([type="checkbox"]),textarea,select'));
}

export async function poll() {
  if (!store.current || busy()) return;
  const initial = store.revision;
  try {
    const { revision } = await api('revision');
    if (revision === initial) return;
    const result = await api('state');
    if (!store.current || busy() || initial !== store.revision || result.revision === store.revision) return;
    adopt(result);
    notify();
  } catch (error: any) {
    if (error.status === 401 && !store.pending) authHandler();
  }
}

export async function loadColumnOrders() {
  store.personalOrders = {};
  try { store.personalOrders = await api('column-orders'); }
  catch { toast('개인 열 순서를 불러오지 못했습니다.'); }
}

let orderWrites: Promise<unknown> = Promise.resolve();
export function saveColumnOrder(group: string, order: string[]) {
  const owner = store.current?.id;
  store.personalOrders[group] = order;
  notify();
  orderWrites = orderWrites.then(async () => {
    if (store.current?.id !== owner) return;
    try { await api('column-orders', { group, order }); }
    catch { toast('열 순서를 저장하지 못했습니다.'); }
  });
}
export function pendingOrderWrites() { return orderWrites; }

export function orderedKeys(group: string, defaults: string[]) {
  const stored = [...new Set((store.personalOrders[group] || []).filter(key => defaults.includes(key)))];
  if (group === 'labor' && stored.length) {
    for (const [newKey, nextKey] of [['requested', 'received'], ['started', 'sent']]) {
      const index = stored.indexOf(nextKey);
      if (index >= 0 && defaults.includes(newKey) && !stored.includes(newKey)) stored.splice(index, 0, newKey);
    }
  }
  return [...new Set([...stored, ...defaults])];
}
