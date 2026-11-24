'use client';
// 수임 사업장 정보: 목록, 상세(사업장 정보 + 본문 블록), 엑셀 양식·업로드, 공용 열 추가
import { useRef, useState } from 'react';
import { ColDef, companyColumns, categories } from '../columns';
import { assignmentTeam, digits, formattedBizno, setUi, ui, userLabel, uuid } from '../lib';
import { askEntry, askRemoval, showActionDialog } from '../overlay';
import { queued, Row, save, store, toast } from '../store';
import { cell, ColumnPicker, WorkGrid } from '../WorkGrid';
import { Tags } from '../cells';

export function companyRow(fields: Row = {}) {
  return { id: uuid(), name: '', bizno: '', category: '진행(자문)', mainManagers: [], feeOwners: [], ...fields };
}

async function addCompany() {
  const row = companyRow();
  store.state!.companies.unshift(row);
  if (await save()) {
    setUi({ companyFocusId: '', companyQuery: '', companyMode: '전체', companyDetailId: row.id, detailsExpanded: true });
    setTimeout(() => (document.querySelector('#content input[aria-label="업체명"]') as HTMLInputElement | null)?.focus(), 50);
  }
}

async function addCompanyColumn() {
  const label = (await askEntry('공용 열 추가', '새 열 제목'))?.trim();
  if (!label) return;
  if (label.length > 60) { toast('열 제목은 60자 이내로 입력해주세요.'); return; }
  const used = [...companyColumns().map(c => c[1]), '관리', 'CMS', '기장 담당', '수수 주인'];
  if (used.some(e => e.toLowerCase() === label.toLowerCase())) { toast('이미 사용 중인 열 제목입니다.'); return; }
  store.state!.companyFields = [...(store.state!.companyFields || []), { id: 'custom_' + uuid(), label }];
  if (await save()) toast('공용 열을 추가했습니다.');
}

function managerIds(text: string) {
  if (!text) return [];
  const names = text.split(/[,\n]/).map(n => n.trim());
  if (names.length > 3) throw Error('담당자는 최대 3명입니다.');
  const ids = names.map(name => {
    const users = assignmentTeam().filter(u => u.id === name || u.username === name || u.name === name || userLabel(u) === name);
    if (users.length !== 1) throw Error('담당자를 한 명으로 확인할 수 없습니다.');
    return users[0].id;
  });
  if (new Set(ids).size !== ids.length) throw Error('담당자가 중복되었습니다.');
  return ids;
}

async function chooseDuplicate(fields: Row, matches: Row[], line: number) {
  const picked = await showActionDialog({
    title: '사업자등록번호 중복',
    message: `${line}행 · ${fields.name} (${fields.bizno}) · 기존 사업장 ${matches.length}건`,
    actions: [['skip', '건너뛰기', ''], ['add', '신규로 추가', ''], ['replace', '기존 정보 덮어쓰기', 'primary']],
  });
  if (picked?.action === 'add') return { add: true };
  if (picked?.action !== 'replace') return {};
  if (matches.length === 1) return { target: matches[0] };
  const selected = await showActionDialog({
    title: '덮어쓸 사업장 선택', field: { label: '기존 사업장', options: matches.map(c => [c.id, `${c.name} (${c.bizno})`]) },
    actions: [['replace', '덮어쓰기', 'primary']],
  });
  return { target: matches.find(c => c.id === selected?.value) };
}

async function uploadCompanies(file: File, report: (text: string, details?: string) => void) {
  try {
    await queued;
    const response = await fetch('/api/company-import', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file });
    const parsed = await response.json();
    if (!response.ok) throw Error(parsed.error);
    if (ui.page !== 'company' || !store.current) return;
    const counts = { added: 0, updated: 0, skipped: 0, errors: 0 };
    const errors: string[] = [];
    const initialRevision = store.revision;
    const companies: Row[] = structuredClone(store.state!.companies);
    for (const item of parsed.rows as { line: number; fields?: Row; error?: string }[]) {
      try {
        if (item.error) throw Error(item.error);
        const fields = { ...item.fields } as Row;
        const number = digits(fields.bizno);
        if (!fields.name || !fields.bizno) throw Error('업체명과 사업자등록번호를 입력해주세요.');
        if (![10, 11].includes(number.length)) throw Error('사업자등록번호는 숫자 10자리 또는 11자리로 입력해주세요.');
        fields.bizno = formattedBizno(fields.bizno);
        if (!fields.category) delete fields.category;
        if ('paymentMethod' in fields && !['', 'CMS', '계좌이체'].includes(fields.paymentMethod)) throw Error('수납 방식은 CMS 또는 계좌이체여야 합니다.');
        if (fields.category && !categories.includes(fields.category)) throw Error('분류 목록의 값을 사용해주세요.');
        for (const key of ['mainManagers', 'feeOwners']) if (key in fields) fields[key] = managerIds(fields[key]);
        if (fields.closedOn && !/^\d{4}-\d{2}-\d{2}$/.test(fields.closedOn)) throw Error('종료일자는 2026-01-31 형식으로 입력해주세요.');
        const matches = companies.filter(c => digits(c.bizno) === number);
        const { target, add } = matches.length ? await chooseDuplicate(fields, matches, item.line) : { add: true, target: undefined };
        if (add) { companies.unshift(companyRow(fields)); counts.added++; }
        else if (target) { Object.assign(target, fields); counts.updated++; }
        else counts.skipped++;
      } catch (error) { counts.errors++; errors.push(`${item.line}행 ${(error as Error).message}`); }
    }
    if (ui.page !== 'company' || !store.current) return;
    if (store.revision !== initialRevision) throw Error('사업장 정보가 변경되었습니다. 최신 화면에서 다시 업로드해주세요.');
    store.state!.companies = companies;
    const ok = await save();
    report(ok === false ? '업로드 내용을 저장하지 못했습니다.'
      : `등록 ${counts.added}건 · 수정 ${counts.updated}건 · 건너뜀 ${counts.skipped}건 · 오류 ${counts.errors}건`, errors.slice(0, 10).join(' / '));
  } catch (error) {
    report('업로드 실패 · ' + (error as Error).message);
  }
}

export function CompanyPage() {
  const state = store.state!;
  const detail = state.companies.find(r => r.id === ui.companyDetailId);
  const upload = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<{ text: string; details?: string } | null>(null);
  if (detail) return <CompanyDetails company={detail} />;
  if (ui.companyDetailId) ui.companyDetailId = '';
  const query = ui.companyQuery.toLowerCase(), number = digits(query);
  const rows = state.companies
    .filter(c => ui.companyFocusId || ui.companyMode === '전체' || (ui.companyMode === '종료') === (c.category === '종료'))
    .filter(c => ui.companyFocusId ? c.id === ui.companyFocusId
      : (!query || String(c.name ?? '').toLowerCase().includes(query) || (number && digits(c.bizno).includes(number))));
  return (
    <div className="card">
      <div className="company-toolbar toolbar">
        <div className="company-tabs">
          {['진행', '종료', '전체'].map(mode => (
            <button key={mode} className={`btn sm ${ui.companyMode === mode ? 'primary' : ''}`} aria-pressed={ui.companyMode === mode}
              onClick={() => setUi({ companyMode: mode, companyFocusId: '' })}>{mode}</button>
          ))}
          <ColumnPicker group="company" columns={companyColumns()} />
        </div>
        <div className="company-actions">
          <a className="btn sm" href="/api/company-template" download>엑셀 양식 다운로드</a>
          <button className="btn sm" onClick={() => upload.current?.click()}>엑셀 업로드</button>
          <input ref={upload} id="companyUpload" type="file" accept=".xlsx" hidden onChange={e => {
            const file = e.currentTarget.files?.[0];
            e.currentTarget.value = '';
            if (file) uploadCompanies(file, (text, details) => setResult({ text, details }));
          }} />
          <button className="btn primary sm" onClick={addCompany}>행 추가</button>
          <button className="btn sm" onClick={addCompanyColumn}>열 추가</button>
          <input id="companySearch" className="input" placeholder="업체명·사업자등록번호 검색" value={ui.companyQuery}
            onChange={e => setUi({ companyFocusId: '', companyQuery: e.target.value })} />
        </div>
      </div>
      <div id="importResult" role="status">{result?.text}{result?.details && <p>{result.details}</p>}</div>
      <div id="companyTable">
        <WorkGrid columns={companyColumns()} allColumns={companyColumns()} rows={rows.map(r => [r, null])} collection="companies" />
      </div>
    </div>
  );
}

function readCompanyProperty(company: Row, [key, , type]: ColDef) {
  const value = company[key];
  if (type === 'people') return value?.length ? <Tags values={value} type="people" /> : '—';
  if (type === 'check') return value ? '완료' : '—';
  return (key === 'bizno' ? formattedBizno(value || '') : value) || '—';
}

export function companyDocument(company: Row): Row[] {
  if (Array.isArray(company.detailBlocks)) return company.detailBlocks;
  return [{ id: 'legacy-note', type: 'text', text: company.detailNotes || '' },
    ...(company.detailImages || []).map((image: Row, index: number) => ({ id: 'legacy-image-' + index, type: 'image', ...image, align: 'center', size: 'full' }))];
}

export function closeCompanyDetail() {
  const restore = ui.page === 'work' ? ui.scrollRestore : null;
  setUi({ companyDetailId: '', trackerWorkplace: null });
  if (restore) requestAnimationFrame(() => window.scrollTo(restore.x, restore.y));
}

export function CompanyDetails({ company, readOnly = false, fields }: { company: Row; readOnly?: boolean; fields?: Row[] }) {
  const columns = companyColumns(fields || store.state!.companyFields || []);
  return (
    <article className="card company-detail">
      <button className="btn sm" onClick={closeCompanyDetail}>목록으로</button>
      <h2>{company.name || '수임 사업장'}</h2>
      <details className="company-properties" open={ui.detailsExpanded} onToggle={e => { ui.detailsExpanded = e.currentTarget.open; }}>
        <summary>사업장 정보</summary>
        <dl>{columns.map(col => (
          <div key={col[0]} style={{ display: 'contents' }}>
            <dt>{col[1]}</dt>
            <dd>{readOnly ? readCompanyProperty(company, col) : cell(company, col, 'companies', null, 'detail')}</dd>
          </div>
        ))}</dl>
      </details>
      {readOnly ? <ReadDocument company={company} /> : <DocumentEditor company={company} />}
    </article>
  );
}

function ReadDocument({ company }: { company: Row }) {
  return (
    <section className="company-document" aria-label="사업장 상세 내용">
      {companyDocument(company).map(block => block.type === 'text'
        ? <div key={block.id} className="document-read-text">{block.text}</div>
        // eslint-disable-next-line @next/next/no-img-element
        : <figure key={block.id} className="document-image" data-align={block.align} data-size={block.size}><img src={block.data} alt={block.name} /></figure>)}
    </section>
  );
}

const documentImageTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
let draggedBlock: null | { id: string; block: string } = null;

async function saveCompanyDocument(id: string, blocks: Row[]) {
  if (blocks.length > 50 || blocks.filter(b => b.type === 'image').length > 5 || blocks.reduce((s, b) => s + (b.text?.length || 0), 0) > 50_000) {
    toast('본문은 블록 50개, 텍스트 5만 자, 이미지 5장까지 저장할 수 있습니다.'); return;
  }
  const company = store.state!.companies.find(c => c.id === id);
  if (!company || JSON.stringify(company.detailBlocks) === JSON.stringify(blocks)) return;
  company.detailBlocks = blocks;
  await save();
}
function currentDocument(id: string) {
  const company = store.state?.companies.find(c => c.id === id);
  return company ? companyDocument(company) : null;
}
function moveBlock(id: string, blockId: string, index: number) {
  const blocks = [...(currentDocument(id) || [])];
  const from = blocks.findIndex(b => b.id === blockId);
  if (from < 0 || index < 0 || index > blocks.length || index === from || index === from + 1) return;
  const [block] = blocks.splice(from, 1);
  blocks.splice(index > from ? index - 1 : index, 0, block);
  saveCompanyDocument(id, blocks);
}
async function insertImages(files: File[], id: string, index: number | null = null) {
  if (!files.length || !currentDocument(id)) return;
  if (files.some(f => f.size > 1_000_000 || !documentImageTypes.includes(f.type))) {
    toast('PNG, JPEG, WebP, GIF 이미지를 한 장당 1MB까지 올릴 수 있습니다.'); return;
  }
  try {
    const additions = await Promise.all(files.map(file => new Promise<Row>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ id: uuid(), type: 'image', name: file.name.slice(0, 255), data: reader.result, align: 'center', size: 'full' });
      reader.onerror = reject;
      reader.readAsDataURL(file);
    })));
    const latest = currentDocument(id);
    if (!latest) return;
    const position = index === null ? latest.length : Math.min(index, latest.length);
    await saveCompanyDocument(id, [...latest.slice(0, position), ...additions, ...latest.slice(position)]);
  } catch { toast('이미지를 읽지 못했습니다.'); }
}
function allowDrop(event: React.DragEvent) {
  if (draggedBlock || Array.from(event.dataTransfer.types).includes('Files')) event.preventDefault();
}
function dropAt(event: React.DragEvent, id: string, index: number) {
  if (!draggedBlock && !event.dataTransfer.files.length) return;
  event.preventDefault();
  event.stopPropagation();
  (event.currentTarget as HTMLElement).classList.remove('over');
  const files = [...event.dataTransfer.files];
  if (files.length) insertImages(files, id, index);
  else if (draggedBlock?.id === id) moveBlock(id, draggedBlock.block, index);
  draggedBlock = null;
}

function DropZone({ id, index }: { id: string; index: number }) {
  return <div className="document-drop-zone"
    onDragOver={e => { allowDrop(e); if (e.defaultPrevented) e.currentTarget.classList.add('over'); }}
    onDragLeave={e => e.currentTarget.classList.remove('over')} onDrop={e => dropAt(e, id, index)} />;
}

function DocumentEditor({ company }: { company: Row }) {
  const blocks = companyDocument(company);
  const id = company.id;
  const edit = (blockId: string, fields: Row) => {
    const current = currentDocument(id);
    if (current) saveCompanyDocument(id, current.map(b => (b.id === blockId ? { ...b, ...fields } : b)));
  };
  return (
    <section className="company-document" aria-label="사업장 상세 내용" onDragOver={allowDrop} onDrop={e => dropAt(e, id, blocks.length)}>
      <div className="toolbar document-toolbar">
        <button type="button" className="btn" onClick={() => saveCompanyDocument(id, [...(currentDocument(id) || []), { id: uuid(), type: 'text', text: '' }])}>텍스트 추가</button>
        <label className="btn detail-image-upload">이미지 업로드 <input type="file" accept={documentImageTypes.join(',')} multiple
          onChange={e => { const files = [...(e.currentTarget.files || [])]; e.currentTarget.value = ''; insertImages(files, id); }} /></label>
        <span className="sub">이미지를 블록 사이에 놓아 삽입할 수 있습니다.</span>
      </div>
      {blocks.map((block, index) => (
        <div key={block.id} style={{ display: 'contents' }}>
          <DropZone id={id} index={index} />
          <div className="document-block" data-block={block.id}>
            <div className="document-block-actions">
              <span className="document-grip" draggable title="드래그하여 위치 이동"
                onDragStart={e => { draggedBlock = { id, block: block.id }; e.dataTransfer.setData('application/x-yunsol-block', block.id); e.dataTransfer.effectAllowed = 'move'; }}
                onDragEnd={() => { draggedBlock = null; }}>⠿</span>
              <button type="button" aria-label="블록 위로 이동" disabled={index === 0} onClick={() => moveBlock(id, block.id, index - 1)}>↑</button>
              <button type="button" aria-label="블록 아래로 이동" disabled={index === blocks.length - 1} onClick={() => moveBlock(id, block.id, index + 2)}>↓</button>
              <button type="button" aria-label="블록 삭제" onClick={async () => {
                if ((block.type === 'image' || block.text) && !await askRemoval('본문 블록 삭제', '이 블록을 삭제할까요?')) return;
                saveCompanyDocument(id, (currentDocument(id) || []).filter(b => b.id !== block.id));
              }}>삭제</button>
            </div>
            {block.type === 'text'
              ? <BlockText value={block.text} onCommit={text => edit(block.id, { text })} />
              : <figure className="document-image" data-align={block.align} data-size={block.size}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={block.data} alt={block.name} />
                <figcaption>
                  <label>정렬 <select aria-label="이미지 정렬" value={block.align} onChange={e => edit(block.id, { align: e.target.value })}>
                    {[['left', '왼쪽'], ['center', '가운데'], ['right', '오른쪽']].map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
                  <label>크기 <select aria-label="이미지 크기" value={block.size} onChange={e => edit(block.id, { size: e.target.value })}>
                    {[['small', '작게'], ['medium', '보통'], ['full', '넓게']].map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
                </figcaption>
              </figure>}
          </div>
        </div>
      ))}
      <DropZone id={id} index={blocks.length} />
    </section>
  );
}

function BlockText({ value, onCommit }: { value: string; onCommit: (text: string) => void }) {
  return <textarea aria-label="본문 텍스트" rows={3} maxLength={50000} placeholder="내용을 입력하세요" defaultValue={value}
    onBlur={e => { if (e.currentTarget.value !== value) onCommit(e.currentTarget.value); }} />;
}
