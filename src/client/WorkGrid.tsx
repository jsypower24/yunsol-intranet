'use client';
// 사업장·업무 표 공통 (기존 grid()/cell())
import { ReactNode } from 'react';
import { ChangeInput, changeGridValue, formatBiznoInput, MonthButton, options, Select, TagButton, tagsText, WorkToggle } from './cells';
import { categories, ColDef, gridWidthDefaults, laborChecks, otherChecks } from './columns';
import { digits, formattedBizno, ui, setUi } from './lib';
import { Column, Grid } from './Grid';
import { notify, Row, save, saveColumnOrder, store, toast } from './store';
import { openClosureForm, openCompanyPayment, openTrackerWorkplace } from './dialogs';
import { askRemoval } from './overlay';

type Pair = [Row, Row | null];

export function gridChange(collection: string, id: string, key: string, field: HTMLInputElement | HTMLSelectElement) {
  let value: string | boolean = field instanceof HTMLInputElement && field.type === 'checkbox' ? field.checked : field.value;
  if (collection === 'companies' && key === 'category') {
    const company = store.state!.companies.find(c => c.id === id);
    if (company && value === '종료' && company.category !== '종료') { openClosureForm(company, field as HTMLSelectElement); return; }
  }
  if (collection === 'companies' && key === 'bizno' && value !== '') {
    if (![10, 11].includes(digits(value).length)) {
      const previous = store.state!.companies.find(r => r.id === id)?.bizno || '';
      field.value = formattedBizno(previous);
      toast('사업자등록번호는 숫자 10자리 또는 11자리로 입력해주세요.');
      return;
    }
    value = field.value = formattedBizno(value as string);
  }
  changeGridValue(collection, id, key, value);
}

export async function resetWork(id: string, kind: string) {
  const row = store.state!.works.find(w => w.id === id);
  if (!row) return;
  for (const [key] of kind === 'labor' ? laborChecks : otherChecks) row[key] = false;
  if (kind === 'labor') Object.assign(row, { month: '', roster: '', note: '' });
  await save();
}

function editPrivateTrackerValue(workId: string, field: string, value: string) {
  const state = store.state!;
  if (ui.page !== 'work' || ui.trackerOwner !== store.current?.id) return;
  const previous = state.privateTrackerValues[workId] || {};
  if ((previous[field] || '') === value) return;
  state.privateTrackerValues[workId] = { ...previous, [field]: value };
  save();
}

export function cell(row: Row, [key, label, type]: ColDef, collection: string, company: Row | null, kind: string | null): ReactNode {
  const raw = row[key] ?? (key === 'closed' ? '진행' : '');
  const value = key === 'bizno' ? formattedBizno(raw) : raw;
  const commit = (field: HTMLInputElement | HTMLSelectElement) => gridChange(collection, row.id, key, field);
  if (collection === 'companies' && key === 'name' && kind !== 'detail') {
    return <button type="button" className="fee-detail-link" onClick={() => setUi({ companyDetailId: row.id, detailsExpanded: true })}>{value || '업체명 입력'}</button>;
  }
  if (type === 'date') return <ChangeInput type="date" aria-label={label} value={value} onCommit={commit} />;
  if (type === 'link' && key === 'name' && collection === 'works') {
    return <button type="button" className="fee-detail-link" onClick={() => openTrackerWorkplace(company!.id)}>{company!.name || '업체명 미입력'}</button>;
  }
  if (type === 'private-tracker') {
    return <ChangeInput type="text" aria-label={label} maxLength={50000} value={store.state!.privateTrackerValues?.[row.id]?.[key] ?? ''}
      onCommit={input => editPrivateTrackerValue(row.id, key, input.value)} />;
  }
  if (type === 'link') return <span tabIndex={-1} className="grid-read">{key === 'bizno' ? formattedBizno(company![key] || '') : company![key]}</span>;
  if (type === 'edited') return <span tabIndex={-1} className="grid-read">{value}</span>;
  if (type === 'reset') return <button className="btn sm" onClick={() => resetWork(row.id, kind!)}>리셋</button>;
  if (type === 'transfer') return <button type="button" className="fee-detail-link" aria-label="이체 수단" onClick={() => openCompanyPayment(row.id)}>{value || '입력'}</button>;
  if (type === 'payment') {
    return <Select aria-label={label} value={value} onPick={commit}><option value="">미지정</option>{options(['CMS', '계좌이체'])}</Select>;
  }
  if (type === 'category' || type === 'status') {
    const list = type === 'category' ? categories : ['진행', '종료'];
    return (
      <Select className="ys-tag-select" aria-label={label} value={value} data-status={value} onPick={commit}>
        {type === 'category' && !categories.includes(value) && <option value={value} disabled hidden>{value === '기타' ? '기타 (기존)' : '분류 선택'}</option>}
        {options(list)}
      </Select>
    );
  }
  if (type === 'people' || type === 'tags') {
    return <TagButton collection={collection} id={row.id} field={key} label={label} type={type} values={value || []} />;
  }
  if (key === 'setup') {
    return <input type="checkbox" aria-label={label} checked={Boolean(value)} onChange={e => commit(e.currentTarget)} />;
  }
  if (type === 'check') return <WorkToggle collection={collection} id={row.id} field={key} label={label} value={Boolean(value)} />;
  if (type === 'month') return <MonthButton collection={collection} id={row.id} field={key} label={label} value={value} />;
  return <ChangeInput type="text" aria-label={label} value={String(value)} onCommit={commit}
    {...(key === 'bizno' ? { inputMode: 'numeric' as const, onInput: formatBiznoInput } : {})} />;
}

// 필터·정렬에 쓰는 칸의 표시값 (기존 genericCellValue와 같은 값)
export function cellText(row: Row, [key, , type]: ColDef, collection: string, company: Row | null, kind: string | null): string {
  const raw = row[key] ?? (key === 'closed' ? '진행' : '');
  if (collection === 'companies' && key === 'name' && kind !== 'detail') return String(raw || '업체명 입력');
  if (type === 'link' && key === 'name' && collection === 'works') return company!.name || '업체명 미입력';
  if (type === 'private-tracker') return String(store.state!.privateTrackerValues?.[row.id]?.[key] ?? '').trim();
  if (type === 'link') return String(key === 'bizno' ? formattedBizno(company![key] || '') : company![key] ?? '').trim();
  if (type === 'reset') return '리셋';
  if (type === 'transfer') return raw || '입력';
  if (type === 'payment') return raw || '미지정';
  if (type === 'category' && !categories.includes(raw)) return raw === '기타' ? '기타 (기존)' : '분류 선택';
  if (type === 'people' || type === 'tags') return tagsText(raw || [], type);
  if (key === 'setup') return raw ? '체크' : '미체크';
  if (type === 'check') return raw ? '완료' : '—';
  if (type === 'month') {
    const [y, m] = String(raw).split('-');
    return y && m ? `${y}년 ${Number(m)}월` : '연·월 선택';
  }
  return String(key === 'bizno' ? formattedBizno(raw) : raw).trim();
}

export async function removeCompany(id: string) {
  if (!await askRemoval('사업장 삭제', '이 업체와 연결된 업무를 삭제할까요?')) return;
  store.state!.companies = store.state!.companies.filter(c => c.id !== id);
  await save();
}

export function WorkGrid({ columns, rows, collection, kind = null, allColumns }: {
  columns: ColDef[]; rows: Pair[]; collection: string; kind?: string | null; allColumns?: ColDef[];
}) {
  const companyGrid = collection === 'companies';
  const group = companyGrid ? 'company' : kind!;
  let visible = columns;
  if (companyGrid || kind === 'labor' || kind === 'other') {
    const hidden = store.personalOrders[group + '-hidden'] || [];
    const filtered = columns.filter(([key]) => !hidden.includes(key));
    if (filtered.length) visible = filtered;
  }
  const defs = new Map(visible.map(c => [c[0], c]));
  const gridColumns: Column[] = visible.map(([key, label, type]) => ({
    key, label, width: group === 'labor' && ['name', 'bizno'].includes(key) ? 145 : gridWidthDefaults[key] || 97,
    tdClass: type === 'check' && key !== 'setup' ? 'work-toggle-cell' : undefined,
  }));
  if (companyGrid) gridColumns.push({ key: 'manage', label: '관리', width: gridWidthDefaults.manage });
  const all = allColumns ? [...allColumns.map(([k]) => k), ...(companyGrid ? ['manage'] : [])] : undefined;
  return (
    <Grid<Pair>
      group={group}
      columns={gridColumns}
      rows={rows}
      allKeys={all}
      rowKey={([row]) => row.id}
      pinned={kind === 'labor' ? ['name', 'bizno'] : []}
      wrapClass={`grid-wrap ys-grid ${companyGrid ? 'ys-company-grid' : ''}`}
      renderCell={([row, company], column) => column.key === 'manage'
        ? <button className="btn danger sm" onClick={() => removeCompany(row.id)}>삭제</button>
        : cell(row, defs.get(column.key)!, collection, company, kind)}
      cellText={([row, company], column) => column.key === 'manage' ? '삭제' : cellText(row, defs.get(column.key)!, collection, company, kind)}
    />
  );
}

export function ColumnPicker({ group, columns }: { group: string; columns: ColDef[] }) {
  const hidden = store.personalOrders[group + '-hidden'] || [];
  return (
    <details className="column-visibility" open={ui.columnPickerOpen === group}
      onToggle={e => { const open = e.currentTarget.open; ui.columnPickerOpen = open ? group : ui.columnPickerOpen === group ? '' : ui.columnPickerOpen; }}>
      <summary className="btn sm">표시할 열</summary>
      <div className="column-visibility-panel">
        {columns.map(([key, label]) => (
          <label key={key}><input type="checkbox" checked={!hidden.includes(key)} onChange={e => setColumnVisibility(group, key, columns, e.target.checked)} /> {label}</label>
        ))}
      </div>
    </details>
  );
}
async function setColumnVisibility(group: string, key: string, columns: ColDef[], show: boolean) {
  const hidden = new Set(store.personalOrders[group + '-hidden'] || []);
  if (show) hidden.delete(key); else hidden.add(key);
  if (columns.every(([column]) => hidden.has(column))) { toast('표시할 열을 한 개 이상 선택해주세요.'); notify(); return; }
  ui.columnPickerOpen = group;
  saveColumnOrder(group + '-hidden', [...hidden]);
}
