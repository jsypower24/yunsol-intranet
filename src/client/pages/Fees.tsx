'use client';
// 수수료: 대시보드, 수수료 관리, 담당자 수수료 집계
import { useState } from 'react';
import { Column, Grid } from '../Grid';
import { options } from '../cells';
import {
  assignmentTeam, canOpenPage, feeChannelOf, feeProducts, gridCollator, netOfVat, openFeeWorkplace, receiptTotals, setUi, ui,
  userLabel, won, workplaceForFee, go,
} from '../lib';
import { Row, save, store, toast } from '../store';

function FeeFilters({ rows, product = true }: { rows: Row[]; product?: boolean }) {
  const products = [...new Set([...feeProducts, ...rows.map(r => r.product)])];
  return (
    <div className="toolbar">
      <label>조회 월 <input type="month" className="input" value={ui.feeMonth} onChange={e => { if (e.target.value) setUi({ feeMonth: e.target.value, feeProduct: '' }); }} /></label>
      {['합산', 'CMS', '계좌이체'].map(channel => (
        <button key={channel} className={`btn ${ui.feeChannel === channel ? 'primary' : ''}`} aria-pressed={ui.feeChannel === channel}
          onClick={() => setUi({ feeChannel: channel, feeProduct: '' })}>{channel}</button>
      ))}
      {product && <label>상품 <select className="input" value={ui.feeProduct} onChange={e => setUi({ feeProduct: e.target.value })}>
        <option value="">전체 상품</option>{options(products)}</select></label>}
    </div>
  );
}

function currentFeeRows() {
  return store.state!.fees.filter(r => r.billingMonth === ui.feeMonth && feeChannelOf(r));
}

function openFeeProduct(product: string) {
  if (!canOpenPage('fee')) return;
  ui.feeOpenedFromTracker = false;
  ui.feeAssignee = ''; ui.feeStatus = ''; ui.feeProduct = product;
  go('fee');
}

function DashboardStatusRows({ rows }: { rows: Row[] }) {
  if (!ui.dashboardStatus) return null;
  const workplaces = new Map<string, { company?: Row; name: string; amount: number; count: number }>();
  for (const row of rows.filter(r => r.status === ui.dashboardStatus)) {
    const company = workplaceForFee(row);
    const key = company ? `company:${company.id}` : row.cms ? `cms:${row.cms}` : `unlinked:${row.id}`;
    if (!workplaces.has(key)) workplaces.set(key, { company, name: row.memberName, amount: 0, count: 0 });
    const group = workplaces.get(key)!;
    group.amount += row.amount;
    group.count++;
  }
  return (
    <section className="card"><h3>{ui.dashboardStatus} 사업장 · {workplaces.size}곳</h3>
      <ul className="dashboard-workplaces">
        {[...workplaces.entries()].map(([key, { company, name, amount, count }]) => (
          <li key={key}>
            {company && canOpenPage('company')
              ? <button type="button" className="fee-detail-link" onClick={() => openFeeWorkplace(company.id)}>{company.name}</button>
              : (company?.name || name || '회원명 미등록')}
            <span>{count}건 · {won(amount)}</span>
          </li>
        ))}
        {!workplaces.size && <li>조회 조건에 맞는 사업장이 없습니다.</li>}
      </ul>
    </section>
  );
}

export function DashboardPage() {
  const state = store.state!;
  const rows = currentFeeRows().filter(r => ui.feeChannel === '합산' || feeChannelOf(r) === ui.feeChannel);
  const visible = rows.filter(r => !ui.feeProduct || r.product === ui.feeProduct);
  const groups = new Map<string, Row[]>();
  for (const row of visible) groups.set(row.product, [...(groups.get(row.product) || []), row]);
  const totals = receiptTotals(visible);
  const updated: string | undefined = state.feeImports?.[ui.feeMonth];
  const issuedCount = (state.invoices || []).filter((r: Row) => r.billingMonth === ui.feeMonth && r.issued && r.transmission === '처리완료').length;
  const kpis: [string, number][] = [['청구금액', totals.amount], ['완납', totals.paid], ['미납', totals.unpaid], ['수납대기', totals.pending], ['기타 상태', totals.other]];
  return (
    <>
      <div className="card"><h3>월별 수납 현황</h3><FeeFilters rows={rows} />
        <p className="sub">{updated ? 'CMS 반영 ' + updated.slice(0, 16).replace('T', ' ') : '선택한 월의 CMS 반영 기록이 없습니다.'}</p>
        <div className="kpis">{kpis.filter(([label, value]) => label !== '기타 상태' || value !== 0).map(([label, value]) =>
          ['완납', '미납', '수납대기'].includes(label)
            ? <button key={label} type="button" className="kpi status-kpi" aria-pressed={ui.dashboardStatus === label}
              onClick={() => setUi({ dashboardStatus: ui.dashboardStatus === label ? '' : label })}>{label}<span className="v">{won(value)}</span></button>
            : <div key={label} className="kpi">{label}<div className="v">{won(value)}</div></div>)}</div>
        {ui.feeChannel !== '계좌이체' && <p className="sub">국세청 처리완료·발급일 확인 {issuedCount.toLocaleString('ko-KR')}건 · 선택한 청구월의 전체 세금계산서</p>}
      </div>
      <DashboardStatusRows rows={visible} />
      <div className="card"><h3>상품별 수납 현황</h3>
        <Grid<[string, Row[]]> group="dashboard" wrapClass="grid-wrap dashboard-fee" resize={false}
          columns={[['product', '상품'], ['count', '청구 건수'], ['amount', '청구금액'], ['paid', '완납'], ['unpaid', '미납'], ['pending', '수납대기'], ['other', '기타 상태']]
            .map(([key, label]) => ({ key, label, width: key === 'product' ? 160 : 100 }))}
          rows={[...groups].sort(([a], [b]) => a.localeCompare(b, 'ko'))}
          rowKey={([product]) => product}
          emptyText="조회 조건에 맞는 수납 내역이 없습니다."
          cellText={([product, items], c) => c.key === 'product' ? product : c.key === 'count' ? String(items.length) : won(receiptTotals(items)[c.key])}
          renderCell={([product, items], c) => c.key === 'product'
            ? (canOpenPage('fee') ? <button type="button" className="fee-detail-link" onClick={() => openFeeProduct(product)}>{product}</button> : product)
            : c.key === 'count' ? items.length : won(receiptTotals(items)[c.key])} />
      </div>
    </>
  );
}

function invoiceFor(row: Row) {
  const state = store.state!;
  if (row.source !== 'hyosung') return '';
  const sameKey = (item: Row) => item.cms === row.cms && item.billingMonth === row.billingMonth && item.amount === row.amount;
  const matches = (state.invoices || []).filter(sameKey);
  if (!matches.length) return '확인 내역 없음';
  const billCount = state.fees.filter(i => i.source === 'hyosung' && sameKey(i)).length;
  if (matches.length !== 1 || billCount !== 1) return '연결 확인 필요';
  const invoice = matches[0];
  return [invoice.issued, invoice.transmission].filter(Boolean).join(' · ') || '확인 필요';
}

function TransferForm() {
  const workplaces = store.state!.companies.filter(c => c.paymentMethod === '계좌이체');
  const [busy, setBusy] = useState(false);
  if (!workplaces.length) return <p className="sub">계좌이체 내역을 등록하려면 수임 사업장 정보에서 수납 방식을 계좌이체로 지정하세요.</p>;
  return (
    <details className="transfer-entry"><summary>계좌이체 내역 등록</summary>
      <form className="toolbar" onSubmit={async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = Object.fromEntries(new FormData(form)) as Record<string, string>;
        if (!data.product.trim()) { toast('상품명을 입력해주세요.'); return; }
        const company = store.state!.companies.find(c => c.id === data.companyRef)!;
        setBusy(true);
        store.state!.fees.push({ ...data, id: crypto.randomUUID(), billingMonth: ui.feeMonth, method: '계좌이체', memberName: company.name, amount: Number(data.amount) });
        if (await save()) { toast('계좌이체 내역을 등록했습니다.'); form.reset(); }
        setBusy(false);
      }}>
        <label>사업장 <select name="companyRef" required>{workplaces.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label>상품 <select name="product" required defaultValue=""><option value="">--- 선택 ---</option>{options(feeProducts)}</select></label>
        <label>청구금액 <input name="amount" type="number" min={0} max={9999999999} step={1} required /></label>
        <label>수납상태 <select name="status">{options(['수납대기', '완납', '미납'])}</select></label>
        <button className="btn primary" disabled={busy}>등록</button>
      </form>
    </details>
  );
}

const feeColumns: [string, string, number][] = [
  ['cms', 'CMS번호', 110], ['memberName', '회원명(업체명)', 190], ['billingMonth', '청구월', 95], ['product', '상품', 170], ['amount', '청구금액', 120],
  ['netAmount', '부가세 제외', 125], ['status', '수납상태', 105], ['owners', '수수료 귀속', 155], ['method', '결제수단', 105], ['contractDay', '약정일', 85],
  ['date', '결제일', 125], ['memo', '메모', 220], ['mainManager', '주담당', 110], ['subManager', '부담당', 110], ['tax', '세금계산서', 240], ['manage', '관리', 190],
];

export function FeePage() {
  const state = store.state!;
  const current = store.current!;
  const canManage = canOpenPage('fee');
  const directory: Record<string, Row> = state.feeDirectory || {};
  const monthly = (canManage ? state.fees : state.ownFeeDetails || []).filter((r: Row) => r.billingMonth === ui.feeMonth && feeChannelOf(r));
  const eligible = monthly.filter((r: Row) => ui.feeChannel === '합산' || feeChannelOf(r) === ui.feeChannel);
  const owners = new Map<string, string>([[current.id, current.name || userLabel(current)]]);
  if (canManage) {
    for (const p of assignmentTeam()) owners.set(p.id, p.name || userLabel(p));
    for (const entry of Object.values(directory)) for (const o of entry.owners) owners.set(o.id, o.name);
  }
  const assignee = canManage ? (owners.has(ui.feeAssignee) ? ui.feeAssignee : '') : current.id;
  const owned = eligible.filter((r: Row) => !assignee || directory[r.id]?.owners.some((o: Row) => o.id === assignee));
  const productRows = owned.filter((r: Row) => !ui.feeProduct || r.product === ui.feeProduct);
  const rows = productRows.filter((r: Row) => !ui.feeStatus || r.status === ui.feeStatus);
  const totals = receiptTotals(productRows);
  const changeStatus = (id: string, value: string) => {
    const row = state.fees.find(r => r.id === id && r.source === 'transfer');
    if (!row) return;
    row.status = value;
    save();
  };
  const text = (row: Row, key: string) => {
    const attribution = directory[row.id];
    const workplace = workplaceForFee(row) || (attribution?.companyId ? { id: attribution.companyId, name: attribution.companyName } : null);
    if (key === 'owners') return attribution?.owners.map((o: Row) => o.name).join(', ') || '미지정';
    if (key === 'memberName' && workplace) return workplace.name;
    if (key === 'tax') return invoiceFor(row);
    if (key === 'amount') return won(row.amount);
    if (key === 'netAmount') return won(netOfVat(row.amount));
    return String(row[key] ?? '');
  };
  return (
    <div className="card">
      <FeeFilters rows={owned} />
      <div className="toolbar">
        <label>담당자 <select className="input" value={assignee} disabled={!canManage} onChange={e => setUi({ feeAssignee: e.target.value })}>
          {canManage && <option value="">전체 담당자</option>}
          {[...owners].map(([id, name]) => <option key={id} value={id}>{name}{id === current.id ? ' (나)' : ''}</option>)}
        </select></label>
      </div>
      <div className="toolbar fee-status-controls">
        {([['', '청구금액', totals.amount], ['완납', '완납', totals.paid], ['미납', '미납', totals.unpaid], ['수납대기', '수납대기', totals.pending]] as [string, string, number][])
          .map(([status, label, amount]) => (
            <button key={label} type="button" className={`btn ${ui.feeStatus === status ? 'primary' : ''}`} aria-pressed={ui.feeStatus === status}
              onClick={() => setUi({ feeStatus: status })}>{label} <strong>{won(amount)}</strong></button>
          ))}
      </div>
      {canManage && <TransferForm />}
      <Grid<Row> group="fee" wrapClass="grid-wrap fee-grid ys-grid ys-fee-grid" rows={rows} rowKey={r => r.id}
        columns={feeColumns.map(([key, label, width]) => ({ key, label, width }))}
        emptyText="조회 조건에 맞는 수수료 내역이 없습니다."
        showCount={shown => <div className="toolbar"><span id="feeCount" className="sub">{shown}건 표시 / 전체 {productRows.length}건</span></div>}
        cellText={(row, c) => text(row, c.key)}
        renderCell={(row, c) => {
          const attribution = directory[row.id];
          const workplace = workplaceForFee(row) || (attribution?.companyId ? { id: attribution.companyId, name: attribution.companyName } : null);
          if (c.key === 'memberName' && workplace) {
            return canOpenPage('company')
              ? <button type="button" className="fee-detail-link" onClick={() => openFeeWorkplace(workplace.id)}>{workplace.name}</button>
              : workplace.name;
          }
          if (c.key === 'status' && row.source === 'transfer' && canManage) {
            return <select aria-label="수납상태" value={row.status} onChange={e => changeStatus(row.id, e.target.value)}>{options(['수납대기', '완납', '미납'])}</select>;
          }
          return text(row, c.key);
        }} />
    </div>
  );
}

// 담당자 수수료 집계
const productColors = ['#2563eb', '#0f766e', '#d97706', '#7c3aed', '#db2777', '#64748b'];
const teamFeeTarget = 2.5;

function teamFeeOwners(rows: Row[]) {
  const current = store.current!;
  const owners = new Map<string, string>([[current.id, current.name || userLabel(current)]]);
  if (current.admin || (current.permissions || []).includes('teamFees')) {
    for (const m of assignmentTeam()) owners.set(m.id, m.name || userLabel(m));
    for (const r of rows) for (const o of r.owners) owners.set(o.id, o.name);
    if (rows.some(r => !r.owners.length)) owners.set('unassigned', '미지정');
  }
  return owners;
}
function previousFeeMonth(period: string) {
  const [y, m] = period.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}
function feeMonthChange(currentAmount: number, previousRows: Row[]) {
  if (!previousRows.length) return '전월 기록 없음';
  const prior = receiptTotals(previousRows).amount;
  const diff = currentAmount - prior;
  const sign = diff > 0 ? '+' : diff < 0 ? '−' : '';
  const relative = prior > 0 ? ` (${sign}${(Math.abs(diff) * 100 / prior).toFixed(1)}%)` : '';
  return sign + won(Math.abs(diff)) + relative;
}
function TeamPerformance({ net, owner }: { net: number; owner: string }) {
  const base = store.state!.teamFeeProfiles?.[owner]?.performanceBase;
  if (!base) return <p className="sub">실적 달성률 · 팀원 관리에서 실적 기준금액을 설정하면 표시됩니다.</p>;
  const target = Math.round(base * teamFeeTarget);
  const rate = net * 100 / target;
  return (
    <div className="team-performance"><strong>실적 달성률 {rate.toFixed(1)}%</strong>
      <progress value={Math.max(0, Math.min(rate, 100))} max={100} aria-label="실적 목표 달성률" />
      <span className="sub">기준 {won(base)} × 250% = 목표 {won(target)} · 실적 {won(net)} (부가세 제외)</span></div>
  );
}
function attributedWorkplaces(owner: string): Row[] {
  return (store.state!.teamFeeWorkplaces || []).filter((c: Row) => owner === 'unassigned' ? !c.ownerIds.length : c.ownerIds.includes(owner));
}
export function attributedFees(owner: string): Row[] {
  return (store.state!.teamFeeRows || []).filter((r: Row) => owner === 'unassigned' ? !r.owners.length : r.owners.some((p: Row) => p.id === owner));
}
export function FeeTotalsTable({ totals, net, owner }: { totals: Record<string, number>; net: number; owner: string }) {
  const count = attributedWorkplaces(owner).filter(c => c.category !== '종료').length;
  return (
    <div className="grid-wrap team-fee-totals"><table><thead><tr><th>총 수수료<br />(부가세 포함)</th><th>총 수수료<br />(부가세 제외)</th>
      <th>완납</th><th>미납</th><th>수납대기</th><th>당월 담당<br />사업장 수</th></tr></thead>
      <tbody><tr>{[totals.amount, net, totals.paid, totals.unpaid, totals.pending].map((a, i) => <td key={i}>{won(a)}</td>)}
        <td>{count.toLocaleString('ko-KR')}곳</td></tr></tbody></table></div>
  );
}
export function JointFeeNote({ rows, owner }: { rows: Row[]; owner: string }) {
  const joint = rows.filter(r => r.joint);
  if (!joint.length) return null;
  const byWorkplace = new Map<string, Row>();
  for (const row of joint) {
    const d = row.jointDetails;
    if (!d) continue;
    if (!byWorkplace.has(d.id)) byWorkplace.set(d.id, { ...d, amount: 0 });
    byWorkplace.get(d.id)!.amount += row.amount;
  }
  const list = [...byWorkplace.values()].sort((a, b) => gridCollator.compare(a.name, b.name));
  return (
    <details className="joint-fee-detail"><summary>공동 귀속 {won(receiptTotals(joint).amount)} 포함</summary>
      <div className="grid-wrap"><table><thead><tr><th>사업장</th><th>공동 귀속 금액 (부가세 포함)</th><th>공동 귀속 담당자</th></tr></thead>
        <tbody>{list.map(w => (
          <tr key={w.id}><td>{w.name || '업체명 미입력'}</td><td>{won(w.amount)}</td>
            <td>{w.owners.filter((p: Row) => p.id !== owner).map((p: Row) => p.name).join(', ') || '—'}</td></tr>
        ))}{!list.length && <tr><td colSpan={3}>사업장 연결을 확인할 수 없습니다.</td></tr>}</tbody></table></div>
    </details>
  );
}
function TeamWorkplaceCounts({ owner }: { owner: string }) {
  const rows = attributedWorkplaces(owner);
  const active = rows.filter(r => r.category === '진행(자문)' || r.category === '진행(지원금)');
  const groups: [string, string, Row[]][] = [
    ['all', '담당 전체', rows], ['active', '진행 총계', active], ['advice', '진행(자문)', active.filter(r => r.category === '진행(자문)')],
    ['support', '진행(지원금)', active.filter(r => r.category === '진행(지원금)')], ['closed', '종료', rows.filter(r => r.category === '종료')],
  ];
  const selected = groups.find(([key]) => key === ui.feeWorkplaceView);
  return (
    <section className="card"><div className="toolbar"><h3>담당 사업장</h3><span className="sub">현재 수수료 귀속 기준</span></div>
      <div className="team-workplace-counts">{groups.map(([key, label, items]) => (
        <button key={key} type="button" className="btn sm" aria-pressed={key === ui.feeWorkplaceView}
          onClick={() => setUi({ feeWorkplaceView: ui.feeWorkplaceView === key ? '' : key })}>{label} <strong>{items.length}곳</strong></button>
      ))}</div>
      {selected && <ul className="dashboard-workplaces">
        {[...selected[2]].sort((a, b) => gridCollator.compare(a.name, b.name)).map(c => (
          <li key={c.id}>{canOpenPage('company')
            ? <button type="button" className="fee-detail-link" onClick={() => openFeeWorkplace(c.id)}>{c.name || '업체명 미입력'}</button>
            : (c.name || '업체명 미입력')}
          <span>{c.category || '미분류'}{c.closedOn ? ' · ' + c.closedOn : ''}</span></li>
        ))}
        {!selected[2].length && <li>해당 사업장이 없습니다.</li>}
      </ul>}
    </section>
  );
}
function ProductBreakdown({ products, total }: { products: Row[]; total: number }) {
  const [tooltip, setTooltip] = useState<string | null>(null);
  if (!products.length) return <p className="sub">선택한 월의 수수료 내역이 없습니다.</p>;
  const percentage = (amount: number) => (total > 0 ? (100 * amount / total).toFixed(1) + '%' : '—');
  const canChart = total > 0 && products.every(p => p.gross >= 0);
  if (ui.teamFeeView === 'chart' && canChart) {
    let position = 0;
    const slices: Row[] = products.map(p => { const start = position; position += p.gross * 100 / total; return { ...p, start, end: Math.min(position, 100) }; });
    return (
      <div className="team-fee-chart">
        <div className="fee-pie-wrap">
          <div className="fee-pie" aria-hidden="true" style={{ background: `conic-gradient(${slices.map(s => `${s.color} ${s.start}% ${s.end}%`).join(',')})` }}
            onPointerMove={e => {
              const box = e.currentTarget.getBoundingClientRect();
              const x = e.clientX - box.left - box.width / 2, y = e.clientY - box.top - box.height / 2;
              if (Math.hypot(x, y) > box.width / 2) { setTooltip(null); return; }
              const at = ((Math.atan2(x, -y) * 180 / Math.PI + 360) % 360) / 3.6;
              const slice = slices.find(s => at >= s.start && at < s.end);
              setTooltip(slice ? `${slice.name} · ${won(slice.gross)} · ${percentage(slice.gross)}` : null);
            }} onPointerLeave={() => setTooltip(null)} />
          <output className="fee-pie-tooltip" hidden={!tooltip}>{tooltip}</output>
        </div>
        <ul className="fee-pie-legend">{products.map(p => (
          <li key={p.name}><span className="fee-pie-color" style={{ '--slice-color': p.color } as React.CSSProperties} />
            <span>{p.name}</span><strong>{won(p.gross)}</strong><span>{percentage(p.gross)}</span></li>
        ))}</ul>
      </div>
    );
  }
  return (
    <>
      {ui.teamFeeView === 'chart' && <p className="sub">합계가 0 이하이거나 차감된 상품이 있어 표로 표시합니다.</p>}
      <Grid<Row> group="teamFees" wrapClass="grid-wrap dashboard-fee" resize={false} rows={products} rowKey={p => p.name}
        columns={[['product', '상품'], ['count', '건수'], ['gross', '부가세 포함'], ['net', '부가세 제외'], ['share', '비율']].map(([key, label]) => ({ key, label, width: key === 'product' ? 160 : 110 }))}
        cellText={(p, c) => c.key === 'product' ? p.name : c.key === 'count' ? String(p.count) : c.key === 'share' ? (canChart ? percentage(p.gross) : '—') : won(p[c.key])}
        renderCell={(p, c) => c.key === 'product' ? p.name : c.key === 'count' ? p.count : c.key === 'share' ? (canChart ? percentage(p.gross) : '—') : won(p[c.key])} />
    </>
  );
}

export function TeamFeesPage() {
  const current = store.current!;
  const all: Row[] = store.state!.teamFeeRows || [];
  const owners = teamFeeOwners(all);
  const selected = owners.has(ui.selectedFeeOwner) ? ui.selectedFeeOwner : current.id;
  const owned = attributedFees(selected);
  const rows = owned.filter(r => r.billingMonth === ui.teamFeeMonth);
  const previous = owned.filter(r => r.billingMonth === previousFeeMonth(ui.teamFeeMonth));
  const groups = new Map<string, Row>();
  for (const row of rows) {
    if (!groups.has(row.product)) groups.set(row.product, { name: row.product, gross: 0, net: 0, count: 0 });
    const g = groups.get(row.product)!;
    g.gross += row.amount; g.net += netOfVat(row.amount); g.count++;
  }
  const products: Row[] = [...groups.values()].sort((a, b) => gridCollator.compare(a.name, b.name)).map((item, i) => ({ ...item, color: productColors[i % productColors.length] }));
  const totals = receiptTotals(rows);
  const net = products.reduce((s, p) => s + p.net, 0);
  return (
    <>
      <div className="card">
        <div className="toolbar">
          <label>조회 월 <input type="month" className="input" value={ui.teamFeeMonth} onChange={e => { if (e.target.value) setUi({ teamFeeMonth: e.target.value }); }} /></label>
          {[...owners].map(([id, name]) => (
            <button key={id} type="button" className={`btn ${id === selected ? 'primary' : ''}`} aria-pressed={id === selected}
              onClick={() => setUi({ selectedFeeOwner: id, feeWorkplaceView: '' })}>{name}{id === current.id ? ' (나)' : ''}</button>
          ))}
        </div>
        <FeeTotalsTable totals={totals} net={net} owner={selected} />
        <p className="team-fee-change"><strong>전월 대비</strong> {feeMonthChange(totals.amount, previous)} <span className="sub">(부가세 포함)</span></p>
        {selected !== 'unassigned' && <TeamPerformance net={net} owner={selected} />}
        <JointFeeNote rows={rows} owner={selected} />
      </div>
      <TeamWorkplaceCounts owner={selected} />
      <div className="card">
        <div className="toolbar"><h3>상품별 수수료</h3>
          {[['chart', '그래프'], ['text', '텍스트']].map(([view, label]) => (
            <button key={view} type="button" className="fee-mode-link" aria-pressed={ui.teamFeeView === view} onClick={() => setUi({ teamFeeView: view })}>{label}</button>
          ))}
        </div>
        <ProductBreakdown products={products} total={totals.amount} />
      </div>
    </>
  );
}
