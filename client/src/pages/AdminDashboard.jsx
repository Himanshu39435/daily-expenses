import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, HandCoins, Receipt, Users, Undo2, Wallet } from 'lucide-react';
import { api } from '../api';
import { inr, fmtDate } from '../utils';
import { useAuth } from '../AuthContext';
import { ErrorBox, Loading, PageHeader, Stat } from '../components/UI';

const AUDIT_LABELS = {
  date: 'Expense date', amount: 'Amount', party: 'Paid to / Received from', paymentMode: 'Payment mode',
  description: 'Item / Description', category: 'Category', notes: 'Notes', paymentSource: 'Payment source',
  companyPaid: 'Company amount', personalPaid: 'Personal amount', bill: 'Bill / Receipt',
};
const auditValue = (field, value) => {
  if (value === undefined || value === null || value === '') return '(empty)';
  if (['amount', 'companyPaid', 'personalPaid'].includes(field)) return inr(Number(value));
  return String(value);
};

export default function AdminDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { api.get('/admin/dashboard').then(setData).catch((e) => setErr(e.message)); }, []);

  if (err) return <ErrorBox>{err}</ErrorBox>;
  if (!data) return <Loading />;
  const { summary, employees, recent } = data;

  return (
    <>
      <PageHeader title="Admin Dashboard" subtitle="Company-wide expense and employee overview">
        <Link to="/employees" className="btn-primary"><Users size={17} />Manage employees</Link>
      </PageHeader>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-4"><div className="flex items-start justify-between"><p className="text-sm font-medium text-slate-500">Employees</p><span className="rounded-lg bg-blue-50 p-2 text-blue-700"><Users size={17} /></span></div><p className="mt-1.5 text-2xl font-semibold text-slate-900">{data.employeeCount}</p></div>
        <Stat label="Company balance" value={summary.companyBalance} icon={Wallet} tone="green" />
        <Stat label="Total company money" value={summary.totalCompanyMoney} icon={HandCoins} tone="slate" />
        <Stat label="Total expenses" value={summary.totalExpenses} icon={Receipt} tone="red" />
        <Stat label="Personal expenses" value={summary.personalExpenses} icon={Building2} tone={summary.personalExpenses ? 'amber' : 'slate'} />
        <Stat label="Pending reimbursements" value={summary.pendingReimbursement} icon={Undo2} tone={summary.pendingReimbursement ? 'amber' : 'slate'} />
        <Stat label="This month's expenses" value={summary.currentMonthExpenses} icon={Receipt} tone="violet" />
        <div className="card p-4"><div className="flex items-start justify-between"><p className="text-sm font-medium text-slate-500">Transactions</p><span className="rounded-lg bg-slate-100 p-2 text-slate-600"><HandCoins size={17} /></span></div><p className="mt-1.5 text-2xl font-semibold text-slate-900">{summary.count}</p></div>
      </div>

      <section className="card mt-5 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">Employee spending</h2>
          <Link to="/employees" className="text-sm font-medium text-blue-700 hover:underline">Manage team</Link>
        </div>
        {employees.length === 0 ? <p className="px-4 py-8 text-center text-sm text-slate-500">No employees yet. Invite your team to start tracking expenses.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr><th className="px-4 py-3">Employee</th><th className="px-4 py-3 text-right">Transactions</th><th className="px-4 py-3 text-right">Expenses</th><th className="px-4 py-3 text-right">Company balance</th><th className="px-4 py-3 text-right">Reimbursement due</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employees.map((employee) => (
                  <tr key={employee.id}>
                    <td className="px-4 py-3"><p className="font-medium text-slate-800">{employee.name}</p><p className="text-xs text-slate-500">{employee.email}</p></td>
                    <td className="px-4 py-3 text-right">{employee.summary.count}</td>
                    <td className="px-4 py-3 text-right font-medium">{inr(employee.summary.totalExpenses)}</td>
                    <td className="px-4 py-3 text-right">{inr(employee.summary.companyBalance)}</td>
                    <td className="px-4 py-3 text-right">{inr(employee.summary.pendingReimbursement)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card mt-5 overflow-hidden">
        <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">Recent team transactions</h2>
        {recent.length === 0 ? <p className="px-4 py-8 text-center text-sm text-slate-500">No transactions recorded yet</p> : (
          <ul className="divide-y divide-slate-100">
            {recent.map((row) => (
              <li key={`${row._id}-${row.userName}`} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{row.description}</p>
                  <p className="text-xs text-slate-500">{row.userName} · {fmtDate(row.date)} · {row.category}</p>
                  {user?.isPrimaryAdmin && row.lastEditedAt && (
                    <details className="mt-2 max-w-lg rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5">
                      <summary className="cursor-pointer text-xs font-semibold text-amber-800">
                        Edited by {row.lastEditedByName || 'Unknown'} · {new Date(row.lastEditedAt).toLocaleString()}
                      </summary>
                      <div className="mt-2 space-y-2">
                        {(row.editHistory || []).slice(-10).reverse().map((entry, index) => (
                          <div key={`${entry.editedAt}-${index}`} className="text-xs text-slate-700">
                            <p className="font-medium">{entry.editedByName || 'Unknown'} · {entry.editedAt ? new Date(entry.editedAt).toLocaleString() : ''}</p>
                            <ul className="mt-1 space-y-1">
                              {Object.entries(entry.changes || {}).map(([field, change]) => (
                                <li key={field} className="rounded bg-white px-2 py-1">
                                  <span className="font-medium">{AUDIT_LABELS[field] || field}</span>
                                  <span className="mx-1 text-slate-400">:</span>
                                  <span className="text-red-700">{auditValue(field, change.before)}</span>
                                  <span className="mx-1 text-slate-400">→</span>
                                  <span className="font-semibold text-emerald-700">{auditValue(field, change.after)}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
                <p className={`shrink-0 text-sm font-semibold ${row.type === 'expense' ? 'text-red-600' : 'text-emerald-600'}`}>{row.type === 'expense' ? '-' : '+'}{inr(row.amount)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
