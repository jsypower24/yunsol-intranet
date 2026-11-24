'use client';
// 월간 업무 트래커와 신규 사업장
import { categories, setupColumns, trackerColumns } from '../columns';
import { canOpenPage, currentMonth, receiptTotals, setUi, ui, uuid, netOfVat } from '../lib';
import { askEntry } from '../overlay';
import { Row, save, store, toast } from '../store';
import { ColumnPicker, WorkGrid } from '../WorkGrid';
import { CompanyDetails } from './Company';
import { FeeTotalsTable, JointFeeNote, attributedFees } from './Fees';

async function addPrivateTrackerColumn() {
  if (ui.page !== 'work' || ui.trackerOwner !== store.current?.id) return;
  const label = (await askEntry('개인 열 추가', '새 열 제목'))?.trim();
  if (!label) return;
  if (label.length > 60) { toast('열 제목은 60자 이내로 입력해주세요.'); return; }
  if ([...trackerColumns('labor'), ...trackerColumns('other')].some(([, name]) => name.toLowerCase() === label.toLowerCase())) {
    toast('이미 사용 중인 열 제목입니다.'); return;
  }
  store.state!.privateTrackerFields = [...(store.state!.privateTrackerFields || []), { id: 'private_' + uuid(), label }];
  if (await save()) toast('내 트래커에 열을 추가했습니다.');
}

function openMyMonthlyFees(period: string) {
  if (!store.current || ui.page !== 'work' || ui.trackerOwner !== store.current.id) return;
  setUi({ feeOpenedFromTracker: true, feeMonth: period, feeChannel: '합산', feeProduct: '', feeStatus: '', feeAssignee: store.current.id, trackerOwner: '', page: 'fee' });
  window.scrollTo(0, 0);
}

function PersonalTrackerFees() {
  const period = currentMonth();
  const rows = attributedFees(store.current!.id).filter(r => r.billingMonth === period);
  const net = rows.reduce((s, r) => s + netOfVat(r.amount), 0);
  return (
    <details className="card tracker-own-fees" open={ui.personalFeesExpanded} onToggle={e => { ui.personalFeesExpanded = e.currentTarget.open; }}>
      <summary>내 당월 수수료 <span className="sub">{period}</span></summary>
      <div className="toolbar"><button type="button" className="fee-detail-link" onClick={() => openMyMonthlyFees(period)}>수수료 관리에서 보기</button></div>
      <FeeTotalsTable totals={receiptTotals(rows)} net={net} owner={store.current!.id} />
      <JointFeeNote rows={rows} owner={store.current!.id} />
    </details>
  );
}

export function WorkPage() {
  const state = store.state!;
  const current = store.current!;
  if (ui.companyDetailId) {
    const company = canOpenPage('company') ? state.companies.find(r => r.id === ui.companyDetailId) : ui.trackerWorkplace?.company;
    if (company && state.works.some(w => w.companyId === company.id)) {
      return <CompanyDetails company={company} readOnly={!canOpenPage('company')} fields={ui.trackerWorkplace?.fields || state.companyFields || []} />;
    }
    ui.companyDetailId = '';
    ui.trackerWorkplace = null;
  }
  const mapped = new Map(state.companies.map(c => [c.id, c]));
  const grouped: Record<string, [Row, Row][]> = { labor: [], other: [] };
  const owner = ui.trackerOwner || current.id;
  for (const work of state.works) {
    const company = mapped.get(work.companyId);
    if (!company || !(company.mainManagers || []).includes(owner) || (ui.workTab !== 'all' && (work.closed === '종료' || company.category === '종료'))) continue;
    const kind = (company.category === '종료' ? company.lastActiveCategory : company.category) === categories[0] ? 'labor' : 'other';
    if (ui.workTab === 'all' || ui.workTab === kind) grouped[kind].push([work, company]);
  }
  const count = grouped.labor.length + grouped.other.length;
  const views = ui.workTab === 'all' ? ['labor', 'other'] : [ui.workTab];
  const mine = ui.trackerOwner === current.id;
  return (
    <>
      {mine && <PersonalTrackerFees />}
      <div className="card">
        <div className="toolbar">
          {[['all', '전체'], ['labor', '노무 업무'], ['other', '기타 업무']].map(([key, label]) => (
            <button key={key} className={`btn sm ${ui.workTab === key ? 'primary' : ''}`} aria-pressed={ui.workTab === key} onClick={() => setUi({ workTab: key })}>{label}</button>
          ))}
          <span className="sub">총 {count}건</span>
          {mine && <button className="btn sm" onClick={addPrivateTrackerColumn}>열 추가</button>}
        </div>
        {views.map(kind => (
          <div key={kind}>
            {ui.workTab === 'all' && <h3>{kind === 'labor' ? '노무 업무' : '기타 업무'}</h3>}
            <ColumnPicker group={kind} columns={trackerColumns(kind)} />
            <WorkGrid columns={trackerColumns(kind)} allColumns={trackerColumns(kind, true)} rows={grouped[kind]} collection="works" kind={kind} />
          </div>
        ))}
      </div>
    </>
  );
}

export function NewPage() {
  const state = store.state!;
  const existing = new Map((state.setupRows || []).map(r => [r.id, r]));
  const rows: [Row, Row][] = state.companies.filter(c => c.setup === true).map(c => [existing.get(c.id) || { id: c.id }, c]);
  return (
    <div className="card">
      <div className="toolbar"><span className="sub">총 {rows.length}건</span></div>
      <WorkGrid columns={setupColumns} rows={rows} collection="setupRows" kind="new" />
    </div>
  );
}
