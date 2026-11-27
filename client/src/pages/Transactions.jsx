import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Pencil, Trash2, Paperclip, Printer, Download, ArrowDownUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { api, downloadFile } from '../api';
import { useAuth } from '../AuthContext';
import { CATEGORIES, inr, fmtDate, today, monthStart, weekStart } from '../utils';
import { PageHeader, Loading, ErrorBox, Empty, Confirm, BillViewer, PrintHeader, Spinner, useToast } from '../components/UI';

const PAGE = 25;
const money = (v, cls) => (v ? <span className={cls}>{inr(v)}</span> : <span className="text-slate-300">-</span>);

export default function Transactions() {
  const { user } = useAuth();
  const toast = useToast();
  const [q, setQ] = useState({ search: '', from: '', to: '', category: '', type: '', source: '', sort: 'desc' });
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [page, setPage] = useState(1);
  const [del, setDel] = useState(null);
  const [bill, setBill] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dl, setDl] = useState(false);

  const qs = useMemo(() => new URLSearchParams(Object.entries(q).filter(([, v]) => v)).toString(), [q]);
  const load = () => api.get(`/transactions?${qs}`).then((d) => { setData(d); setErr(''); }).catch((e) => setErr(e.message));
  useEffect(() => { const t = setTimeout(load, q.search ? 250 : 0); return () => clearTimeout(t); }, [qs]); // eslint-disable-line
  useEffect(() => setPage(1), [qs]);
  const set = (k) => (e) => setQ({ ...q, [k]: e.target.value });
  const preset = (from, to) => setQ({ ...q, from, to });

  async function remove() {
    setBusy(true);
    try { await api.del(`/transactions/${del._id}`); toast('Transaction deleted'); setDel(null); load(); }
    catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  }
  async function excel() {
    setDl(true);
    try { await downloadFile(`/export/excel?${new URLSearchParams({ from: q.from, to: q.to })}`, 'Expense-Report.xlsx'); } catch (e) { toast(e.message, 'err'); } finally { setDl(false); }
  }

  const rows = data?.rows || [];
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const view = rows.slice((page - 1) * PAGE, page * PAGE);
  const range = q.from || q.to ? `${q.from ? fmtDate(q.from) : 'start'} to ${q.to ? fmtDate(q.to) : 'today'}` : 'All dates';

  const Actions = ({ r }) => (
    <div className="flex items-center gap-1 print:hidden">
      {r.hasBill && <button onClick={() => setBill(r)} className="rounded p-1.5 text-slate-500 hover:bg-slate-100" title="View bill" aria-label="View bill"><Paperclip size={16} /></button>}
      <Link to={`/edit/${r._id}`} className="rounded p-1.5 text-slate-500 hover:bg-slate-100" title="Edit" aria-label="Edit"><Pencil size={16} /></Link>
      <button onClick={() => setDel(r)} className="rounded p-1.5 text-red-500 hover:bg-red-50" title="Delete" aria-label="Delete"><Trash2 size={16} /></button>
    </div>
  );
  const chip = (cls) => `rounded-full px-2 py-0.5 text-xs font-medium ${cls}`;
  const badge = (r) => r.type === 'received' ? chip('bg-emerald-50 text-emerald-700') : r.type === 'reimbursement' ? chip('bg-amber-50 text-amber-700') : chip('bg-slate-100 text-slate-600');

  return (
    <>
      <PageHeader title="All transactions" subtitle="Every payment received and every expense, with the balance after each one.">
        <button className="btn-ghost" onClick={() => window.print()}><Printer size={16} />Print</button>
        <button className="btn-primary" onClick={excel} disabled={dl}>{dl ? <Spinner /> : <Download size={16} />}Excel</button>
      </PageHeader>
      <PrintHeader company={user.companyName} title="Transaction report" range={range} />

      <div className="card mb-4 p-4 print:hidden">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="relative sm:col-span-2"><Search size={16} className="absolute left-3 top-3.5 text-slate-400" /><input className="input pl-9" placeholder="Search description, name, ID, notes or amount" value={q.search} onChange={set('search')} aria-label="Search" /></div>
          <input type="date" className="input" value={q.from} onChange={set('from')} aria-label="From date" />
          <input type="date" className="input" value={q.to} onChange={set('to')} aria-label="To date" />
          <select className="input" value={q.category} onChange={set('category')} aria-label="Category"><option value="">All categories</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
          <select className="input" value={q.type || q.source} aria-label="Type" onChange={(e) => { const v = e.target.value; setQ({ ...q, type: ['received', 'expense', 'reimbursement'].includes(v) ? v : '', source: ['company', 'personal'].includes(v) ? v : '' }); }}>
            <option value="">All types</option><option value="received">Money received</option><option value="expense">All expenses</option><option value="company">Paid from company</option><option value="personal">Paid from pocket</option><option value="reimbursement">Reimbursements</option>
          </select>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          {[['Today', today(), today()], ['This week', weekStart(), today()], ['This month', monthStart(), today()], ['All time', '', '']].map(([l, a, b]) => (
            <button key={l} className="rounded-full border border-slate-300 px-3 py-1 text-slate-600 hover:bg-slate-50" onClick={() => preset(a, b)}>{l}</button>
          ))}
          <button className="ml-auto inline-flex items-center gap-1 text-slate-600 hover:text-slate-900" onClick={() => setQ({ ...q, sort: q.sort === 'desc' ? 'asc' : 'desc' })}><ArrowDownUp size={15} />{q.sort === 'desc' ? 'Latest first' : 'Oldest first'}</button>
        </div>
      </div>

      <ErrorBox>{err}</ErrorBox>
      {!data ? <Loading /> : rows.length === 0 ? (
        <div className="card"><Empty title="No transactions found" hint="Try changing the search or date range, or add a new transaction."><Link to="/add-expense" className="btn-primary">Add expense</Link></Empty></div>
      ) : (<>
        {/* Desktop table */}
        <div className="card hidden overflow-x-auto md:block">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50"><tr>
              {['Date', 'Transaction ID', 'Description', 'Category', 'Paid to', 'Money received', 'Company expense', 'Personal expense', 'Remaining balance', 'Notes'].map((h, i) => <th key={h} className={`th ${i >= 5 && i <= 8 ? 'text-right' : ''}`}>{h}</th>)}<th className="th print:hidden" /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {view.map((r) => (
                <tr key={r._id} className="hover:bg-slate-50/60">
                  <td className="td whitespace-nowrap">{fmtDate(r.date)}</td>
                  <td className="td whitespace-nowrap text-xs text-slate-500">{r.txnId}</td>
                  <td className="td max-w-[220px] font-medium text-slate-800">
                    {r.description}
                  </td>
                  <td className="td"><span className={badge(r)}>{r.category}</span></td>
                  <td className="td">{r.party}</td>
                  <td className="td text-right">{money(r.received || r.reimbursed, r.type === 'reimbursement' ? 'font-medium text-amber-600' : 'font-medium text-emerald-600')}</td>
                  <td className="td text-right">{money(r.companyExpense, 'font-medium text-red-600')}</td>
                  <td className="td text-right">{money(r.personalExpense, 'font-medium text-orange-600')}</td>
                  <td className={`td text-right font-semibold ${r.balance < 0 ? 'text-red-600' : 'text-blue-700'}`}>{inr(r.balance)}</td>
                  <td className="td max-w-[200px] text-xs text-slate-500">{r.notes}</td>
                  <td className="td"><Actions r={r} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold"><tr>
              <td className="td" colSpan={5}>Totals for {rows.length} shown</td>
              <td className="td text-right text-emerald-600">{inr(data.totals.received)}</td><td className="td text-right text-red-600">{inr(data.totals.companyExpense)}</td><td className="td text-right text-orange-600">{inr(data.totals.personalExpense)}</td><td className="td" colSpan={3} />
            </tr></tfoot>
          </table>
        </div>

        {/* Mobile cards */}
        <ul className="space-y-3 md:hidden">
          {view.map((r) => (
            <li key={r._id} className="card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{r.description}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{fmtDate(r.date)} - {r.txnId}</p>
                </div>
                <Actions r={r} />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs"><span className={badge(r)}>{r.category}</span>{r.party && <span className="text-slate-500">{r.type === 'expense' ? 'Paid to' : 'From'} {r.party}</span>}</div>
              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-sm">
                {(r.received > 0 || r.reimbursed > 0) && <p><span className="block text-xs text-slate-500">{r.reimbursed ? 'Reimbursed' : 'Received'}</span><b className={r.reimbursed ? 'text-amber-600' : 'text-emerald-600'}>{inr(r.received || r.reimbursed)}</b></p>}
                {r.companyExpense > 0 && <p><span className="block text-xs text-slate-500">Company expense</span><b className="text-red-600">{inr(r.companyExpense)}</b></p>}
                {r.personalExpense > 0 && <p><span className="block text-xs text-slate-500">Personal expense</span><b className="text-orange-600">{inr(r.personalExpense)}</b></p>}
                <p><span className="block text-xs text-slate-500">Balance after</span><b className={r.balance < 0 ? 'text-red-600' : 'text-blue-700'}>{inr(r.balance)}</b></p>
              </div>
              {r.notes && <p className="mt-2 text-xs text-slate-500">{r.notes}</p>}
            </li>
          ))}
          <li className="card flex flex-wrap justify-between gap-2 p-4 text-sm font-semibold"><span className="text-emerald-600">In {inr(data.totals.received)}</span><span className="text-red-600">Company {inr(data.totals.companyExpense)}</span><span className="text-orange-600">Pocket {inr(data.totals.personalExpense)}</span></li>
        </ul>

        {pages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-3 text-sm print:hidden">
            <button className="btn-ghost px-3 py-1.5" disabled={page === 1} onClick={() => setPage(page - 1)} aria-label="Previous page"><ChevronLeft size={16} /></button>
            <span>Page {page} of {pages}</span>
            <button className="btn-ghost px-3 py-1.5" disabled={page === pages} onClick={() => setPage(page + 1)} aria-label="Next page"><ChevronRight size={16} /></button>
          </div>
        )}
      </>)}

      {del && <Confirm danger busy={busy} title="Delete this transaction?" confirmText="Delete" onCancel={() => setDel(null)} onConfirm={remove}
        message={`${del.txnId} - ${del.description} (${inr(del.amount)} on ${fmtDate(del.date)}) will be removed and saved in your owner backup for recovery. Balances will be recalculated.`} />}
      {bill && <BillViewer id={bill._id} name={bill.billName} onClose={() => setBill(null)} />}
    </>
  );
}
