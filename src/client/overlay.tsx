'use client';
// 팝업(대화상자, 선택 상자)과 알림 표시
import { ReactNode, useEffect, useRef, useState, useSyncExternalStore } from 'react';

type Overlay = { id: number; render: (close: () => void) => ReactNode };
let overlays: Overlay[] = [];
let counter = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

export function showOverlay(render: (close: () => void) => ReactNode) {
  const id = ++counter;
  const close = () => { overlays = overlays.filter(o => o.id !== id); emit(); };
  overlays = [...overlays, { id, render }];
  emit();
  return close;
}
export function closeAllOverlays() { overlays = []; emit(); }

export function OverlayHost() {
  const list = useSyncExternalStore(l => { listeners.add(l); return () => listeners.delete(l); }, () => overlays, () => overlays);
  return <>{list.map(o => <OverlaySlot key={o.id} overlay={o} />)}</>;
}
function OverlaySlot({ overlay }: { overlay: Overlay }) {
  const close = () => { overlays = overlays.filter(o => o.id !== overlay.id); emit(); };
  return <>{overlay.render(close)}</>;
}

// 기본 <dialog>를 모달로 엽니다. 닫히면 onClose(returnValue)를 부릅니다.
export function ModalDialog({ className = 'closure-dialog', labelledBy, onClose, children }: {
  className?: string; labelledBy?: string; onClose: (value: string) => void; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    const handle = () => {
      onClose(dialog.returnValue);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
    dialog.addEventListener('close', handle, { once: true });
    return () => dialog.removeEventListener('close', handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <dialog ref={ref} className={className} aria-labelledby={labelledBy}>{children}</dialog>;
}

type Action = [string, string, string?];
export function showActionDialog({ title, message = '', field = null, actions = [['save', '추가', 'primary']] }: {
  title: string; message?: string; field?: null | { label: string; options?: [string, string][] }; actions?: Action[];
}): Promise<null | { action: string; value: string }> {
  return new Promise(resolve => {
    showOverlay(close => <ActionDialog {...{ title, message, field, actions }} onDone={result => { close(); resolve(result); }} />);
  });
}
function ActionDialog({ title, message, field, actions, onDone }: {
  title: string; message: string; field: null | { label: string; options?: [string, string][] }; actions: Action[];
  onDone: (result: null | { action: string; value: string }) => void;
}) {
  const [answer, setAnswer] = useState(field?.options?.[0]?.[0] ?? '');
  const formRef = useRef<HTMLFormElement>(null);
  const answerRef = useRef(answer);
  answerRef.current = answer;
  return (
    <ModalDialog className="closure-dialog action-dialog" labelledBy="actionDialogTitle"
      onClose={value => onDone(actions.some(([key]) => key === value) ? { action: value, value: answerRef.current } : null)}>
      <form method="dialog" ref={formRef}>
        <h3 id="actionDialogTitle">{title}</h3>
        {message && <p className="sub">{message}</p>}
        {field && <label>{field.label}{' '}
          {field.options
            ? <select name="answer" required value={answer} onChange={e => setAnswer(e.target.value)}>
              {field.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            : <input name="answer" type="text" required maxLength={160} autoComplete="off" autoFocus value={answer}
              onChange={e => setAnswer(e.target.value)} />}
        </label>}
        <div className="toolbar">
          <button type="button" className="btn" onClick={() => formRef.current!.closest('dialog')!.close('cancel')}>취소</button>
          {actions.map(([value, label, style]) => <button key={value} className={`btn ${style || ''}`} value={value}>{label}</button>)}
        </div>
      </form>
    </ModalDialog>
  );
}
export async function askEntry(title: string, label: string) {
  const result = await showActionDialog({ title, field: { label } });
  return result?.value;
}
export async function askRemoval(title: string, message: string) {
  return Boolean(await showActionDialog({ title, message, actions: [['remove', '삭제', 'danger']] }));
}

// 알림
let toasts: { id: number; text: string }[] = [];
const toastListeners = new Set<() => void>();
export function pushToast(text: string) {
  const id = ++counter;
  toasts = [...toasts, { id, text }];
  toastListeners.forEach(l => l());
  setTimeout(() => { toasts = toasts.filter(t => t.id !== id); toastListeners.forEach(l => l()); }, 1800);
}
export function ToastHost() {
  const list = useSyncExternalStore(l => { toastListeners.add(l); return () => toastListeners.delete(l); }, () => toasts, () => toasts);
  return <>{list.map(t => <div key={t.id} className="toast" role="status">{t.text}</div>)}</>;
}
