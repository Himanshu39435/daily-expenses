import { useState } from 'react';
import { FileSpreadsheet, Download } from 'lucide-react';
import { downloadFile } from '../api';
import { today, monthStart, addDays, fmtDate } from '../utils';
import { PageHeader, ErrorBox, Spinner, useToast } from '../components/UI';

export default function ExcelDownload() {
  const toast = useToast();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function go(f, t) {
    if (f && t && f > t) return setErr('The start date must be before the end date.');
    setErr(''); setBusy(true);
    try { await downloadFile(`/export/excel?${new URLSearchParams({ from: f, to: t })}`, 'Expense-Report.xlsx'); toast('Excel file downloaded'); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  const sheets = [['Expense Summary', 'Opening balance, money received, company and personal expenses, balance and reimbursement.'], ['Daily Transactions', 'Every entry with running company balance and running personal expense.'], ['Category Report', 'Transactions and amount per category, using COUNTIF / SUMIF.'], ['Monthly Report', 'Money received, expenses and closing balance for each month.']];

  return (
    <>
      <PageHeader title="Excel download" subtitle="A formatted workbook with live formulas. Open it in Excel and everything calculates automatically." />
      <ErrorBox>{err}</ErrorBox>
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="card p-5 lg:col-span-3">
          <h2 className="font-semibold text-slate-900">Complete financial history</h2>
          <p className="mt-1 text-sm text-slate-500">Everything from the opening balance to today.</p>
          <button className="btn-green mt-4" disabled={busy} onClick={() => go('', '')}>{busy ? <Spinner /> : <Download size={17} />}Download complete history</button>

          <hr className="my-6 border-slate-200" />
          <h2 className="font-semibold text-slate-900">Selected dates</h2>
          <p className="mt-1 text-sm text-slate-500">The sheet starts with the balance brought forward from before the first date, so running balances stay correct.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div><label className="label" htmlFor="f">From</label><input id="f" type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div><label className="label" htmlFor="t">To</label><input id="t" type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            {[['This month', monthStart(), today()], ['Last 7 days', addDays(-6), today()], ['Last 30 days', addDays(-29), today()]].map(([l, a, b]) => (
              <button key={l} className="rounded-full border border-slate-300 px-3 py-1 text-slate-600 hover:bg-slate-50" onClick={() => { setFrom(a); setTo(b); }}>{l}</button>
            ))}
          </div>
          <button className="btn-primary mt-4" disabled={busy || (!from && !to)} onClick={() => go(from, to)}>{busy ? <Spinner /> : <Download size={17} />}Download {from || to ? `${from ? fmtDate(from) : 'start'} to ${to ? fmtDate(to) : 'today'}` : 'selected dates'}</button>
        </div>
        <div className="card p-5 lg:col-span-2">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900"><FileSpreadsheet size={18} className="text-emerald-600" />What's inside</h2>
          <ul className="mt-3 space-y-3 text-sm">{sheets.map(([n, t]) => <li key={n}><p className="font-medium text-slate-800">{n}</p><p className="text-slate-500">{t}</p></li>)}</ul>
        </div>
      </div>
    </>
  );
}
