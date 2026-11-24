'use client';
// 팝업 창들: 종료 정보, 이체 수단, 트래커 꾸미기, 페이지 접근 권한, 팀원 권한, 팀원 색상
import { useState } from 'react';
import { options } from './cells';
import { assignmentTeam, canManageUsers, canOpenPage, MENU, setUi, trackerLabel, ui, userLabel } from './lib';
import { ModalDialog, showOverlay } from './overlay';
import { adopt, api, notify, queued, Row, save, store, toast } from './store';
import { TrackerIcon } from './TrackerIcon';

export function openClosureForm(row: Row, field: HTMLSelectElement) {
  showOverlay(close => <ClosureDialog row={row} onDone={async values => {
    close();
    if (!values) { field.value = row.category || ''; notify(); return; }
    const latest = store.state!.companies.find(c => c.id === row.id);
    if (!latest) return;
    Object.assign(latest, values, { category: '종료', lastActiveCategory: latest.category || '' });
    await save();
  }} />);
}
function ClosureDialog({ row, onDone }: { row: Row; onDone: (values: null | { closedOn: string; closureReason: string }) => void }) {
  const [closedOn, setClosedOn] = useState(row.closedOn || '');
  const [closureReason, setReason] = useState(row.closureReason || '');
  return (
    <ModalDialog onClose={value => onDone(value === 'save' ? { closedOn, closureReason } : null)}>
      <form method="dialog"><h3>종료 정보</h3>
        <p className="sub">종료일자와 종료사유는 선택 사항입니다.</p>
        <label>종료일자 <input type="date" name="closedOn" value={closedOn} onChange={e => setClosedOn(e.target.value)} /></label>
        <label>종료사유 <textarea name="closureReason" rows={3} value={closureReason} onChange={e => setReason(e.target.value)} /></label>
        <div className="toolbar"><button className="btn" value="cancel">취소</button><button className="btn primary" value="save">종료 적용</button></div>
      </form>
    </ModalDialog>
  );
}

export async function openCompanyPayment(id: string) {
  if (!canOpenPage('company')) return;
  let info: { method: string; fields: Record<string, string>; version: number };
  try { info = await api('company-payment', { id, action: 'read' }); }
  catch (error: any) { toast(error.message || '이체 정보를 불러오지 못했습니다.'); return; }
  if (ui.page !== 'company' && !(ui.page === 'work' && ui.companyDetailId === id)) return;
  showOverlay(close => <PaymentDialog id={id} info={info} onClose={close} />);
}
function PaymentDialog({ id, info, onClose }: { id: string; info: { method: string; fields: Record<string, string>; version: number }; onClose: () => void }) {
  const [method, setMethod] = useState(info.method || '');
  const [fields, setFields] = useState<Record<string, string>>(info.fields || {});
  const [busy, setBusy] = useState(false);
  const field = (key: string, label: string, mode: 'text' | 'numeric' = 'text') => (
    <label key={key}>{label}<input name={key} maxLength={160} inputMode={mode} autoComplete="off" value={fields[key] || ''}
      onChange={e => setFields(f => ({ ...f, [key]: e.target.value }))} /></label>
  );
  return (
    <ModalDialog onClose={onClose}>
      <form onSubmit={async event => {
        event.preventDefault();
        setBusy(true);
        await queued;
        if (!store.current) return;
        const keys = method === '계좌이체' ? ['bank', 'account', 'holder'] : method === '카드' ? ['number', 'expiry', 'holderName'] : [];
        store.pending++;
        try {
          adopt(await api('company-payment', { id, action: 'write', method, fields: Object.fromEntries(keys.map(k => [k, fields[k] || ''])), version: info.version }));
          (event.target as HTMLFormElement).closest('dialog')!.close();
        } catch (error: any) { toast(error.message || '이체 정보를 저장하지 못했습니다.'); setBusy(false); }
        finally { store.pending--; notify(); }
      }}>
        <h3>이체 수단</h3>
        <label>수단 <select name="method" value={method} onChange={e => setMethod(e.target.value)}><option value="">미지정</option>{options(['계좌이체', '카드'])}</select></label>
        {method === '계좌이체' && <div>{field('bank', '은행')}{field('account', '계좌번호', 'numeric')}{field('holder', '예금주')}</div>}
        {method === '카드' && <div>{field('number', '카드번호', 'numeric')}{field('expiry', '유효기간', 'numeric')}{field('holderName', '이름')}</div>}
        <div className="toolbar">
          <button type="button" className="btn" onClick={e => e.currentTarget.closest('dialog')!.close()}>취소</button>
          <button type="submit" className="btn primary" disabled={busy}>저장</button>
        </div>
      </form>
    </ModalDialog>
  );
}

export async function openTrackerWorkplace(id: string) {
  if (ui.page !== 'work' || !store.state!.works.some(w => w.companyId === id)) return;
  const request = ++ui.trackerWorkplaceRequest;
  const owner = ui.trackerOwner;
  const scroll = { x: window.scrollX, y: window.scrollY };
  const local = canOpenPage('company') && store.state!.companies.find(c => c.id === id);
  try {
    const result = local ? null : await api('tracker-workplace', { id });
    if (ui.page !== 'work' || ui.trackerOwner !== owner || request !== ui.trackerWorkplaceRequest) return;
    setUi({ scrollRestore: scroll, trackerWorkplace: result, companyDetailId: id, detailsExpanded: true });
    window.scrollTo(0, 0);
  } catch (error: any) { if (request === ui.trackerWorkplaceRequest) toast(error.message); }
}

export function openTrackerAppearance() {
  const current = store.current;
  if (ui.page !== 'work' || !current || ui.trackerOwner !== current.id) return;
  showOverlay(close => <TrackerAppearance onClose={close} />);
}
function TrackerAppearance({ onClose }: { onClose: () => void }) {
  const current = store.current!;
  const original = current.trackerIcon || { kind: 'emoji', value: '' };
  const [title, setTitle] = useState(current.trackerTitle || '');
  const [icon, setIcon] = useState<{ kind: string; value: string }>(original);
  const [busy, setBusy] = useState(false);
  const setEmoji = (value: string) => setIcon({ kind: 'emoji', value });
  return (
    <ModalDialog onClose={onClose}>
      <form onSubmit={async event => {
        event.preventDefault();
        setBusy(true);
        await queued;
        if (!store.current || ui.trackerOwner !== store.current.id) return;
        store.pending++;
        try {
          adopt(await api('tracker-profile', { revision: store.revision, title: title.trim(), icon }));
          (event.target as HTMLFormElement).closest('dialog')!.close();
        } catch (error: any) { toast(error.message || '설정을 저장하지 못했습니다.'); setBusy(false); }
        finally { store.pending--; notify(); }
      }}>
        <h3>내 트래커 꾸미기</h3>
        <label>페이지 이름 <input name="title" maxLength={60} value={title} onChange={e => setTitle(e.target.value)}
          placeholder={(current.name || userLabel(current)) + ' 업무 트래커'} /></label>
        <label>이모지 <input name="emoji" maxLength={24} value={icon.kind === 'emoji' ? icon.value : ''} onChange={e => setEmoji(e.target.value)} placeholder="예: 📋" /></label>
        <div className="tracker-emoji-options">{['✅', '📋', '🗂️', '📅', '💼', '🌱'].map(emoji =>
          <button key={emoji} type="button" className="btn sm" aria-label={`${emoji} 선택`} onClick={() => setEmoji(emoji)}>{emoji}</button>)}</div>
        <label>이미지 업로드 <input name="file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={e => {
          const input = e.currentTarget;
          const file = input.files?.[0];
          if (!file) return;
          if (file.size > 256_000 || !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) {
            toast('PNG, JPEG, WebP, GIF 이미지 256KB까지 사용할 수 있습니다.');
            input.value = '';
            return;
          }
          const reader = new FileReader();
          reader.onload = () => setIcon({ kind: 'image', value: reader.result as string });
          reader.onerror = () => toast('이미지를 읽지 못했습니다.');
          reader.readAsDataURL(file);
        }} /></label>
        <p className="sub tracker-icon-preview">{icon.kind === 'image' ? <>현재 아이콘: <TrackerIcon member={{ trackerIcon: icon }} /></> : icon.value}</p>
        <div className="toolbar">
          <button type="button" className="btn sm" onClick={() => { setTitle(''); setEmoji(''); }}>기본값</button>
          <button type="button" className="btn sm" onClick={e => e.currentTarget.closest('dialog')!.close()}>취소</button>
          <button type="submit" className="btn primary sm" disabled={busy}>저장</button>
        </div>
      </form>
    </ModalDialog>
  );
}

// 페이지별 접근 권한 (관리자)
export function openPagePermission(pageId: string) {
  if (!canManageUsers() || !MENU.some(m => m.id === pageId)) return;
  showOverlay(close => <PagePermission pageId={pageId} onClose={close} />);
}
function PagePermission({ pageId, onClose }: { pageId: string; onClose: () => void }) {
  const [, setTick] = useState(0);
  const m = MENU.find(x => x.id === pageId)!;
  const users = store.state!.users.filter(u => !u.admin);
  const selected = users.filter(u => (u.permissions || []).includes(pageId)).length;
  const set = (list: Row[], on: boolean) => {
    for (const u of list) {
      u.permissions = u.permissions || [];
      u.permissions = on ? [...new Set([...u.permissions, pageId])] : u.permissions.filter((x: string) => x !== pageId);
    }
    save();
    setTick(t => t + 1);
  };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-head"><div><div className="modal-title">{m.icon} {m.name} 접속 권한</div><div className="sub">이 페이지를 사용할 직원을 선택하세요.</div></div>
          <button className="btn sm" onClick={onClose}>닫기</button></div>
        <label className="select-all-row"><input type="checkbox" checked={users.length > 0 && selected === users.length} onChange={e => set(users, e.target.checked)} /> 전체 선택</label>
        <div className="member-list">{users.map(u => (
          <label key={u.id} className="member-option"><input type="checkbox" checked={(u.permissions || []).includes(pageId)} onChange={e => set([u], e.target.checked)} />
            <b>{userLabel(u)}</b><span className="member-meta">{u.name || ''} · {u.dept || ''} {u.position || ''} · {u.approved ? '승인완료' : '승인대기'}</span></label>
        ))}{!users.length && <div className="empty">가입한 직원이 없습니다.</div>}</div>
      </div>
    </div>
  );
}

export function openUserPermission(id: string) {
  if (!canManageUsers() || !store.state!.users.some(u => u.id === id)) return;
  showOverlay(close => <UserPermission id={id} onClose={close} />);
}
function UserPermission({ id, onClose }: { id: string; onClose: () => void }) {
  const [, setTick] = useState(0);
  const u = store.state!.users.find(x => x.id === id);
  if (!u) return null;
  const togglePerm = (p: string, v: boolean) => {
    if (u.admin) return;
    u.permissions = v ? [...new Set([...(u.permissions || []), p])] : (u.permissions || []).filter((x: string) => x !== p);
    save(); setTick(t => t + 1);
  };
  const toggleTracker = (trackerId: string, on: boolean) => {
    if (u.admin) return;
    const grants = new Set<string>(u.trackerAccess || []);
    if (on) grants.add(trackerId); else grants.delete(trackerId);
    u.trackerAccess = [...grants];
    if (on && !(u.permissions || []).includes('work')) u.permissions = [...(u.permissions || []), 'work'];
    save(); setTick(t => t + 1);
  };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-head"><div><div className="modal-title">{userLabel(u)} 권한 설정</div><div className="sub">사용 가능한 메뉴를 선택하세요.</div></div>
          <button className="btn sm" onClick={onClose}>닫기</button></div>
        <div className="perm-grid">{MENU.map(m => (
          <label key={m.id} className="perm-item"><input type="checkbox" checked={(u.permissions || []).includes(m.id)} disabled={u.admin}
            onChange={e => togglePerm(m.id, e.target.checked)} /> {m.icon} {m.id === 'teamFees' ? '다른 담당자 수수료 조회' : m.name}</label>
        ))}</div>
        <h4>팀원별 업무 트래커 접근</h4>
        <div className="perm-grid">{assignmentTeam().filter(member => member.id !== u.id).map(member => (
          <label key={member.id} className="perm-item"><input type="checkbox" checked={Boolean(u.admin || (u.trackerAccess || []).includes(member.id))}
            disabled={u.admin} onChange={e => toggleTracker(member.id, e.target.checked)} /> {trackerLabel(member)}</label>
        ))}</div>
      </div>
    </div>
  );
}

const COLORS = ['#ef4444', '#f97316', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#64748b'];
export function openUserColorPicker(anchor: HTMLElement, id: string) {
  const u = store.state!.users.find(x => x.id === id);
  if (!u) return;
  const rect = anchor.getBoundingClientRect();
  const setColor = (color: string, close: () => void) => { u.color = color; save(); close(); };
  showOverlay(close => (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onPointerDown={close} />
      <div id="userColorPicker" className="user-color-picker" style={{ left: Math.min(window.innerWidth - 265, Math.max(12, rect.left)), top: Math.min(window.innerHeight - 120, rect.bottom + 7), zIndex: 9999 }}>
        <div className="picker-title">{userLabel(u)} 색상</div>
        <div className="color-palette">
          {COLORS.map(c => <button key={c} type="button" className={`color-dot ${String(u.color).toLowerCase() === c ? 'selected' : ''}`}
            style={{ '--c': c } as React.CSSProperties} title={c} onClick={() => setColor(c, close)} />)}
          <input type="color" defaultValue={u.color || '#3b82f6'} onChange={e => setColor(e.target.value, close)} title="직접 색상 선택" />
        </div>
      </div>
    </>
  ));
}
