'use client';
// 화면 틀: 로그인/회원가입, 왼쪽 메뉴, 상단 제목줄, 페이지 전환
import { useEffect, useState } from 'react';
import { closePicker } from './cells';
import { openPagePermission, openTrackerAppearance } from './dialogs';
import { canManageUsers, canOpenPage, go, MENU, openTracker, setUi, trackerLabel, trackerMembers, ui, userLabel } from './lib';
import { closeAllOverlays, OverlayHost, pushToast, ToastHost } from './overlay';
import {
  adopt, api, clearHistory, loadColumnOrders, notify, pendingOrderWrites, poll, queued, setAuthHandler, setToastHandler, store, toast, useStore,
} from './store';
import { TrackerIcon } from './TrackerIcon';
import { CompanyPage } from './pages/Company';
import { DashboardPage, FeePage, TeamFeesPage } from './pages/Fees';
import { AdminPage, MemoPage, OvertimePage, SalesPage, SettingsPage } from './pages/Team';
import { NewPage, WorkPage } from './pages/Work';

function enterApp() {
  const u = store.current!;
  Object.assign(ui, { trackerOwner: '', personalFeesExpanded: false, feeOpenedFromTracker: false, feeAssignee: '', feeStatus: '', companyDetailId: '' });
  ui.page = u.admin || (u.permissions || []).includes('company') ? 'company' : (MENU.find(m => (u.permissions || []).includes(m.id))?.id || 'teamFees');
}

function showAuth() {
  store.current = null; store.state = null; store.baseline = null;
  closePicker();
  closeAllOverlays();
  clearHistory();
  notify();
}

function rememberedId() {
  try { return localStorage.getItem('ys_remember_id') || ''; } catch { return ''; }
}

function Login() {
  const [tab, setTab] = useState<'login' | 'signup'>('login');
  const [loginId, setLoginId] = useState('');
  const [loginPw, setLoginPw] = useState('');
  const [remember, setRemember] = useState(false);
  const [autoLogin, setAutoLogin] = useState(false);
  const [error, setError] = useState('');
  const [su, setSu] = useState({ name: '', username: '', password: '' });
  useEffect(() => {
    const id = rememberedId();
    if (id) { setLoginId(id); setRemember(true); }
  }, []);
  async function login() {
    setError('');
    try {
      const result = await api('login', { username: loginId, password: loginPw, remember: autoLogin });
      try { if (remember) localStorage.setItem('ys_remember_id', loginId); else localStorage.removeItem('ys_remember_id'); } catch { /* 무시 */ }
      setLoginPw('');
      adopt(result);
      await loadColumnOrders();
      enterApp();
      notify();
    } catch (e: any) { setError(e.message); }
  }
  async function signup() {
    try {
      await api('signup', su);
      setSu(s => ({ ...s, password: '' }));
      toast('가입 신청이 완료되었습니다. 승인 후 로그인해주세요.');
      setTab('login');
    } catch (e: any) { toast(e.message); }
  }
  return (
    <div id="auth" className="login-wrap">
      <section className="login-hero">
        <div className="hero-mark">YS</div>
        <h2>한숨, 그리고 시작</h2>
        <p>사업장 정보, 월간 업무와 수수료를 한곳에서 관리합니다.</p>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <div className="login-logo-line"><div className="login-logo" aria-hidden="true">YS</div><div><h1>윤솔 인트라넷</h1></div></div>
          <div className="tabs">
            <button id="loginTab" className={`tab ${tab === 'login' ? 'active' : ''}`} onClick={() => setTab('login')}>로그인</button>
            <button id="signupTab" className={`tab ${tab === 'signup' ? 'active' : ''}`} onClick={() => setTab('signup')}>회원가입</button>
          </div>
          {tab === 'login' ? (
            <div id="loginForm">
              <div className="field"><label htmlFor="loginId">아이디</label><input id="loginId" autoComplete="username" placeholder="아이디를 입력하세요"
                value={loginId} onChange={e => { setLoginId(e.target.value); setError(''); }} onKeyDown={e => { if (e.key === 'Enter') login(); }} /></div>
              <div className="field"><label htmlFor="loginPw">비밀번호</label><input id="loginPw" type="password" autoComplete="current-password" placeholder="비밀번호를 입력하세요"
                value={loginPw} onChange={e => { setLoginPw(e.target.value); setError(''); }} onKeyDown={e => { if (e.key === 'Enter') login(); }} /></div>
              <div id="loginError" className={`login-error ${error ? 'show' : ''}`} role="alert">{error}</div>
              <div className="login-options">
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <label className="checkline"><input id="rememberId" type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} /> 아이디 저장</label>
                  <label className="checkline"><input id="autoLogin" type="checkbox" checked={autoLogin} onChange={e => setAutoLogin(e.target.checked)} /> 자동 로그인</label>
                </div>
                <button className="login-link" type="button" onClick={() => toast('비밀번호 초기화는 관리자에게 요청해주세요.')}>비밀번호 찾기</button>
              </div>
              <button className="btn primary login-primary" onClick={login}>로그인</button>
              <div className="login-foot">보안을 위해 공용 PC에서는 자동 로그인을 사용하지 마세요.<br />계정 문의는 사내 관리자에게 연락해주세요.</div>
            </div>
          ) : (
            <div id="signupForm">
              <div className="field"><label htmlFor="suName">이름</label><input id="suName" value={su.name} onChange={e => setSu({ ...su, name: e.target.value })} /></div>
              <div className="field"><label htmlFor="suId">아이디</label><input id="suId" value={su.username} onChange={e => setSu({ ...su, username: e.target.value })} /></div>
              <div className="field"><label htmlFor="suPw">비밀번호</label><input id="suPw" type="password" value={su.password} placeholder="8자 이상"
                onChange={e => setSu({ ...su, password: e.target.value })} /></div>
              <button className="btn primary login-primary" onClick={signup}>가입 신청</button>
              <div className="notice">관리자 승인 후 로그인할 수 있습니다.</div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Nav() {
  let group = '';
  const items: React.ReactNode[] = [];
  for (const menu of MENU) {
    if (!canOpenPage(menu.id)) continue;
    if (group !== menu.group) { group = menu.group; items.push(<div key={'g' + group} className="nav-title">{group}</div>); }
    items.push(
      <button key={menu.id} className={`nav-btn ${ui.page === menu.id && !ui.trackerOwner ? 'active' : ''}`}
        aria-expanded={menu.id === 'work' ? ui.page === 'work' : undefined} onClick={() => go(menu.id)}>
        <span className="nav-icon">{menu.icon || '•'}</span><span>{menu.name}</span>
      </button>,
    );
    if (menu.id === 'work' && ui.page === 'work') {
      items.push(<div key="trackers" className="tracker-nav">{trackerMembers().map(member => (
        <button key={member.id} className={`nav-btn ${ui.trackerOwner === member.id ? 'active' : ''}`} onClick={() => openTracker(member.id)}>
          <span className="tracker-nav-icon" aria-hidden="true"><TrackerIcon member={member} /></span><span>{trackerLabel(member)}</span>
        </button>
      ))}</div>);
    }
  }
  return <div id="nav">{items}</div>;
}

const PAGES: Record<string, () => React.ReactNode> = {
  company: CompanyPage, work: WorkPage, fee: FeePage, teamFees: TeamFeesPage, new: NewPage, dashboard: DashboardPage,
  sales: SalesPage, overtime: OvertimePage, admin: AdminPage, memo: MemoPage, settings: SettingsPage,
};

function Shell() {
  const current = store.current!;
  if (!canOpenPage(ui.page) && !(ui.page === 'fee' && ui.feeOpenedFromTracker)) {
    ui.page = MENU.find(m => (current.permissions || []).includes(m.id))?.id || 'teamFees';
  }
  const m = MENU.find(x => x.id === ui.page);
  const owner = ui.page === 'work' ? trackerMembers().find(member => member.id === ui.trackerOwner) : undefined;
  if (ui.trackerOwner && !owner) ui.trackerOwner = '';
  const Page = PAGES[ui.page] || CompanyPage;
  async function logout() {
    await queued;
    await pendingOrderWrites();
    try { await api('logout', {}); showAuth(); }
    catch (e: any) { toast(e.message); }
  }
  return (
    <div id="app" className="app">
      <aside className="sidebar">
        <div className="brand">{store.state!.settings?.officeName || '윤솔 인트라넷'}<small>노무사 사무실 업무관리</small></div>
        <Nav />
      </aside>
      <main className="main">
        <div className="topbar">
          <div>
            <div id="pageTitle" className="page-title">
              {m && <><span className="page-title-icon" aria-hidden="true">{owner ? <TrackerIcon member={owner} /> : m.icon || '•'}</span>
                <span>{owner ? trackerLabel(owner) : m.name}</span></>}
              {owner?.id === current.id && <button type="button" className="tracker-appearance-btn" title="이름·아이콘 변경" aria-label="이름·아이콘 변경"
                onClick={openTrackerAppearance}><span aria-hidden="true">✎</span></button>}
            </div>
            <div id="pageSub" className="sub">
              {canManageUsers() && m && <button className="page-perm-btn" data-overtime-permission={m.id === 'overtime' ? '' : undefined}
                onClick={() => openPagePermission(m.id)}>{m.id === 'overtime' ? '👥 접근 권한' : '👥 이 페이지 접속 회원 설정'}</button>}
            </div>
          </div>
          <div className="userbox">
            <span id="userName">{userLabel(current)}</span><span id="roleBadge" className="badge">{current.admin ? '마스터' : '직원'}</span>
            <button className="btn sm" onClick={logout}>로그아웃</button>
          </div>
        </div>
        <div id="content"><Page key={ui.page + ':' + ui.trackerOwner} /></div>
      </main>
    </div>
  );
}

// Tab 키로 같은 행의 다음 입력칸으로 이동 (기존 화면과 동일)
function useCellTabNavigation() {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const picker = document.getElementById('ysPicker');
      const anchor = document.querySelector('[aria-expanded="true"].ys-tags, [aria-expanded="true"].ys-month') as HTMLElement | null;
      const from = (picker?.contains(event.target as Node) && anchor) ? anchor : event.target as HTMLElement;
      const td = from.closest?.('td');
      if (!td) return;
      const direction = event.shiftKey ? 'previousElementSibling' : 'nextElementSibling';
      for (let next = td[direction] as HTMLElement | null; next; next = next[direction] as HTMLElement | null) {
        const target = next.querySelector('input,select,textarea,button,[tabindex]') as HTMLElement | null;
        if (!target || (target as HTMLButtonElement).disabled) continue;
        event.preventDefault(); closePicker(); target.focus(); return;
      }
      closePicker();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);
}

export function App() {
  useStore();
  const [ready, setReady] = useState(false);
  useCellTabNavigation();
  useEffect(() => {
    setToastHandler(pushToast);
    setAuthHandler(showAuth);
    (async () => {
      try { adopt(await api('state')); await loadColumnOrders(); enterApp(); }
      catch { /* 로그인 화면 */ }
      setReady(true);
      notify();
    })();
    const timer = setInterval(poll, 2000);
    return () => clearInterval(timer);
  }, []);

  return (
    <>
      {ready && (store.current && store.state ? <Shell /> : <Login />)}
      <OverlayHost />
      <ToastHost />
    </>
  );
}
