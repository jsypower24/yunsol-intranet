'use client';
// 표 칸 입력 요소: 기존 cell() 함수와 선택 상자(담당자·구분 태그, 연·월)를 옮겼습니다.
import { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes, useEffect, useRef, useState } from 'react';
import { assignmentTeam, digits, formattedBizno, ui, userColor, userLabel } from './lib';
import { showOverlay } from './overlay';
import { Row, save, store, toast } from './store';

// 입력이 끝났을 때(포커스 이동·Enter)만 저장하는 입력칸. 기존 화면의 onchange 동작과 같습니다.
export function ChangeInput({ value, onCommit, onInput, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onInput'> & {
  value: string | number; onCommit: (input: HTMLInputElement) => void; onInput?: (input: HTMLInputElement) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const commit = useRef(onCommit);
  commit.current = onCommit;
  useEffect(() => {
    const input = ref.current!;
    const handler = () => commit.current(input);
    input.addEventListener('change', handler);
    return () => input.removeEventListener('change', handler);
  }, []);
  useEffect(() => {
    const input = ref.current!;
    if (document.activeElement !== input && input.value !== String(value ?? '')) input.value = String(value ?? '');
  });
  return <input ref={ref} defaultValue={value ?? ''} onInput={onInput ? e => onInput(e.currentTarget) : undefined} {...rest} />;
}

export function ChangeTextarea({ value, onCommit, ...rest }: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  value: string; onCommit: (input: HTMLTextAreaElement) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const commit = useRef(onCommit);
  commit.current = onCommit;
  useEffect(() => {
    const input = ref.current!;
    const handler = () => commit.current(input);
    input.addEventListener('change', handler);
    return () => input.removeEventListener('change', handler);
  }, []);
  useEffect(() => {
    const input = ref.current!;
    if (document.activeElement !== input && input.value !== (value ?? '')) input.value = value ?? '';
  });
  return <textarea ref={ref} defaultValue={value ?? ''} {...rest} />;
}

export function Select({ value, onPick, children, ...rest }: Omit<SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange'> & {
  value: string; onPick: (select: HTMLSelectElement) => void; children: ReactNode;
}) {
  return <select value={value} onChange={e => onPick(e.currentTarget)} {...rest}>{children}</select>;
}

export function options(list: string[]) {
  return list.map(o => <option key={o} value={o}>{o}</option>);
}

export function gridRow(collection: string, id: string) {
  const state = store.state!;
  const row = state[collection].find((r: Row) => r.id === id);
  if (row || collection !== 'setupRows') return row;
  if (!state.companies.some(c => c.id === id && c.setup === true)) return undefined;
  const created = { id };
  state.setupRows.push(created);
  return created;
}
export function changeGridValue(collection: string, id: string, key: string, value: unknown) {
  const row = gridRow(collection, id);
  if (!row || JSON.stringify(row[key]) === JSON.stringify(value)) return Promise.resolve(true);
  row[key] = value;
  return save();
}

export function formatBiznoInput(input: HTMLInputElement) {
  const original = input.value, formatted = formattedBizno(original);
  if (formatted === original) return;
  const before = digits(original.slice(0, input.selectionStart ?? original.length)).length;
  input.value = formatted;
  let position = 0;
  while (position < formatted.length && digits(formatted.slice(0, position)).length < before) position++;
  input.setSelectionRange(position, position);
}

export const otherCategories = ('종료, 기타, 월노무, 노무, 일경험, 법정의무, 연구소, 도약, 스타트업, 시니어인턴, 고령자 계속, 육아휴직, 신중년, ' +
  '고령자 고용, 미래내일, 출산, 대체인력(육아), 워라벨, 패키지, 고용유지(유급휴직), 일가정양립(유연근무), 2023, 2024, 2025, 2026, 육아기, ' +
  '단축근무, 워라벨-소정근무단축, 청년도약지원금').split(', ');

export function pickerOptions(type: string): [string, string, string][] {
  return type === 'people' ? assignmentTeam().map(u => [u.id, userLabel(u), userColor(u)])
    : otherCategories.map((name, index) => [name, name, `hsl(${index * 53 % 360} 55% 44%)`]);
}
export function Tags({ values, type }: { values: string[]; type: string }) {
  const candidates = new Map(pickerOptions(type).map(([id, label, color]) => [id, [label, color]]));
  const shown = values.filter(id => type !== 'people' || candidates.has(id));
  if (!shown.length) return <>선택</>;
  return <>{shown.map(id => {
    const [label, color] = candidates.get(id) || [id, '#64748b'];
    return <span key={id} className="person-chip" style={{ '--person': color } as React.CSSProperties}>{label}</span>;
  })}</>;
}
export function tagsText(values: string[], type: string) {
  const candidates = new Map(pickerOptions(type).map(([id, label]) => [id, label]));
  const shown = values.filter(id => type !== 'people' || candidates.has(id)).map(id => candidates.get(id) || id);
  return shown.join('') || '선택';
}

function pickerPosition(anchor: HTMLElement) {
  const rect = anchor.getBoundingClientRect();
  return { left: Math.max(0, Math.min(rect.left, window.innerWidth - 292)), top: Math.max(0, Math.min(rect.bottom + 4, window.innerHeight - 250)) };
}

let closeCurrentPicker: null | (() => void) = null;
let currentAnchor: HTMLElement | null = null;
export function closePicker() { closeCurrentPicker?.(); }

function openPicker(anchor: HTMLElement, render: (close: () => void) => ReactNode) {
  if (currentAnchor === anchor) { closePicker(); return; }
  closePicker();
  currentAnchor = anchor;
  anchor.setAttribute('aria-expanded', 'true');
  const closeOverlay = showOverlay(close => <PickerShell anchor={anchor} onClose={close}>{render(close)}</PickerShell>);
  closeCurrentPicker = () => {
    anchor.removeAttribute('aria-expanded');
    closeOverlay();
    if (currentAnchor === anchor) { currentAnchor = null; closeCurrentPicker = null; }
  };
}
function PickerShell({ anchor, children }: { anchor: HTMLElement; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!ref.current?.contains(target) && !anchor.contains(target)) closePicker();
    };
    const keys = (event: KeyboardEvent) => { if (event.key === 'Escape') { closePicker(); anchor.focus(); } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', keys);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', keys); };
  }, [anchor]);
  return <div ref={ref} id="ysPicker" className="manager-picker" style={pickerPosition(anchor)}>{children}</div>;
}

export function TagButton({ collection, id, field, label, type, values }: {
  collection: string; id: string; field: string; label: string; type: string; values: string[];
}) {
  return (
    <button type="button" className="btn ys-tags" aria-label={label}
      onClick={e => openPicker(e.currentTarget, () => <TagPicker collection={collection} id={id} field={field} label={label} type={type} />)}>
      <Tags values={values || []} type={type} />
    </button>
  );
}
function TagPicker({ collection, id, field, label, type }: { collection: string; id: string; field: string; label: string; type: string }) {
  const [, setTick] = useState(0);
  const row = gridRow(collection, id);
  const selected: string[] = row?.[field] || [];
  return (
    <>
      <div className="manager-picker-title">{label} · 최대 3개</div>
      <div className="member-list">{pickerOptions(type).map(([value, name]) => (
        <label key={value} className="member-option">
          <input type="checkbox" value={value} checked={selected.includes(value)} autoFocus={value === pickerOptions(type)[0][0]}
            onChange={e => {
              const available = new Set(pickerOptions(type).map(([v]) => v));
              const previous = (gridRow(collection, id)?.[field] || []).filter((v: string) => available.has(v));
              if (e.target.checked && previous.length >= 3) { toast('최대 3개까지 선택할 수 있습니다.'); return; }
              const next = e.target.checked ? [...previous, value] : previous.filter((v: string) => v !== value);
              changeGridValue(collection, id, field, next);
              setTick(t => t + 1);
            }} />{name}
        </label>
      ))}</div>
    </>
  );
}

export function MonthButton({ collection, id, field, label, value }: { collection: string; id: string; field: string; label: string; value: string }) {
  const [year, month] = (value || '').split('-');
  const title = year && month ? `${year}년 ${Number(month)}월` : '연·월 선택';
  return (
    <button className="btn ys-month" aria-label={label}
      onClick={e => {
        const anchor = e.currentTarget;
        openPicker(anchor, close => <MonthPicker initial={value || ''} onSelect={next => {
          changeGridValue(collection, id, field, next);
          close(); closePicker(); anchor.focus();
        }} />);
      }}>{title}</button>
  );
}
function MonthPicker({ initial, onSelect }: { initial: string; onSelect: (value: string) => void }) {
  const [year, month] = initial.split('-');
  const currentYear = Number(new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Asia/Seoul' }).format(new Date()));
  const years = Array.from({ length: 151 }, (_, i) => String(currentYear - 100 + i));
  if (year && !years.includes(year)) years.push(year);
  const [y, setY] = useState(year || String(currentYear));
  const [m, setM] = useState(month ? String(Number(month)) : '1');
  return (
    <>
      <label>연도 <select autoFocus value={y} onChange={e => setY(e.target.value)}>{options(years)}</select></label>
      <label>월 <select value={m} onChange={e => setM(e.target.value)}>{options(Array.from({ length: 12 }, (_, i) => String(i + 1)))}</select></label>
      <div className="toolbar">
        <button className="btn primary" onClick={() => onSelect(y + '-' + m.padStart(2, '0'))}>적용</button>
        <button className="btn" onClick={() => onSelect('')}>지우기</button>
      </div>
    </>
  );
}

export function WorkToggle({ collection, id, field, label, value }: { collection: string; id: string; field: string; label: string; value: boolean }) {
  return (
    <button type="button" className="work-toggle" aria-label={label} aria-pressed={Boolean(value)}
      onClick={() => changeGridValue(collection, id, field, !value)}>{value ? '완료' : '—'}</button>
  );
}


