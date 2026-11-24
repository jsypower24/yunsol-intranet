'use client';
// 엑셀형 표: 열 너비 조절, 열 순서 드래그(팀원별 저장), 열 고정, 정렬·필터(엑셀 필터와 같은 방식)
import { CSSProperties, ReactNode, useMemo, useRef, useState } from 'react';
import { gridCollator } from './lib';
import { showOverlay } from './overlay';
import { orderedKeys, saveColumnOrder, store, useStore } from './store';

export type Column = { key: string; label: string; width?: number; tdClass?: string };

type GridProps<T> = {
  group: string;
  columns: Column[];
  rows: T[];
  rowKey: (row: T) => string;
  renderCell: (row: T, column: Column) => ReactNode;
  cellText: (row: T, column: Column) => string;
  pinned?: string[];
  allKeys?: string[];
  wrapClass?: string;
  tableClass?: string;
  emptyText?: string;
  reorder?: boolean;
  filter?: boolean;
  resize?: boolean;
  onFilterChange?: (shown: number) => void;
  showCount?: (shown: number) => ReactNode;
};

function widthKey(group: string, key: string) {
  return 'ys-column-width:' + store.current?.id + ':' + group + ':' + key;
}
export function readGridWidth(group: string, key: string, fallback: number) {
  try {
    const width = Number(localStorage.getItem(widthKey(group, key)));
    return width >= 72 && width <= 1000 ? width : fallback;
  } catch { return fallback; }
}

type View = { filters: Record<string, string[]>; sort: null | { key: string; dir: 'asc' | 'desc' } };
function viewKey(group: string) { return 'ys_grid_view_' + store.current?.id + '_' + group; }
function readView(group: string): View {
  try {
    const v = JSON.parse(localStorage.getItem(viewKey(group)) || '{}');
    return { filters: v.filters || {}, sort: v.sort || null };
  } catch { return { filters: {}, sort: null }; }
}
function writeView(group: string, view: View) {
  try { localStorage.setItem(viewKey(group), JSON.stringify(view)); } catch { /* 저장 불가 시 무시 */ }
}

export function compareGridValues(a: string, b: string) {
  const amount = /^[+-]?[0-9][0-9,]*(?:\.[0-9]+)?원?$/;
  if (amount.test(a) && amount.test(b)) return Number(a.replace(/[,원]/g, '')) - Number(b.replace(/[,원]/g, ''));
  return gridCollator.compare(a, b);
}

export function Grid<T>(props: GridProps<T>) {
  useStore();
  const { group, columns, rows, rowKey, renderCell, cellText, pinned = [], reorder = true, filter = true, resize = true } = props;
  const [, setTick] = useState(0);
  const refresh = () => setTick(t => t + 1);
  const dragSource = useRef<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [widthOverrides, setWidthOverrides] = useState<Record<string, number>>({});

  const keys = columns.map(c => c.key);
  const isPinned = (key: string) => pinned.includes(key);
  const order = reorder ? orderedKeys(group, keys) : keys;
  const orderedColumns = [...order.filter(isPinned), ...order.filter(k => !isPinned(k))]
    .map(k => columns.find(c => c.key === k)!).filter(Boolean);
  const widths = orderedColumns.map(c => widthOverrides[c.key] ?? readGridWidth(group, c.key, c.width || 97));
  const tableWidth = widths.reduce((s, w) => s + w, 0);

  const view = readView(group);
  const sort = view.sort && keys.includes(view.sort.key) ? view.sort : null;
  const filters = Object.entries(view.filters).filter(([k, sel]) => keys.includes(k) && Array.isArray(sel));
  const columnByKey = useMemo(() => new Map(columns.map(c => [c.key, c])), [columns]);
  const shownRows = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => filters.every(([k, sel]) => sel.includes(cellText(row, columnByKey.get(k)!))))
    .sort((a, b) => {
      const o = sort ? (sort.dir === 'desc' ? -1 : 1) * compareGridValues(cellText(a.row, columnByKey.get(sort.key)!), cellText(b.row, columnByKey.get(sort.key)!)) : 0;
      return o || a.index - b.index;
    })
    .map(({ row }) => row);

  const style: Record<string, string> = { width: tableWidth + 'px', '--name-width': (widths[0] || 0) + 'px' };
  let left = 0;
  orderedColumns.forEach((c, i) => {
    if (isPinned(c.key)) { style['--pin-' + c.key] = left + 'px'; left += widths[i]; }
  });

  function drop(target: string) {
    const source = dragSource.current;
    dragSource.current = null;
    setDropTarget(null);
    if (!source || source === target || isPinned(source) !== isPinned(target)) return;
    const next = orderedColumns.map(c => c.key);
    const from = next.indexOf(source), to = next.indexOf(target);
    next.splice(to, 0, next.splice(from, 1)[0]);
    if (props.allKeys) {
      const remaining = [...next];
      const visible = new Set(next);
      saveColumnOrder(group, orderedKeys(group, props.allKeys).map(k => visible.has(k) ? remaining.shift()! : k));
    } else saveColumnOrder(group, next);
  }

  function startResize(key: string, initial: number, event: React.PointerEvent<HTMLSpanElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const apply = (value: number) => {
      const width = Math.max(72, Math.min(1000, Math.round(value)));
      setWidthOverrides(o => ({ ...o, [key]: width }));
      try { localStorage.setItem(widthKey(group, key), String(width)); } catch { /* 무시 */ }
    };
    handle.onpointermove = move => { if (move.pointerId === event.pointerId) apply(initial + move.clientX - startX); };
    handle.onlostpointercapture = () => { handle.onpointermove = null; };
  }
  function keyResize(key: string, initial: number, event: React.KeyboardEvent) {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const width = Math.max(72, Math.min(1000, initial + (event.key === 'ArrowLeft' ? -10 : 10)));
    setWidthOverrides(o => ({ ...o, [key]: width }));
    try { localStorage.setItem(widthKey(group, key), String(width)); } catch { /* 무시 */ }
  }

  function openFilter(event: React.MouseEvent<HTMLButtonElement>, column: Column) {
    event.stopPropagation();
    const trigger = event.currentTarget;
    const values = [...new Set(rows.map(r => cellText(r, column)))].sort(compareGridValues);
    showOverlay(close => <FilterMenu trigger={trigger} values={values} label={column.label} selected={view.filters[column.key]}
      onApply={(change) => {
        const next = readView(group);
        if (change.sort !== undefined) next.sort = change.sort === 'clear' ? null : { key: column.key, dir: change.sort };
        if (change.filter !== undefined) {
          if (change.filter === null || change.filter.length === values.length) delete next.filters[column.key];
          else next.filters[column.key] = change.filter;
        }
        writeView(group, next);
        close();
        refresh();
        props.onFilterChange?.(0);
        trigger.focus();
      }} onClose={() => { close(); trigger.focus(); }} />);
  }

  const pinClass = (key: string) => (isPinned(key) ? 'pin-' + key : undefined);
  return (
    <>
      {props.showCount?.(shownRows.length)}
      <div className={props.wrapClass ?? 'grid-wrap ys-grid'}>
        <table data-grid-group={group} className={props.tableClass} style={style as CSSProperties}>
          <colgroup>{orderedColumns.map((c, i) => <col key={c.key} data-key={c.key} style={{ width: widths[i] + 'px' }} />)}</colgroup>
          <thead><tr>
            {orderedColumns.map((c, i) => {
              const active = sort?.key === c.key || filters.some(([k]) => k === c.key);
              return (
                <th key={c.key} data-column={c.key} data-order-key={reorder ? c.key : undefined} className={[pinClass(c.key), dropTarget === c.key ? 'drop-target' : ''].filter(Boolean).join(' ') || undefined}
                  scope="col" aria-sort={sort?.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  draggable={reorder}
                  onDragStart={e => { dragSource.current = c.key; e.dataTransfer.setData('text/plain', c.key); e.dataTransfer.effectAllowed = 'move'; }}
                  onDragOver={e => {
                    const source = dragSource.current;
                    if (!source || source === c.key || isPinned(source) !== isPinned(c.key)) return;
                    e.preventDefault(); setDropTarget(c.key);
                  }}
                  onDragLeave={() => setDropTarget(t => (t === c.key ? null : t))}
                  onDragEnd={() => { dragSource.current = null; setDropTarget(null); }}
                  onDrop={e => { e.preventDefault(); drop(c.key); }}>
                  {reorder && <span className="column-grip" title="드래그하여 열 순서 변경" aria-hidden="true">⋮⋮</span>}
                  {c.label}
                  {filter && <button type="button" className={`generic-filter-btn ys-header-filter${active ? ' active' : ''}`}
                    aria-label={`${c.label} 정렬 및 필터`} onClick={e => openFilter(e, c)}>▼</button>}
                  {resize && <span className="ys-column-handle" tabIndex={0} role="separator" aria-orientation="vertical"
                    aria-label={`${c.label} 열 너비`} aria-valuemin={72} aria-valuemax={1000} aria-valuenow={widths[i]} title="드래그하여 열 너비 조절"
                    draggable={false} onDragStart={e => { e.preventDefault(); e.stopPropagation(); }}
                    onPointerDown={e => startResize(c.key, widths[i], e)} onKeyDown={e => keyResize(c.key, widths[i], e)} />}
                </th>
              );
            })}
          </tr></thead>
          <tbody>
            {shownRows.map(row => (
              <tr key={rowKey(row)}>
                {orderedColumns.map(c => (
                  <td key={c.key} data-column={c.key} className={[pinClass(c.key), c.tdClass].filter(Boolean).join(' ') || undefined}>
                    {renderCell(row, c)}
                  </td>
                ))}
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={orderedColumns.length} className="empty">{props.emptyText ?? '등록된 항목이 없습니다.'}</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

function FilterMenu({ trigger, values, label, selected, onApply, onClose }: {
  trigger: HTMLElement; values: string[]; label: string; selected?: string[];
  onApply: (change: { sort?: 'asc' | 'desc' | 'clear'; filter?: string[] | null }) => void; onClose: () => void;
}) {
  const [checked, setChecked] = useState(() => new Set(selected || values));
  const [query, setQuery] = useState('');
  const visible = values.filter(v => (v || '(빈 셀)').toLowerCase().includes(query.trim().toLowerCase()));
  const allChecked = visible.length > 0 && visible.every(v => checked.has(v));
  const someChecked = visible.some(v => checked.has(v));
  const rect = trigger.getBoundingClientRect();
  const ref = useRef<HTMLDivElement>(null);
  const apply = () => onApply({ filter: visible.filter(v => checked.has(v)) });
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onPointerDown={onClose} />
      <div ref={ref} id="genericGridFilter" className="generic-filter-menu" role="dialog" aria-label={`${label} 정렬 및 필터`}
        style={{ left: Math.max(8, Math.min(rect.left, window.innerWidth - 268)), top: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 420)), zIndex: 9999 }}
        onKeyDown={e => {
          if (e.key === 'Escape') onClose();
          if (e.key === 'Enter' && (e.target as HTMLElement).classList.contains('excel-filter-search')) { e.preventDefault(); apply(); }
        }}>
        <button className="excel-filter-action" onClick={() => onApply({ sort: 'asc' })}>▲ 오름차순 정렬</button>
        <button className="excel-filter-action" onClick={() => onApply({ sort: 'desc' })}>▼ 내림차순 정렬</button>
        <button className="excel-filter-action" onClick={() => onApply({ sort: 'clear' })}>정렬 지우기</button>
        <div className="excel-filter-sep" />
        <input className="excel-filter-search" placeholder="열 값 검색" aria-label="열 값 검색" autoFocus value={query} onChange={e => setQuery(e.target.value)} />
        <div className="generic-values">
          <label className="excel-check"><input type="checkbox" className="g-all" checked={allChecked}
            ref={el => { if (el) el.indeterminate = someChecked && !allChecked; }}
            onChange={e => setChecked(prev => { const next = new Set(prev); visible.forEach(v => e.target.checked ? next.add(v) : next.delete(v)); return next; })} /> <b>표시된 값 전체 선택</b></label>
          {visible.map(v => (
            <label key={v} className="excel-check g-item"><input type="checkbox" className="g-cb" checked={checked.has(v)}
              onChange={e => setChecked(prev => { const next = new Set(prev); if (e.target.checked) next.add(v); else next.delete(v); return next; })} /> <span>{v || '(빈 셀)'}</span></label>
          ))}
        </div>
        <div className="excel-filter-footer">
          <button className="btn g-clear" onClick={() => onApply({ filter: null })}>필터 해제</button>
          <button className="btn primary g-apply" onClick={apply}>확인</button>
        </div>
      </div>
    </>
  );
}
