'use client';
// 팀: 영업자, 팀원 관리, 연장근무 관리 / 기타: 정리메모, 설정
import { useState } from 'react';
import { ChangeInput, ChangeTextarea, options } from '../cells';
import { openUserColorPicker, openUserPermission } from '../dialogs';
import { Grid } from '../Grid';
import { assignmentTeam, canManageUsers, givenName, overtimeHours, seoulDate, setUi, ui, userColor, userLabel, uuid } from '../lib';
import { askEntry, askRemoval } from '../overlay';
import { history, historyCheckpoint, redoApp, Row, save, store, toast, undoApp, useStore } from '../store';

function HistoryButtons({ page }: { page: string }) {
  useStore();
  return (
    <>
      <button className="btn" data-history="undo" onClick={() => undoApp(page)} disabled={!history.undo.length} title="방금 작업 되돌리기">↶ 실행 취소</button>
      <button className="btn" data-history="redo" onClick={() => redoApp(page)} disabled={!history.redo.length} title="되돌린 작업 다시 실행">↷ 다시 실행</button>
    </>
  );
}

function setField(list: Row[], id: string, key: string, value: unknown) {
  const row = list.find(x => x.id === id);
  if (row && row[key] !== value) { historyCheckpoint(); row[key] = value; save(); }
}

export function SalesPage() {
  const state = store.state!;
  return (
    <div className="card">
      <div className="toolbar">
        <button className="btn primary" onClick={() => { historyCheckpoint(); state.sales.unshift({ id: 's' + Date.now(), name: '', phone: '', org: '', rate: '', note: '' }); save(); }}>+ 영업자 추가</button>
        <HistoryButtons page="sales" />
      </div>
      <Grid<Row> group="sales" rows={state.sales} rowKey={r => r.id} emptyText="등록된 영업자가 없습니다."
        columns={[['name', '이름'], ['phone', '연락처'], ['org', '소속'], ['rate', '수수료율'], ['note', '비고'], ['manage', '관리']].map(([key, label]) => ({ key, label, width: 140 }))}
        cellText={(r, c) => (c.key === 'manage' ? '삭제' : String(r[c.key] ?? ''))}
        renderCell={(r, c) => c.key === 'manage'
          ? <button className="btn danger sm" onClick={() => { historyCheckpoint(); state.sales = state.sales.filter(x => x.id !== r.id); save(); }}>삭제</button>
          : <ChangeInput value={r[c.key] ?? ''} onCommit={input => setField(state.sales, r.id, c.key, input.value)} />} />
    </div>
  );
}

function userField(id: string, key: string, value: unknown) {
  const u = store.state!.users.find(x => x.id === id);
  if (!u) return;
  historyCheckpoint();
  u[key] = value;
  if (key === 'name') u.givenName = givenName(value as string);
  save();
}

export function AdminPage() {
  const state = store.state!;
  if (!canManageUsers()) return <div className="card">접근 권한이 없습니다.</div>;
  const cols: [string, string][] = [['name', '이름'], ['username', '아이디'], ['birthDate', '생년월일'], ['workPhone', '업무폰번호'], ['extension', '내선번호'],
    ['dept', '부서'], ['position', '직급'], ['performanceBase', '실적 기준금액']];
  const addUser = async () => {
    const name = await askEntry('팀원 추가', '팀원 이름');
    if (!name?.trim()) return;
    historyCheckpoint();
    state.users.unshift({ id: uuid().replace(/-/g, ''), name, givenName: givenName(name), username: '', approved: false, active: true, permissions: [], color: '#3b82f6' });
    save();
  };
  const toggleApprove = (u: Row) => {
    historyCheckpoint();
    u.approved = !u.approved;
    if (u.approved && !(u.permissions || []).length) u.permissions = ['company', 'work'];
    save();
  };
  const deleteUser = async (u: Row) => {
    if (u.admin) { toast('마스터 관리자는 삭제할 수 없습니다.'); return; }
    if (!await askRemoval('팀원 삭제', `${userLabel(u)} 팀원을 삭제하면 페이지 권한도 함께 삭제됩니다.`)) return;
    historyCheckpoint();
    state.users = state.users.filter(x => x.id !== u.id);
    if (await save()) toast('팀원을 삭제했습니다.');
  };
  const status = (u: Row) => (u.approved ? '승인완료' : u.teamAdded ? '팀원 등록' : '승인대기');
  return (
    <>
      <div className="card">
        <div className="toolbar"><button className="btn primary" onClick={addUser}>+ 팀원 추가</button><HistoryButtons page="admin" /></div>
        <div className="kpis">
          <div className="kpi">전체 사용자<div className="v">{state.users.length}</div></div>
          <div className="kpi">승인 대기<div className="v">{state.users.filter(u => !u.approved && !u.teamAdded).length}</div></div>
          <div className="kpi">승인 완료<div className="v">{state.users.filter(u => u.approved).length}</div></div>
        </div>
      </div>
      <div className="card"><h3 style={{ marginTop: 0 }}>팀원 목록</h3>
        <div className="sub">열 제목을 드래그해 순서를 바꾸고, 열 경계선을 드래그해 너비를 조절할 수 있습니다. 이름을 누르면 색상을 바꿉니다.</div>
        <Grid<Row> group="admin" tableClass="user-table" rows={state.users} rowKey={u => u.id}
          columns={[...cols, ['status', '가입 상태'], ['employment', '재직 상태'], ['perm', '권한'], ['manage', '관리']].map(([key, label]) => ({ key, label, width: key === 'name' ? 200 : 120 }))}
          cellText={(u, c) => {
            if (c.key === 'name') return userLabel(u);
            if (c.key === 'status') return status(u);
            if (c.key === 'employment') return u.active === false ? '퇴사자' : '재직';
            if (c.key === 'perm') return '권한 설정';
            if (c.key === 'manage') return u.id === 'u0' ? '마스터' : (u.approved ? '승인취소' : '가입승인') + '삭제';
            return String(u[c.key] || '');
          }}
          renderCell={(u, c) => {
            if (c.key === 'name') return <>
              <button className="user-name-button" style={{ '--person': userColor(u) } as React.CSSProperties} onClick={e => openUserColorPicker(e.currentTarget, u.id)}>{userLabel(u)}</button>
              <ChangeInput value={u.name || ''} onCommit={input => userField(u.id, 'name', input.value)} />
            </>;
            if (c.key === 'performanceBase') return <ChangeInput type="number" aria-label="실적 기준금액" min={0} max={9999999999} step={1}
              value={u.performanceBase || ''} onCommit={input => { if (input.reportValidity()) userField(u.id, 'performanceBase', Number(input.value)); }} />;
            if (c.key === 'status') return <span className={`status ${u.approved ? 'ok' : 'wait'}`}>{status(u)}</span>;
            if (c.key === 'employment') return <select aria-label="재직 상태" disabled={u.admin} value={u.active === false ? '퇴사자' : '재직'}
              onChange={e => { const active = e.target.value === '재직'; if (!u.admin && u.active !== active) { historyCheckpoint(); u.active = active; save(); } }}>{options(['재직', '퇴사자'])}</select>;
            if (c.key === 'perm') return <button className="btn sm" onClick={() => openUserPermission(u.id)}>권한 설정</button>;
            if (c.key === 'manage') return u.id !== 'u0' && !u.admin ? <>
              <button className="btn sm" onClick={() => toggleApprove(u)}>{u.approved ? '승인취소' : '가입승인'}</button>
              <button className="btn danger sm" onClick={() => deleteUser(u)}>삭제</button>
            </> : '마스터';
            return <ChangeInput value={u[c.key] || ''} onCommit={input => userField(u.id, c.key, input.value)} />;
          }} />
      </div>
    </>
  );
}

// 연장근무 관리
const overtimeReasons = ['개인업무', '급여기간 중 연장', '앞선연장'];
const discoveryStatuses = ['예정', '지급완료', '반려', '미입금???'];
type OCol = [string, string, string | string[]];
const overtimeColumns: OCol[] = [
  ['date', '연장일자', 'date'], ['memberId', '사람', 'person'], ['start', '시작', 'time'], ['end', '퇴근', 'time'], ['breakHours', '연장휴게', 'number'],
  ['total', '연장H', 'calculated'], ['usedHours', '소진H', 'number'], ['reason', '사유', overtimeReasons], ['note', '비고', 'text'],
];
const discoveryColumns: OCol[] = [
  ['date', '언제', 'date'], ['memberIds', '사람', 'people'], ['companyIds', '사업장', 'workplaces'], ['type', '종류', 'text'],
  ['headcount', '해당인원', 'number'], ['status', '선택', discoveryStatuses], ['note', '메모', 'text'],
];
const overtimeWidths: Record<string, number> = { date: 143, memberId: 112, memberIds: 135, companyIds: 177, reason: 155, note: 180, start: 128, end: 128, manage: 72 };

function memberOptions(): [string, string][] { return assignmentTeam().map(u => [u.id, u.name || userLabel(u)]); }
function overtimeName(id: string) {
  const user = store.state!.users.find(m => m.id === id);
  return user ? (user.name || userLabel(user)) : '—';
}

function saveOvertimeField(collection: string, id: string, key: string, input: HTMLInputElement | HTMLSelectElement) {
  const row = store.state![collection].find((r: Row) => r.id === id);
  if (!row || !input.reportValidity()) return;
  let value: unknown = input.value;
  if (input instanceof HTMLSelectElement && input.multiple) value = [...input.selectedOptions].map(o => o.value);
  if (input instanceof HTMLInputElement && input.type === 'number' && value !== '') value = input.valueAsNumber;
  if (['date', 'memberId', 'memberIds'].includes(key) && !(value as string | string[]).length) {
    toast('날짜와 담당자를 지정해주세요.');
    if (!(input instanceof HTMLSelectElement && input.multiple)) input.value = row[key];
    store.version++; setUi({});
    return;
  }
  if (JSON.stringify(row[key]) === JSON.stringify(value)) return;
  historyCheckpoint();
  row[key] = value;
  save();
}

function OvertimeCell({ collection, row, col: [key, label, type] }: { collection: string; row: Row; col: OCol }) {
  const value = row[key] ?? '';
  const commit = (input: HTMLInputElement | HTMLSelectElement) => saveOvertimeField(collection, row.id, key, input);
  if (type === 'calculated') return <output>{overtimeHours(row) ?? '—'}</output>;
  if ((type === 'person' || type === 'people') && !canManageUsers()) return <>{store.current!.name || userLabel(store.current)}</>;
  if (type === 'people' || type === 'workplaces') {
    const entries = type === 'people' ? memberOptions() : (store.state!.overtimeWorkplaces || []).map((c: Row) => [c.id, c.name]);
    return <select multiple aria-label={label} value={Array.isArray(value) ? value : []} onChange={e => commit(e.currentTarget)}>
      {entries.map(([v, l]: [string, string]) => <option key={v} value={v}>{l}</option>)}</select>;
  }
  if (Array.isArray(type) || type === 'person') {
    const entries = type === 'person' ? memberOptions() : (type as string[]).map(o => [o, o]);
    return <select aria-label={label} value={value} onChange={e => commit(e.currentTarget)}>
      {[['', '—'], ...entries].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>;
  }
  const constraints = key === 'headcount' ? { min: 0, step: 1 } : key === 'breakHours' ? { min: 0, max: 24, step: 0.01 } : { step: 0.01 };
  return <ChangeInput type={type as string} aria-label={label} {...(type === 'number' ? constraints : {})} {...(type === 'text' ? { maxLength: 2000 } : {})}
    value={value} onCommit={commit} />;
}

function OvertimeTable({ collection, columns, rows }: { collection: string; columns: OCol[]; rows: Row[] }) {
  const defs = new Map(columns.map(c => [c[0], c]));
  const text = (row: Row, key: string) => {
    const col = defs.get(key);
    if (!col) return '삭제';
    const [, , type] = col;
    const value = row[key] ?? '';
    if (type === 'calculated') return String(overtimeHours(row) ?? '—');
    if (type === 'person') return value ? overtimeName(value) : '—';
    if (type === 'people') return (value || []).map(overtimeName).join(', ');
    if (type === 'workplaces') return (value || []).map((id: string) => store.state!.overtimeWorkplaces?.find((c: Row) => c.id === id)?.name || '').join(', ');
    return String(value || (Array.isArray(type) ? '—' : ''));
  };
  return (
    <Grid<Row> group={collection} rows={rows} rowKey={r => r.id}
      columns={[...columns, ['manage', '관리', '']].map(([key, label]) => ({ key, label, width: overtimeWidths[key] || 104 }))}
      cellText={(r, c) => text(r, c.key)}
      renderCell={(r, c) => c.key === 'manage'
        ? <button className="btn danger sm" onClick={async () => {
          if (!await askRemoval('기록 삭제', '선택한 기록을 삭제할까요?')) return;
          historyCheckpoint();
          store.state![collection] = store.state![collection].filter((x: Row) => x.id !== r.id);
          save();
        }}>삭제</button>
        : <OvertimeCell collection={collection} row={r} col={defs.get(c.key)!} />} />
  );
}

function filtered(collection: string) {
  return (store.state![collection] || []).filter((r: Row) => r.date >= ui.overtimeStart && r.date <= ui.overtimeEnd
    && (!ui.overtimePerson || (r.memberIds || [r.memberId]).includes(ui.overtimePerson)))
    .sort((a: Row, b: Row) => b.date.localeCompare(a.date));
}

function OvertimeCalendar({ rows }: { rows: Row[] }) {
  const [year, month] = ui.overtimeMonth.split('-').map(Number);
  const blanks = new Date(year, month - 1, 1).getDay();
  const days = new Date(year, month, 0).getDate();
  return (
    <>
      <label className="overtime-calendar-month">달력 월 <input type="month" value={ui.overtimeMonth} min={ui.overtimeStart.slice(0, 7)} max={ui.overtimeEnd.slice(0, 7)}
        onChange={e => { if (e.target.value && e.target.reportValidity()) setUi({ overtimeMonth: e.target.value }); }} /></label>
      <div className="grid-wrap"><div className="overtime-calendar" aria-label="연장근무 달력">
        {['일', '월', '화', '수', '목', '금', '토'].map(d => <strong key={d}>{d}</strong>)}
        {Array.from({ length: blanks }, (_, i) => <div key={'b' + i} aria-hidden="true" />)}
        {Array.from({ length: days }, (_, i) => {
          const date = ui.overtimeMonth + '-' + String(i + 1).padStart(2, '0');
          return <div key={date} className="overtime-day"><b>{i + 1}</b><ul>
            {rows.filter(r => r.date === date).map(r => <li key={r.id}>{overtimeName(r.memberId)} · {overtimeHours(r) ?? '—'}시간</li>)}
          </ul></div>;
        })}
      </div></div>
    </>
  );
}

function OvertimeSummary({ rows }: { rows: Row[] }) {
  const totals = new Map<string, { hours: number; used: number; count: number }>();
  for (const row of rows) {
    const t = totals.get(row.memberId) || { hours: 0, used: 0, count: 0 };
    t.hours += overtimeHours(row) || 0;
    t.used += Number(row.usedHours || 0);
    t.count++;
    totals.set(row.memberId, t);
  }
  const format = (n: number) => n.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
  return (
    <div className="grid-wrap"><table><thead><tr><th>사람</th><th>기재 건수</th><th>연장H</th><th>소진H</th><th>잔여H</th></tr></thead>
      <tbody>{[...totals].map(([id, t]) => <tr key={id}><td>{overtimeName(id)}</td><td>{t.count}</td><td>{format(t.hours)}</td><td>{format(t.used)}</td><td>{format(t.hours + t.used)}</td></tr>)}
        {!totals.size && <tr><td colSpan={5} className="empty">등록된 항목이 없습니다.</td></tr>}</tbody></table></div>
  );
}

function addOvertimeRow(collection: string) {
  const date = seoulDate();
  const memberId = canManageUsers() && ui.overtimePerson ? ui.overtimePerson : store.current!.id;
  const row: Row = { id: uuid(), date: date >= ui.overtimeStart && date <= ui.overtimeEnd ? date : ui.overtimeStart };
  if (collection === 'overtimeRows') row.memberId = memberId;
  else Object.assign(row, { memberIds: [memberId], companyIds: [] });
  historyCheckpoint();
  store.state![collection].unshift(row);
  if (collection === 'overtimeRows') ui.overtimeView = '연장기재';
  save();
}

export function OvertimePage() {
  if (!ui.overtimeStart) {
    ui.overtimeMonth = seoulDate().slice(0, 7);
    const [y, m] = ui.overtimeMonth.split('-').map(Number);
    ui.overtimeStart = ui.overtimeMonth + '-01';
    ui.overtimeEnd = ui.overtimeMonth + '-' + new Date(y, m, 0).getDate();
  }
  if (!canManageUsers() || !memberOptions().some(([id]) => id === ui.overtimePerson)) ui.overtimePerson = '';
  const rows = filtered('overtimeRows');
  const [start, setStart] = useState(ui.overtimeStart);
  const [end, setEnd] = useState(ui.overtimeEnd);
  const [rangeError, setRangeError] = useState('');
  return (
    <>
      <section className="card overtime-section">
        <h2>연장근무 기재</h2>
        <div className="toolbar overtime-toolbar">
          <form className="overtime-range" onSubmit={e => {
            e.preventDefault();
            if (start > end) { setRangeError('종료일은 시작일과 같거나 이후여야 합니다.'); return; }
            setRangeError('');
            setUi({ overtimeStart: start, overtimeEnd: end, overtimeMonth: start.slice(0, 7) });
          }}>
            <span>조회 기간</span><input type="date" name="start" aria-label="시작일" value={start} required onChange={e => setStart(e.target.value)} />
            <span aria-hidden="true">~</span><input type="date" name="end" aria-label="종료일" value={end} required onChange={e => { setEnd(e.target.value); setRangeError(''); }}
              aria-invalid={Boolean(rangeError)} title={rangeError || undefined} />
            <button type="submit" className="btn sm">조회</button>
            {rangeError && <span role="alert" className="sub">{rangeError}</span>}
          </form>
          {canManageUsers() && <select aria-label="담당자" value={ui.overtimePerson} onChange={e => setUi({ overtimePerson: e.target.value })}>
            {[['', '전체 팀원'], ...memberOptions()].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>}
          <div className="overtime-views" role="group" aria-label="연장근무 보기">
            {['연장기재', '캘린더형', '요약'].map(view => (
              <button key={view} type="button" className={`btn sm ${view === ui.overtimeView ? 'primary' : ''}`} data-overtime-view aria-pressed={view === ui.overtimeView}
                onClick={() => setUi({ overtimeView: view })}>{view}</button>
            ))}
          </div>
          <button type="button" className="btn sm" onClick={() => addOvertimeRow('overtimeRows')}>+ 연장근무 추가</button>
        </div>
        {ui.overtimeView === '캘린더형' ? <OvertimeCalendar rows={rows} /> : ui.overtimeView === '요약' ? <OvertimeSummary rows={rows} />
          : <OvertimeTable collection="overtimeRows" columns={overtimeColumns} rows={rows} />}
      </section>
      <section className="card overtime-section"><h2>지원금 발굴</h2>
        <div className="toolbar"><button className="btn sm" onClick={() => addOvertimeRow('subsidyDiscovery')}>+ 지원금 발굴 추가</button></div>
        <OvertimeTable collection="subsidyDiscovery" columns={discoveryColumns} rows={filtered('subsidyDiscovery')} />
      </section>
    </>
  );
}

export function MemoPage() {
  const state = store.state!;
  return (
    <div className="card">
      <div className="toolbar"><HistoryButtons page="memo" /></div>
      <ChangeTextarea className="memo" placeholder="자유롭게 메모하세요." value={state.memo}
        onCommit={input => { if (input.value === state.memo) return; historyCheckpoint(); state.memo = input.value; save(); }} />
    </div>
  );
}

export function SettingsPage() {
  const state = store.state!;
  const [name, setName] = useState(state.settings.officeName);
  return (
    <div className="card"><h3>기본 설정</h3>
      <div className="field"><label htmlFor="officeName">인트라넷 이름</label><input id="officeName" value={name} onChange={e => setName(e.target.value)} /></div>
      <button className="btn primary" onClick={async () => {
        state.settings = { ...state.settings, officeName: name };
        if (await save()) toast('설정이 저장되었습니다.');
      }}>저장</button>
    </div>
  );
}
