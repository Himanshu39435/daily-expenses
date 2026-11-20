import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Wallet, HandCoins, Receipt, Landmark, UserRound, Undo2, CalendarDays, AlertTriangle, Plus } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { inr, fmtDate, compact } from '../utils';
import { Loading, ErrorBox, PageHeader, Stat, Empty } from '../components/UI';

export const COLORS = { received: '#059669', company: '#dc2626', personal: '#f97316', balance: '#1d4ed8' };
export const PIE = ['#1d4ed8', '#dc2626', '#059669', '#f59e0b', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#64748b'];
const tip = { formatter: (v) => inr(v), contentStyle: { borderRadius: 8, fontSize: 12 } };

export function ChartCard({ title, children, empty }) {
  return (
    <div className="card p-4 print:break-inside-avoid">
      <h3 className="mb-3 text-sm font-semibold text-slate-800">{title}</h3>
      {empty ? <p className="grid h-[240px] place-items-center text-sm text-slate-400">No data to chart yet</p> : <div className="h-[240px]"><ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer></div>}
    </div>
  );
}
export const axis = { tick: { fontSize: 11, fill: '#64748b' }, tickLine: false, axisLine: false };

export default function Dashboard() {
  const { user } = useAuth();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { api.get('/reports/dashboard').then(setD).catch((e) => setErr(e.message)); }, []);
  if (err) return <ErrorBox>{err}</ErrorBox>;
  if (!d) return <Loading />;
  const { summary: s, charts: c, recent } = d;
  const hasDaily = c.daily.some((x) => x.total > 0), hasMonthly = c.monthly.some((x) => x.total > 0 || x.received > 0);
  const personalUsed = s.personalExpenses > 0;

  return (
    <>
      <PageHeader title="Dashboard" subtitle={`${user.companyName} - all figures update automatically`}>
        <Link to="/add-money" className="btn-green"><HandCoins size={17} />Add money</Link>
        <Link to="/add-expense" className="btn-red"><Plus size={17} />Add expense</Link>
      </PageHeader>

      {(personalUsed || s.overdrawn) && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800" role="alert">
          <AlertTriangle size={20} className="mt-0.5 shrink-0" />
          <div>
            {s.overdrawn && <p className="font-semibold">Company balance is overdrawn by {inr(-s.companyBalance)}. Add money received or mark some expenses as paid from your pocket.</p>}
            {personalUsed && <p><span className="font-semibold">{inr(s.personalExpenses)} of your own pocket money was used.</span> {s.pendingReimbursement > 0 ? `${inr(s.pendingReimbursement)} is still waiting to be reimbursed.` : 'It has been fully reimbursed.'}</p>}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card flex flex-col justify-between border-blue-200 bg-blue-700 p-5 text-white sm:col-span-2">
          <div className="flex items-center justify-between"><p className="text-sm font-medium text-blue-100">Remaining company balance</p><Landmark size={20} className="text-blue-200" /></div>
          <p className="mt-2 text-4xl font-semibold">{inr(s.companyBalance)}</p>
          <p className="mt-3 border-t border-white/20 pt-3 text-sm text-blue-100">{inr(s.totalCompanyMoney)} company money <span className="mx-1">-</span> {inr(s.companyExpenses)} paid from company</p>
        </div>
        <Stat label="Opening balance" value={s.openingBalance} icon={Wallet} tone="slate" />
        <Stat label="Money received from company" value={s.totalReceived} icon={HandCoins} tone="green" sub="Added after the opening balance" />
        <Stat label="Total expenses" value={s.totalExpenses} icon={Receipt} tone="red" sub={`Company ${inr(s.companyExpenses)} + Personal ${inr(s.personalExpenses)}`} />
        <Stat label="Personal pocket money used" value={s.personalExpenses} icon={UserRound} tone={personalUsed ? 'red' : 'slate'} alert={personalUsed} />
        <Stat label="Pending reimbursement" value={s.pendingReimbursement} icon={Undo2} tone={s.pendingReimbursement > 0 ? 'amber' : 'slate'} sub={s.reimbursed > 0 ? `${inr(s.reimbursed)} already reimbursed` : undefined} />
        <Stat label="This month's expenses" value={s.currentMonthExpenses} icon={CalendarDays} tone="violet" />
      </div>

      <div className="card mt-5 overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">Balance summary</div>
        <dl className="divide-y divide-slate-100 text-sm">
          {[
            ['Company money (opening + received)', inr(s.totalCompanyMoney), 'text-slate-900'],
            ['Total expenses', inr(s.totalExpenses), 'text-red-600'],
            ['Company balance', inr(Math.max(s.companyBalance, 0)), 'text-blue-700'],
            ['Personal money used', inr(s.personalExpenses), personalUsed ? 'text-red-600 font-semibold' : 'text-slate-900'],
            ['Amount to be reimbursed', inr(s.pendingReimbursement), s.pendingReimbursement > 0 ? 'text-amber-600 font-semibold' : 'text-slate-900'],
          ].map(([k, v, cls]) => (<div key={k} className="flex justify-between px-4 py-2.5"><dt className="text-slate-600">{k}</dt><dd className={`font-medium ${cls}`}>{v}</dd></div>))}
        </dl>
      </div>

      {s.count === 0 && (
        <div className="card mt-5"><Empty title="No transactions yet" hint="Start by recording the money the company gave you, then add your daily expenses."><Link to="/add-money" className="btn-primary">Add money received</Link></Empty></div>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <ChartCard title="Daily expenses (last 30 days)" empty={!hasDaily}>
          <BarChart data={c.daily}><CartesianGrid vertical={false} stroke="#e2e8f0" /><XAxis dataKey="label" {...axis} interval={4} /><YAxis {...axis} tickFormatter={compact} width={40} /><Tooltip {...tip} /><Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="company" name="Company paid" stackId="a" fill={COLORS.company} /><Bar dataKey="personal" name="Personal paid" stackId="a" fill={COLORS.personal} radius={[3, 3, 0, 0]} /></BarChart>
        </ChartCard>
        <ChartCard title="Monthly expenses (last 12 months)" empty={!hasMonthly}>
          <BarChart data={c.monthly}><CartesianGrid vertical={false} stroke="#e2e8f0" /><XAxis dataKey="label" {...axis} /><YAxis {...axis} tickFormatter={compact} width={40} /><Tooltip {...tip} /><Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="company" name="Company paid" stackId="a" fill={COLORS.company} /><Bar dataKey="personal" name="Personal paid" stackId="a" fill={COLORS.personal} radius={[3, 3, 0, 0]} /></BarChart>
        </ChartCard>
        <ChartCard title="Category-wise expenses" empty={!c.category.length}>
          <PieChart><Pie data={c.category} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>{c.category.map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}</Pie><Tooltip {...tip} /><Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} /></PieChart>
        </ChartCard>
        <ChartCard title="Company money vs expenses" empty={!hasMonthly}>
          <ComposedChart data={c.monthly}><CartesianGrid vertical={false} stroke="#e2e8f0" /><XAxis dataKey="label" {...axis} /><YAxis {...axis} tickFormatter={compact} width={40} /><Tooltip {...tip} /><Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="received" name="Money received" fill={COLORS.received} radius={[3, 3, 0, 0]} /><Bar dataKey="total" name="Expenses" fill={COLORS.company} radius={[3, 3, 0, 0]} /><Line dataKey="balance" name="Company balance" stroke={COLORS.balance} strokeWidth={2} dot={false} /></ComposedChart>
        </ChartCard>
        <div className="lg:col-span-2">
          <ChartCard title="Personal pocket money used (by month)" empty={!c.monthly.some((m) => m.personal > 0)}>
            <BarChart data={c.monthly}><CartesianGrid vertical={false} stroke="#e2e8f0" /><XAxis dataKey="label" {...axis} /><YAxis {...axis} tickFormatter={compact} width={40} /><Tooltip {...tip} /><Bar dataKey="personal" name="Personal pocket" fill={COLORS.personal} radius={[3, 3, 0, 0]} /></BarChart>
          </ChartCard>
        </div>
      </div>

      <div className="card mt-5 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><h3 className="text-sm font-semibold text-slate-800">Recent transactions</h3><Link to="/transactions" className="text-sm font-medium text-blue-700 hover:underline">View all</Link></div>
        {recent.length === 0 ? <p className="px-4 py-8 text-center text-sm text-slate-400">Nothing recorded yet</p> : (
          <ul className="divide-y divide-slate-100">
            {recent.map((r) => (
              <li key={r._id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0"><p className="truncate text-sm font-medium text-slate-800">{r.description}</p><p className="text-xs text-slate-500">{fmtDate(r.date)} - {r.category}{r.party ? ` - ${r.party}` : ''}</p></div>
                <div className="shrink-0 text-right text-sm font-semibold">
                  {r.received > 0 && <span className="text-emerald-600">+{inr(r.received)}</span>}
                  {r.reimbursed > 0 && <span className="text-amber-600">+{inr(r.reimbursed)} reimbursed</span>}
                  {r.type === 'expense' && <span className="text-red-600">-{inr(r.amount)}</span>}
                  {r.personalExpense > 0 && <p className="text-[11px] font-medium text-orange-600">{inr(r.personalExpense)} from pocket</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
