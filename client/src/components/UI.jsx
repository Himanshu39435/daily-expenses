import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { X, Loader2, CheckCircle2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { api } from '../api';
import { inr } from '../utils';

/* ---------- Toasts ---------- */
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const [list, setList] = useState([]);
  const push = useCallback((msg, tone = 'ok') => {
    const id = Math.random();
    setList((l) => [...l, { id, msg, tone }]);
    setTimeout(() => setList((l) => l.filter((x) => x.id !== id)), 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-3 top-3 z-[100] flex flex-col items-end gap-2 print:hidden" role="status" aria-live="polite">
        {list.map((t) => (
          <div key={t.id} className={`pointer-events-auto flex max-w-sm items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ${t.tone === 'err' ? 'bg-red-600' : 'bg-emerald-600'}`}>
            {t.tone === 'err' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />} {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- Layout bits ---------- */
export const Spinner = ({ className = '' }) => <Loader2 className={`animate-spin ${className}`} size={20} />;
export const Loading = () => <div className="flex justify-center py-20 text-blue-700"><Spinner /></div>;

export function PasswordInput({ className = '', label = 'password', ...props }) {
  const [visible, setVisible] = useState(false);
  const action = visible ? 'Hide' : 'Show';

  return (
    <div className="relative">
      <input
        {...props}
        type={visible ? 'text' : 'password'}
        className={`input pr-11 ${className}`}
      />
      <button
        type="button"
        className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
        onClick={() => setVisible((current) => !current)}
        aria-label={`${action} ${label}`}
        title={`${action} ${label}`}
      >
        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap gap-2 print:hidden">{children}</div>
    </div>
  );
}

export const ErrorBox = ({ children }) => children ? (
  <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert"><AlertCircle size={18} className="mt-0.5 shrink-0" /><div>{children}</div></div>
) : null;

export const Empty = ({ title, hint, children }) => (
  <div className="px-6 py-14 text-center">
    <p className="font-medium text-slate-700">{title}</p>
    {hint && <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">{hint}</p>}
    {children && <div className="mt-4">{children}</div>}
  </div>
);

/* ---------- Stat card ---------- */
const ICON = { green: 'bg-emerald-50 text-emerald-600', red: 'bg-red-50 text-red-600', blue: 'bg-blue-50 text-blue-700', amber: 'bg-amber-50 text-amber-600', slate: 'bg-slate-100 text-slate-600', violet: 'bg-violet-50 text-violet-600' };
const VALUE = { green: 'text-emerald-700', red: 'text-red-600', blue: 'text-blue-700', amber: 'text-amber-600', slate: 'text-slate-900', violet: 'text-violet-700' };
export function Stat({ label, value, sub, tone = 'slate', icon: Icon, alert }) {
  return (
    <div className={`card p-4 ${alert ? 'border-red-300 bg-red-50/70' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        {Icon && <span className={`rounded-lg p-2 ${ICON[tone]}`}><Icon size={17} /></span>}
      </div>
      <p className={`mt-1.5 text-2xl font-semibold ${VALUE[tone]}`}>{inr(value)}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

/* ---------- Modal / confirm ---------- */
export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4 print:hidden" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`max-h-[92vh] w-full overflow-auto rounded-t-2xl bg-white shadow-xl sm:rounded-2xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-md'}`}>
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4">
          <h2 className="font-semibold text-slate-900">{title}</h2>
          {onClose && <button onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Close"><X size={18} /></button>}
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Confirm({ title, message, confirmText = 'Confirm', danger, busy, onConfirm, onCancel }) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="text-sm text-slate-600">{message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onCancel}>Cancel</button>
        <button className={danger ? 'btn-red' : 'btn-primary'} onClick={onConfirm} disabled={busy}>{busy && <Spinner />}{confirmText}</button>
      </div>
    </Modal>
  );
}

/* ---------- Bill viewer (fetches with the auth token) ---------- */
export function BillViewer({ id, name, onClose, endpoint }) {
  const [url, setUrl] = useState(null);
  const [type, setType] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => {
    let u;
    const billEndpoint = endpoint || `/transactions/${id}/bill`;
    api.blob(billEndpoint).then((b) => { u = URL.createObjectURL(b); setType(b.type); setUrl(u); }).catch((e) => setErr(e.message));
    return () => u && URL.revokeObjectURL(u);
  }, [id, endpoint]);
  return (
    <Modal title={name || 'Bill / receipt'} onClose={onClose} wide>
      {err ? <ErrorBox>{err}</ErrorBox> : !url ? <Loading /> : type.startsWith('image/')
        ? <img src={url} alt="Bill" className="mx-auto max-h-[70vh] rounded-lg" />
        : <iframe src={url} title="Bill" className="h-[70vh] w-full rounded-lg border" />}
      {url && <a href={url} download={name || 'bill'} className="btn-ghost mt-4">Download bill</a>}
    </Modal>
  );
}

/* Print-only report heading */
export const PrintHeader = ({ company, title, range }) => (
  <div className="mb-4 hidden border-b border-slate-300 pb-3 print:block">
    <p className="text-lg font-semibold">{company}</p>
    <p className="text-sm">{title}{range ? ` - ${range}` : ''}</p>
    <p className="text-xs text-slate-500">Printed on {new Date().toLocaleDateString('en-GB').replaceAll('/', '-')}</p>
  </div>
);
