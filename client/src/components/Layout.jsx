import { useState } from 'react';
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, HandCoins, Receipt, ListOrdered, CalendarDays, CalendarRange, PieChart, FileSpreadsheet, Settings, MoreHorizontal, LogOut, Plus, IndianRupee } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { Modal } from './UI';

const NAV = [
  ['/', 'Dashboard', LayoutDashboard],
  ['/add-money', 'Add Money', HandCoins],
  ['/add-expense', 'Add Expense', Receipt],
  ['/transactions', 'All Transactions', ListOrdered],
  ['/reports/daily', 'Daily Report', CalendarDays],
  ['/reports/monthly', 'Monthly Report', CalendarRange],
  ['/reports/category', 'Category Report', PieChart],
  ['/excel', 'Excel Download', FileSpreadsheet],
  ['/settings', 'Settings', Settings],
];
const ADMIN_NAV = [
  ['/', 'Dashboard', LayoutDashboard],
  ['/employees', 'Employees', ListOrdered],
  ['/settings', 'Settings', Settings],
];

export default function Layout() {
  const { user, logout } = useAuth();
  const nav = user.role === 'admin' ? ADMIN_NAV : NAV;
  const [more, setMore] = useState(false);
  const loc = useLocation();
  const bottom = (to, label, Icon) => (
    <NavLink to={to} end={to === '/'} className={({ isActive }) => `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${isActive ? 'text-blue-700' : 'text-slate-500'}`}>
      <Icon size={21} />{label}
    </NavLink>
  );
  const moreActive = nav.slice(4).some(([to]) => loc.pathname.startsWith(to));

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-ink-900 text-slate-300 md:flex print:hidden">
        <div className="flex items-center gap-3 px-5 py-6">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-blue-600 text-white"><IndianRupee size={19} /></span>
          <div className="min-w-0"><p className="truncate font-semibold text-white">{user.companyName}</p><p className="text-xs text-slate-400">{user.role === 'admin' ? 'Administrator' : 'Employee'} dashboard</p></div>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
          {nav.map(([to, label, Icon]) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${isActive ? 'bg-blue-600 text-white' : 'hover:bg-white/10 hover:text-white'}`}>
              <Icon size={18} />{label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 p-4">
          <p className="truncate text-sm text-white">{user.name}</p>
          <p className="truncate text-xs text-slate-400">{user.email}</p>
          <button onClick={logout} className="mt-3 flex items-center gap-2 text-sm text-slate-300 hover:text-white"><LogOut size={16} />Sign out</button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-20 flex items-center gap-3 bg-ink-900 px-4 py-3 text-white md:hidden print:hidden">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-600"><IndianRupee size={17} /></span>
        <p className="truncate font-semibold">{user.companyName}</p>
      </header>

      <main className="px-4 pb-28 pt-5 md:ml-64 md:px-8 md:pb-10 md:pt-8 print:m-0 print:p-0">
        <div className="mx-auto max-w-6xl"><Outlet /></div>
      </main>

      {/* Mobile bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex items-end border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden print:hidden">
        {bottom('/', 'Home', LayoutDashboard)}
        {user.role === 'employee' ? <>
          {bottom('/add-money', 'Add Money', HandCoins)}
          <Link to="/add-expense" aria-label="Add expense" className="-mt-5 mb-2 grid h-14 w-14 shrink-0 place-items-center rounded-full bg-red-600 text-white shadow-lg ring-4 ring-white"><Plus size={26} /></Link>
          {bottom('/transactions', 'History', ListOrdered)}
          <button onClick={() => setMore(true)} className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${moreActive ? 'text-blue-700' : 'text-slate-500'}`}><MoreHorizontal size={21} />More</button>
        </> : <>
          {bottom('/employees', 'Employees', ListOrdered)}
          <button onClick={logout} className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-slate-500"><LogOut size={21} />Sign out</button>
        </>}
      </nav>

      {more && (
        <Modal title="More" onClose={() => setMore(false)}>
          <div className="grid gap-1">
            {nav.slice(4).map(([to, label, Icon]) => (
              <Link key={to} to={to} onClick={() => setMore(false)} className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"><Icon size={19} />{label}</Link>
            ))}
            <button onClick={logout} className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-red-600 hover:bg-red-50"><LogOut size={19} />Sign out</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
