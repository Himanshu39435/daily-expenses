import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Paperclip, AlertTriangle, Eye } from 'lucide-react';
import { api } from '../api';
import { CATEGORIES, MODES, today, inr } from '../utils';
import { PageHeader, ErrorBox, Spinner, Modal, BillViewer, useToast } from '../components/UI';

const SOURCES = [['company', 'Company money'], ['personal', 'Personal pocket'], ['split', 'Split']];

export default function TxnForm({ kind, initial, targetOwnerId }) {
  const nav = useNavigate();
  const toast = useToast();
  const isExp = kind === 'expense';
  const editing = !!initial;
  const blank = { date: today(), amount: '', party: isExp ? '' : 'Company', paymentMode: 'Cash', description: '', category: 'Transport', paymentSource: 'company', personalPaid: '', notes: '', reimb: false };
  const initialValues = initial ? {
    date: initial.date, amount: String(initial.amount), party: initial.party, paymentMode: initial.paymentMode || 'Cash',
    description: initial.description, category: isExp ? initial.category : 'Transport', paymentSource: initial.paymentSource || 'company',
    personalPaid: initial.personalExpense ? String(initial.personalExpense) : '', notes: initial.notes || '', reimb: initial.type === 'reimbursement',
  } : blank;
  const draftKey = `txn-draft:${editing ? 'edit' : 'new'}:${targetOwnerId || 'self'}:${editing ? initial._id : kind}`;
  const [f, setF] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(draftKey));
      if (saved?.values) return { ...initialValues, ...saved.values };
    } catch {}
    return initialValues;
  });
  const [file, setFile] = useState(null);
  const [removeBill, setRemoveBill] = useState(false);
  const [viewBill, setViewBill] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState([]);
  const [prompt, setPrompt] = useState(null);
  const [summary, setSummary] = useState(null);
  const [fileKey, setFileKey] = useState(0);
  const [draftSavedAt, setDraftSavedAt] = useState('');
  const [draftFound, setDraftFound] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(draftKey));
      if (saved?.values) {
        setDraftSavedAt(saved.savedAt || '');
        setDraftFound(true);
      }
    } catch {}
  }, [draftKey]);

  useEffect(() => {
    const meaningful = ['amount', 'party', 'description', 'notes', 'personalPaid'].some((key) => String(f[key] || '').trim()) ||
      f.category !== blank.category || f.paymentSource !== blank.paymentSource || f.paymentMode !== blank.paymentMode || f.reimb;
    if (!meaningful) return;
    const timer = setTimeout(() => {
      const savedAt = new Date().toISOString();
      try {
        localStorage.setItem(draftKey, JSON.stringify({ values: f, savedAt }));
        setDraftSavedAt(savedAt);
        setDraftFound(true);
      } catch {}
    }, 500);
    return () => clearTimeout(timer);
  }, [f, draftKey]);

  useEffect(() => {
    const saveImmediately = () => {
      const meaningful = ['amount', 'party', 'description', 'notes', 'personalPaid'].some((key) => String(f[key] || '').trim()) ||
        f.category !== blank.category || f.paymentSource !== blank.paymentSource || f.paymentMode !== blank.paymentMode || f.reimb;
      if (meaningful) {
        try { localStorage.setItem(draftKey, JSON.stringify({ values: f, savedAt: new Date().toISOString() })); } catch {}
      }
    };
    const saveOnVisibility = () => { if (document.visibilityState === 'hidden') saveImmediately(); };
    window.addEventListener('beforeunload', saveImmediately);
    document.addEventListener('visibilitychange', saveOnVisibility);
    return () => {
      window.removeEventListener('beforeunload', saveImmediately);
      document.removeEventListener('visibilitychange', saveOnVisibility);
    };
  }, [f, draftKey]);

  function discardDraft() {
    try { localStorage.removeItem(draftKey); } catch {}
    setDraftFound(false);
    setDraftSavedAt('');
    setF(initialValues);
  }

  const loadSummary = () => api.get(targetOwnerId ? `/admin/employees/${targetOwnerId}/transactions` : '/reports/summary')
    .then((data) => setSummary(targetOwnerId ? data.summary : data))
    .catch(() => {});
  useEffect(() => { loadSummary(); }, []);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const amt = Number(f.amount) || 0;

  const available = summary ? summary.companyBalance + (editing ? initial.companyExpense - initial.received : 0) : null;
  const afterBalance = summary && !isExp && !f.reimb ? summary.companyBalance - (editing ? initial.received : 0) + amt : null;
  const overBy = isExp && f.paymentSource === 'company' && available !== null && amt > available ? amt - Math.max(available, 0) : 0;

  async function submit(extra = {}) {
    setBusy(true); setErrs([]);
    const type = isExp ? 'expense' : f.reimb ? 'reimbursement' : 'received';
    const vals = { type, date: f.date, amount: f.amount, party: f.party, paymentMode: f.paymentMode, description: f.description, notes: f.notes,
      ...(isExp ? { category: f.category, paymentSource: f.paymentSource, personalPaid: f.personalPaid } : {}), ...extra };
    const fd = new FormData();
    Object.entries(vals).forEach(([k, v]) => fd.append(k, v));
    if (file) fd.append('bill', file);
    if (removeBill) fd.append('removeBill', 'true');
    try {
      const editEndpoint = targetOwnerId
        ? `/admin/employees/${targetOwnerId}/transactions/${initial._id}`
        : `/transactions/${initial._id}`;
      await (editing ? api.form('PUT', editEndpoint, fd) : api.form('POST', '/transactions', fd));
      setPrompt(null);
      try { localStorage.removeItem(draftKey); } catch {}
      setDraftFound(false);
      setDraftSavedAt('');
      toast(editing ? 'Changes saved' : isExp ? 'Expense saved' : f.reimb ? 'Reimbursement saved' : 'Money added');
      if (editing) return nav(targetOwnerId ? '/employees' : '/transactions');
      setF({ ...blank, date: f.date, category: f.category, paymentSource: f.paymentSource, paymentMode: f.paymentMode, party: isExp ? '' : f.party, reimb: f.reimb });
      setFile(null); setFileKey((k) => k + 1); loadSummary();
    } catch (e) {
      const code = e.data?.code;
      if (code === 'DUPLICATE') setPrompt({ code, ...e.data });
      else if (code === 'INSUFFICIENT_BALANCE') setPrompt({ code, ...e.data });
      else { setPrompt(null); setErrs(e.data?.errors || [e.message]); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    } finally { setBusy(false); }
  }
  const onSubmit = (e) => { e.preventDefault(); submit(); };

  const title = editing ? 'Edit transaction' : isExp ? 'Add expense' : 'Add money';
  return (
    <>
      <PageHeader title={title} subtitle={isExp ? 'Record what was spent and where the money came from.' : 'Record money received from the company. It is added to your available balance.'} />
      <form onSubmit={onSubmit} className="card mx-auto max-w-3xl p-5 sm:p-6">
        <ErrorBox>{errs.length > 1 ? <ul className="list-disc pl-4">{errs.map((x) => <li key={x}>{x}</li>)}</ul> : errs[0]}</ErrorBox>
        {draftFound && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
            <span>
              Draft saved{draftSavedAt ? ` at ${new Date(draftSavedAt).toLocaleString()}` : ''}. Details will be restored after closing or switching apps.
            </span>
            <button type="button" className="font-semibold text-blue-700 hover:underline" onClick={discardDraft}>Discard draft</button>
          </div>
        )}

        {!isExp && (
          <label className="mb-5 flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4" checked={f.reimb} onChange={(e) => setF({ ...f, reimb: e.target.checked, party: e.target.checked && f.party === '' ? 'Company' : f.party })} />
            <span><span className="font-medium text-slate-800">This is a reimbursement of my personal spending</span><br /><span className="text-slate-500">It reduces the pending reimbursement and does not add to the company balance.</span></span>
          </label>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label" htmlFor="date">{isExp ? 'Expense date' : 'Date'}</label><input id="date" type="date" className="input" required value={f.date} onChange={set('date')} /></div>
          <div><label className="label" htmlFor="amount">{isExp ? 'Amount (₹)' : 'Amount received (₹)'}</label><input id="amount" type="number" inputMode="decimal" min="0.01" step="0.01" className="input" required value={f.amount} onChange={set('amount')} placeholder="0.00" /></div>

          {isExp && (<>
            <div><label className="label" htmlFor="cat">Expense category</label><select id="cat" className="input" value={f.category} onChange={set('category')}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
            <div><label className="label" htmlFor="desc">Item / description</label><input id="desc" className="input" required maxLength={200} value={f.description} onChange={set('description')} placeholder="e.g. Cement bags" /></div>
          </>)}

          <div><label className="label" htmlFor="party">{isExp ? 'Paid to (person or shop)' : 'Received from'}</label><input id="party" className="input" required={!f.reimb} maxLength={100} value={f.party} onChange={set('party')} placeholder={isExp ? 'e.g. Ramesh Traders' : 'Company'} /></div>
          <div><label className="label" htmlFor="mode">Payment mode</label><select id="mode" className="input" value={f.paymentMode} onChange={set('paymentMode')}>{MODES.map((m) => <option key={m}>{m}</option>)}</select></div>
        </div>

        {isExp && (
          <fieldset className="mt-5">
            <legend className="label">Who paid for this?</legend>
            <div className="grid grid-cols-3 gap-2">
              {SOURCES.map(([v, l]) => (
                <button type="button" key={v} onClick={() => setF({ ...f, paymentSource: v })} aria-pressed={f.paymentSource === v}
                  className={`rounded-lg border px-2 py-2.5 text-sm font-medium transition ${f.paymentSource === v ? (v === 'company' ? 'border-blue-700 bg-blue-50 text-blue-800' : 'border-red-500 bg-red-50 text-red-700') : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}>{l}</button>
              ))}
            </div>
            {f.paymentSource === 'split' && (
              <div className="mt-3 max-w-xs"><label className="label" htmlFor="pp">Part paid from personal pocket (₹)</label><input id="pp" type="number" min="0.01" step="0.01" className="input" value={f.personalPaid} onChange={set('personalPaid')} />
                {amt > 0 && Number(f.personalPaid) > 0 && <p className="mt-1 text-xs text-slate-500">Company pays {inr(Math.max(amt - Number(f.personalPaid), 0))}</p>}</div>
            )}
            {f.paymentSource === 'personal' && <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-red-600"><AlertTriangle size={15} />This will be added to your pending reimbursement.</p>}
            {summary && <p className="mt-2 text-xs text-slate-500">Available company balance: <span className="font-semibold text-blue-700">{inr(available)}</span></p>}
            {overBy > 0 && <p className="mt-1 flex items-start gap-1.5 text-sm text-amber-700"><AlertTriangle size={15} className="mt-0.5 shrink-0" />This is {inr(overBy)} more than the company balance. You'll be asked how to record the extra amount.</p>}
          </fieldset>
        )}

        {!isExp && afterBalance !== null && amt > 0 && <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Company balance after saving: <span className="font-semibold">{inr(afterBalance)}</span></p>}

        <div className="mt-5 grid gap-4">
          {isExp && (
            <div>
              <label className="label" htmlFor="bill">Bill / receipt (JPG, PNG, WEBP or PDF, up to 5 MB)</label>
              <input key={fileKey} id="bill" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setFile(e.target.files[0] || null)}
                className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-slate-700 hover:file:bg-slate-200" />
              {editing && initial.hasBill && !removeBill && (
                <p className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-600"><Paperclip size={15} />{initial.billName || 'Bill attached'}
                  <button type="button" onClick={() => setViewBill(true)} className="inline-flex items-center gap-1 font-medium text-blue-700 hover:underline"><Eye size={15} />View</button>
                  <label className="flex items-center gap-1.5 text-red-600"><input type="checkbox" onChange={(e) => setRemoveBill(e.target.checked)} />Remove</label>
                  {file && <span className="text-xs text-slate-500">(will be replaced)</span>}</p>
              )}
            </div>
          )}
          {!isExp && <div><label className="label" htmlFor="desc2">Description</label><input id="desc2" className="input" maxLength={200} value={f.description} onChange={set('description')} placeholder="e.g. Advance for site work" /></div>}
          <div><label className="label" htmlFor="notes">Notes (optional)</label><textarea id="notes" rows={2} maxLength={500} className="input" value={f.notes} onChange={set('notes')} /></div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={() => nav(-1)}>Cancel</button>
          <button className={isExp ? 'btn-red' : 'btn-green'} disabled={busy}>{busy && <Spinner />}{editing ? 'Save changes' : isExp ? 'Save expense' : 'Save money'}</button>
        </div>
      </form>

      {viewBill && <BillViewer id={initial._id} name={initial.billName} endpoint={targetOwnerId ? `/admin/employees/${targetOwnerId}/transactions/${initial._id}/bill` : undefined} onClose={() => setViewBill(false)} />}

      {prompt?.code === 'DUPLICATE' && (
        <Modal title="Possible duplicate" onClose={() => setPrompt(null)}>
          <p className="text-sm text-slate-600">{prompt.message}</p>
          <div className="mt-5 flex justify-end gap-2"><button className="btn-ghost" onClick={() => setPrompt(null)}>Go back</button><button className="btn-primary" disabled={busy} onClick={() => submit({ force: 'true' })}>Save anyway</button></div>
        </Modal>
      )}

      {prompt?.code === 'INSUFFICIENT_BALANCE' && (
        <Modal title="Not enough company balance" onClose={() => setPrompt(null)}>
          <div className="space-y-1 rounded-lg bg-slate-50 p-3 text-sm">
            <p className="flex justify-between"><span>Company balance available</span><b className="text-blue-700">{inr(prompt.available)}</b></p>
            <p className="flex justify-between"><span>Expense amount</span><b className="text-red-600">{inr(prompt.amount)}</b></p>
            <p className="flex justify-between"><span>Extra beyond the balance</span><b>{inr(prompt.amount - prompt.available)}</b></p>
          </div>
          <p className="mb-3 mt-4 text-sm font-medium text-slate-800">How was this paid?</p>
          <div className="grid gap-2">
            {prompt.available > 0 && <button className="btn-ghost justify-start text-left" disabled={busy} onClick={() => submit({ paymentSource: 'split', personalPaid: (prompt.amount - prompt.available).toFixed(2) })}>
              Company paid {inr(prompt.available)}, I paid {inr(prompt.amount - prompt.available)} from my pocket</button>}
            <button className="btn-ghost justify-start text-left" disabled={busy} onClick={() => submit({ paymentSource: 'personal' })}>I paid the full {inr(prompt.amount)} from my pocket</button>
            <button className="btn-ghost justify-start text-left" disabled={busy} onClick={() => submit({ allowOverdraw: 'true' })}>It was company money (balance will go negative)</button>
          </div>
        </Modal>
      )}
    </>
  );
}
