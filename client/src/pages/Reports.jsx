import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Printer, Download } from 'lucide-react';
import { api, downloadFile } from '../api';
import { useAuth } from '../AuthContext';
import { inr, fmtDate, monthName, addDays, compact, today } from '../utils';
import { PageHeader, Loading, ErrorBox, Empty, PrintHeader, Spinner, useToast } from '../components/UI';
import { COLORS, PIE, axis } from './Dashboard';

const CFG = {
  daily: { title: 'Daily report', subtitle: 'Day-by-day and week-by-week spending.', from: () => addDays(-29) },
  monthly: { title: 'Monthly report', subtitle: 'Money received, expenses and closing balance for each month.', from: () => '' },
  category: { title: 'Category report', subtitle: 'Where the money went, by expense category.', from: () => '' },
};

export default function Reports({ mode }) {
  const cfg = CFG[mode];
  const { user } = useAuth();
  const toast = useToast();
  const [unit, setUnit] = useState('day');
  const [from, setFrom] = useState(cfg.from());
  const [to, setTo] = useState(mode === 'daily' ? today() : '');
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [dl, setDl] = useState(false);
  const groupBy = mode === 'daily' ? unit : mode === 'monthly' ? 'month' : 'category';

  useEffect(() => {
    setD(null);
    api.get(`/reports/report?${new URLSearchParams({ groupBy, from, to })}`).then((r) => { setD(r); setErr(''); }).catch((e) => setErr(e.message));
  }, [groupBy, from, to]);

  const label = (k) => (groupBy === 'day' ? fmtDate(k) : groupBy === 'week' ? `Week of ${fmtDate(k)}` : groupBy === 'month' ? monthName(k) : k);
  const chartRows = (d?.rows || []).map((r) => ({ ...r, label: groupBy === 'day' ? k2(r.key) : label(r.key) }));
  const range = from || to ? `${from ? fmtDate(from) : 'start'} to ${to ? fmtDate(to) : 'today'}` : 'All dates';
  async function excel() {
    setDl(true);
    try { await downloadFile(`/export/excel?${new URLSearchParams({ from, to })}`, 'Expense-Report.xlsx'); } catch (e) { toast(e.message, 'err'); } finally { setDl(false); }
  }

  return (
    <>
      <PageHeader title={cfg.title} subtitle={cfg.subtitle}>
        <button className="btn-ghost" onClick={() => window.print()}><Printer size={16} />Print</button>
        <button className="btn-primary" onClick={excel} disabled={dl}>{dl ? <Spinner /> : <Download size={16} />}Excel</button>
      </PageHeader>
      <PrintHeader company={user.companyName} title={cfg.title} range={range} />

      <div className="card mb-4 flex flex-wrap items-end gap-3 p-4 print:hidden">
        {mode === 'daily' && (
          <div className="inline-flex rounded-lg border border-slate-300 p-0.5 text-sm font-medium">
            {[['day', 'Daily'], ['week', 'Weekly']].map(([v, l]) => <button key={v} onClick={() => setUnit(v)} className={`rounded-md px-4 py-1.5 ${unit === v ? 'bg-blue-700 text-white' : 'text-slate-600'}`}>{l}</button>)}
          </div>
        )}
        <div><label className="label" htmlFor="f">From</label><input id="f" type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><label className="label" htmlFor="t">To</label><input id="t" type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <button className="btn-ghost" onClick={() => { setFrom(''); setTo(''); }}>All dates</button>
      </div>

      <ErrorBox>{err}</ErrorBox>
      {!d ? <Loading /> : d.rows.length === 0 ? (
        <div className="card"><Empty title="Nothing to report for this period" hint="Change the date range or record some transactions." /></div>
      ) : (<>
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[['Money received', d.totals.received, 'text-emerald-600'], ['Company expenses', d.totals.companyExpense, 'text-red-600'], ['Personal expenses', d.totals.personalExpense, 'text-orange-600'], ['Total expenses', d.totals.total, 'text-slate-900']].map(([l, v, c]) => (
            <div key={l} className="card p-3"><p className="text-xs text-slate-500">{l}</p><p className={`mt-0.5 text-lg font-semibold ${c}`}>{inr(v)}</p></div>
          ))}
        </div>

        <div className="card mb-4 p-4 print:break-inside-avoid">
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              {mode === 'category' ? (
                <PieChart><Pie data={d.rows.filter((r) => r.total > 0).map((r) => ({ name: r.key, value: r.total }))} dataKey="value" nameKey="name" innerRadius={60} outerRadius={105} paddingAngle={2}>{d.rows.map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}</Pie><Tooltip formatter={(v) => inr(v)} /><Legend iconType="circle" /></PieChart>
              ) : (
                <BarChart data={chartRows}><CartesianGrid vertical={false} stroke="#e2e8f0" /><XAxis dataKey="label" {...axis} /><YAxis {...axis} tickFormatter={compact} width={42} /><Tooltip formatter={(v) => inr(v)} /><Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  {mode === 'monthly' && <Bar dataKey="received" name="Money received" fill={COLORS.received} radius={[3, 3, 0, 0]} />}
                  <Bar dataKey="companyExpense" name="Company expense" fill={COLORS.company} radius={[3, 3, 0, 0]} /><Bar dataKey="personalExpense" name="Personal expense" fill={COLORS.personal} radius={[3, 3, 0, 0]} /></BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50"><tr>
              <th className="th">{mode === 'category' ? 'Category' : 'Period'}</th>{mode === 'category' && <th className="th text-right">Transactions</th>}
              <th className="th text-right">Money received</th><th className="th text-right">Company expense</th><th className="th text-right">Personal expense</th><th className="th text-right">Total expense</th>
              {mode !== 'category' && <th className="th text-right">Closing balance</th>}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {d.rows.map((r) => (
                <tr key={r.key}><td className="td font-medium">{label(r.key)}</td>{mode === 'category' && <td className="td text-right">{r.count}</td>}
                  <td className="td text-right text-emerald-600">{inr(r.received)}</td><td className="td text-right text-red-600">{inr(r.companyExpense)}</td><td className="td text-right text-orange-600">{inr(r.personalExpense)}</td><td className="td text-right font-semibold">{inr(r.total)}</td>
                  {mode !== 'category' && <td className={`td text-right font-semibold ${r.balance < 0 ? 'text-red-600' : 'text-blue-700'}`}>{inr(r.balance)}</td>}</tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold"><tr>
              <td className="td">Total</td>{mode === 'category' && <td className="td text-right">{d.totals.count}</td>}
              <td className="td text-right text-emerald-600">{inr(d.totals.received)}</td><td className="td text-right text-red-600">{inr(d.totals.companyExpense)}</td><td className="td text-right text-orange-600">{inr(d.totals.personalExpense)}</td><td className="td text-right">{inr(d.totals.total)}</td>{mode !== 'category' && <td className="td" />}
            </tr></tfoot>
          </table>
        </div>
      </>)}
    </>
  );
}
const k2 = (k) => `${k.slice(8)}/${k.slice(5, 7)}`;
